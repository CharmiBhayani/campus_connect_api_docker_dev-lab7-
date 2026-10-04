require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const mongoose = require("mongoose");
const Product  = require("./models/Product");

const app  = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

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

app.get("/", (_req, res) => res.json({ service: "product-service", status: "running", port: PORT }));

app.get("/products", async (_req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: 1 }).lean();
    res.json(products);
  } catch (err) { console.error(err); res.status(500).json({ message: "Internal server error" }); }
});

app.get("/products/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    if (err.name === "CastError") return res.status(404).json({ message: "Product not found" });
    console.error(err); res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/products", async (req, res) => {
  const errors = validate(req.body);
  if (errors.length) return res.status(400).json({ message: "Validation failed", errors });
  try {
    const { name, description, category, price, stock } = req.body;
    const product = await Product.create({
      name, description, category,
      price: Number(price),
      stock: stock != null ? Number(stock) : 0
    });
    res.status(201).json(product.toObject());
  } catch (err) {
    if (err.name === "ValidationError") return res.status(400).json({ message: err.message });
    console.error(err); res.status(500).json({ message: "Internal server error" });
  }
});

app.put("/products/:id", async (req, res) => {
  const errors = validate(req.body);
  if (errors.length) return res.status(400).json({ message: "Validation failed", errors });
  try {
    const { name, description, category, price, stock } = req.body;
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { name, description, category, price: Number(price), stock: Number(stock || 0) },
      { new: true, runValidators: true }
    ).lean();
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    if (err.name === "CastError") return res.status(404).json({ message: "Product not found" });
    if (err.name === "ValidationError") return res.status(400).json({ message: err.message });
    console.error(err); res.status(500).json({ message: "Internal server error" });
  }
});

app.delete("/products/:id", async (req, res) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Product not found" });
    res.status(204).send();
  } catch (err) {
    if (err.name === "CastError") return res.status(404).json({ message: "Product not found" });
    console.error(err); res.status(500).json({ message: "Internal server error" });
  }
});

async function start() {
  const uri = process.env.MONGODB_URI;
  let connected = false;
  if (uri && !uri.includes("<")) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
      console.log("[product-service] Connected to MongoDB at " + uri);
      connected = true;
    } catch (err) {
      console.warn("[product-service] MongoDB connect failed (" + err.message + "), falling back to in-memory MongoDB...");
    }
  }
  if (!connected) {
    try {
      const { MongoMemoryServer } = require("mongodb-memory-server");
      const mem = await MongoMemoryServer.create();
      await mongoose.connect(mem.getUri());
      console.log("[product-service] Connected to in-memory MongoDB");
    } catch (memErr) {
      console.error("[product-service] In-memory MongoDB failed:", memErr.message);
      process.exit(1);
    }
  }
  app.listen(PORT, () => console.log("[product-service] Listening on port " + PORT));
}

start();
