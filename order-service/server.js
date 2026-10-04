require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const mongoose = require("mongoose");
const fetch    = require("node-fetch");
const Order    = require("./models/Order");

const app  = express();
const PORT = process.env.PORT || 3003;
const USER_SERVICE_URL    = process.env.USER_SERVICE_URL    || "http://user-service:3001";
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || "http://product-service:3002";
const FETCH_TIMEOUT_MS    = parseInt(process.env.FETCH_TIMEOUT_MS || "5000", 10);

app.use(cors());
app.use(express.json());

// ── inter-service helpers ─────────────────────────────────────────────────────
async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getUser(userId) {
  let res;
  try {
    res = await fetchWithTimeout(USER_SERVICE_URL + "/users/" + userId, FETCH_TIMEOUT_MS);
  } catch (err) {
    const reason = err.name === "AbortError" ? "timeout" : err.message;
    throw { status: 503, message: "User Service unavailable (" + reason + ")" };
  }
  if (res.status === 404) throw { status: 404, message: "User " + userId + " not found" };
  if (!res.ok) throw { status: 502, message: "User Service returned an unexpected error" };
  return res.json();
}

async function getProduct(productId) {
  let res;
  try {
    res = await fetchWithTimeout(PRODUCT_SERVICE_URL + "/products/" + productId, FETCH_TIMEOUT_MS);
  } catch (err) {
    const reason = err.name === "AbortError" ? "timeout" : err.message;
    throw { status: 503, message: "Product Service unavailable (" + reason + ")" };
  }
  if (res.status === 404) throw { status: 404, message: "Product " + productId + " not found" };
  if (!res.ok) throw { status: 502, message: "Product Service returned an unexpected error" };
  return res.json();
}

// ── routes ───────────────────────────────────────────────────────────────────
app.get("/", (_req, res) => res.json({
  service: "order-service",
  status: "running",
  port: PORT,
  userServiceUrl: USER_SERVICE_URL,
  productServiceUrl: PRODUCT_SERVICE_URL
}));

app.get("/orders", async (_req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 }).lean();
    res.json(orders);
  } catch (err) { console.error(err); res.status(500).json({ message: "Internal server error" }); }
});

app.get("/orders/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json(order);
  } catch (err) {
    if (err.name === "CastError") return res.status(404).json({ message: "Order not found" });
    console.error(err); res.status(500).json({ message: "Internal server error" });
  }
});

// POST /orders  Body: { userId, items: [{ productId, quantity }] }
app.post("/orders", async (req, res) => {
  const { userId, items } = req.body;
  if (!userId) return res.status(400).json({ message: "userId is required" });
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ message: "items must be a non-empty array" });
  for (const it of items) {
    if (!it.productId) return res.status(400).json({ message: "Each item needs productId" });
    if (!it.quantity || Number(it.quantity) < 1)
      return res.status(400).json({ message: "Each item needs quantity >= 1" });
  }

  try {
    console.log("[order-service] Validating user " + userId + " at " + USER_SERVICE_URL);
    const user = await getUser(userId);

    const resolvedItems = [];
    let totalAmount = 0;
    for (const it of items) {
      console.log("[order-service] Validating product " + it.productId + " at " + PRODUCT_SERVICE_URL);
      const product = await getProduct(it.productId);
      const qty = Number(it.quantity);
      resolvedItems.push({ productId: String(product._id), name: product.name, price: product.price, quantity: qty });
      totalAmount += product.price * qty;
    }

    const order = await Order.create({
      userId:      String(user._id),
      userName:    user.name,
      userEmail:   user.email,
      items:       resolvedItems,
      totalAmount: Math.round(totalAmount * 100) / 100
    });
    res.status(201).json(order.toObject());
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error(err); res.status(500).json({ message: "Internal server error" });
  }
});

// ── startup ──────────────────────────────────────────────────────────────────
async function start() {
  const uri = process.env.MONGODB_URI;
  let connected = false;
  if (uri && !uri.includes("<")) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
      console.log("[order-service] Connected to MongoDB at " + uri);
      connected = true;
    } catch (err) {
      console.warn("[order-service] MongoDB connect failed (" + err.message + "), falling back to in-memory MongoDB...");
    }
  }
  if (!connected) {
    try {
      const { MongoMemoryServer } = require("mongodb-memory-server");
      const mem = await MongoMemoryServer.create();
      await mongoose.connect(mem.getUri());
      console.log("[order-service] Connected to in-memory MongoDB");
    } catch (memErr) {
      console.error("[order-service] In-memory MongoDB failed:", memErr.message);
      process.exit(1);
    }
  }
  app.listen(PORT, () => {
    console.log("[order-service] Listening on port " + PORT);
    console.log("  USER_SERVICE_URL    = " + USER_SERVICE_URL);
    console.log("  PRODUCT_SERVICE_URL = " + PRODUCT_SERVICE_URL);
  });
}

start();
