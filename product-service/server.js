require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const mongoose = require("mongoose");
const Product  = require("./models/Product");

const app  = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

let memProducts = [
  {
    _id: "670200000000000000000001",
    name: "Data Structures Textbook",
    description: "Standard undergraduate textbook",
    category: "Books",
    price: 450.0,
    stock: 20,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

function validate(data) {
  const e = [];
  if (!data.name     || !String(data.name).trim())     e.push("name is required");
  if (!data.category || !String(data.category).trim()) e.push("category is required");
  if (data.price == null) e.push("price is required");
  else if (isNaN(Number(data.price)) || Number(data.price) < 0)
    e.push("price must be a non-negative number");
  if (data.stock != null && (isNaN(Number(data.stock)) || Number(data.stock) < 0))
    e.push("stock must be a non-negative number");
  return e;
}

app.get("/", (_req, res) => res.json({
  service: "product-service",
  status: "running",
  port: PORT,
  database: isDbConnected() ? "mongodb" : "in-memory-fallback"
}));

app.get("/products", async (_req, res) => {
  try {
    if (isDbConnected()) {
      const products = await Product.find().sort({ createdAt: 1 }).lean();
      return res.json(products);
    }
    res.json(memProducts);
  } catch (err) {
    console.error("[product-service] GET /products error:", err.message);
    res.json(memProducts);
  }
});

app.get("/products/:id", async (req, res) => {
  try {
    if (isDbConnected()) {
      const product = await Product.findById(req.params.id).lean();
      if (!product) return res.status(404).json({ message: "Product not found" });
      return res.json(product);
    }
    const product = memProducts.find(p => String(p._id) === String(req.params.id));
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    if (err.name === "CastError") return res.status(404).json({ message: "Product not found" });
    const product = memProducts.find(p => String(p._id) === String(req.params.id));
    if (product) return res.json(product);
    res.status(404).json({ message: "Product not found" });
  }
});

app.post("/products", async (req, res) => {
  const errors = validate(req.body);
  if (errors.length) return res.status(400).json({ message: "Validation failed", errors });

  const { name, description, category, price, stock } = req.body;

  try {
    if (isDbConnected()) {
      const product = await Product.create({
        name, description, category,
        price: Number(price),
        stock: stock != null ? Number(stock) : 0
      });
      return res.status(201).json(product.toObject());
    }
  } catch (err) {
    if (err.name === "ValidationError") return res.status(400).json({ message: err.message });
    console.error("[product-service] DB save failed, falling back to memory:", err.message);
  }

  const newProduct = {
    _id: new mongoose.Types.ObjectId().toString(),
    name: name.trim(),
    description: description || "",
    category: category.trim(),
    price: Number(price),
    stock: stock != null ? Number(stock) : 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  memProducts.push(newProduct);
  res.status(201).json(newProduct);
});

app.put("/products/:id", async (req, res) => {
  const errors = validate(req.body);
  if (errors.length) return res.status(400).json({ message: "Validation failed", errors });

  const { name, description, category, price, stock } = req.body;

  try {
    if (isDbConnected()) {
      const product = await Product.findByIdAndUpdate(
        req.params.id,
        { name, description, category, price: Number(price), stock: Number(stock || 0) },
        { new: true, runValidators: true }
      ).lean();
      if (!product) return res.status(404).json({ message: "Product not found" });
      return res.json(product);
    }
  } catch (err) {
    if (err.name === "CastError") return res.status(404).json({ message: "Product not found" });
    if (err.name === "ValidationError") return res.status(400).json({ message: err.message });
  }

  const idx = memProducts.findIndex(p => String(p._id) === String(req.params.id));
  if (idx === -1) return res.status(404).json({ message: "Product not found" });

  memProducts[idx] = {
    ...memProducts[idx],
    name: name.trim(),
    description: description !== undefined ? description : memProducts[idx].description,
    category: category.trim(),
    price: Number(price),
    stock: stock != null ? Number(stock) : memProducts[idx].stock,
    updatedAt: new Date().toISOString()
  };
  res.json(memProducts[idx]);
});

app.delete("/products/:id", async (req, res) => {
  try {
    if (isDbConnected()) {
      const deleted = await Product.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Product not found" });
      return res.status(204).send();
    }
  } catch (err) {
    if (err.name === "CastError") return res.status(404).json({ message: "Product not found" });
  }

  const idx = memProducts.findIndex(p => String(p._id) === String(req.params.id));
  if (idx === -1) return res.status(404).json({ message: "Product not found" });
  memProducts.splice(idx, 1);
  res.status(204).send();
});

async function start() {
  const uri = process.env.MONGODB_URI;
  if (uri && !uri.includes("<") && !uri.includes("placeholder")) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      console.log("[product-service] Connected to MongoDB at " + uri.replace(/:([^:@]{3,})@/, ":***@"));
    } catch (err) {
      console.warn("[product-service] MongoDB connect warning: " + err.message + " -> running in in-memory mode.");
    }
  } else {
    console.log("[product-service] No valid MONGODB_URI provided. Running in in-memory mode.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log("[product-service] Listening on port " + PORT);
  });
}

start();
