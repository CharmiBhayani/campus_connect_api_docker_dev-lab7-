require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const mongoose = require("mongoose");
const User     = require("./models/User");

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

function validate(data) {
  const e = [];
  if (!data.name  || !String(data.name).trim())  e.push("name is required");
  if (!data.email || !String(data.email).trim())  e.push("email is required");
  else if (!String(data.email).includes("@"))     e.push("email must be valid");
  if (!data.course || !String(data.course).trim()) e.push("course is required");
  if (data.semester == null) e.push("semester is required");
  else if (!Number.isInteger(Number(data.semester)) || Number(data.semester) < 1)
    e.push("semester must be a positive integer");
  return e;
}

app.get("/", (_req, res) => res.json({ service: "user-service", status: "running", port: PORT }));

app.get("/users", async (_req, res) => {
  try {
    const users = await User.find().sort({ createdAt: 1 }).lean();
    res.json(users);
  } catch (err) { console.error(err); res.status(500).json({ message: "Internal server error" }); }
});

app.get("/users/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    if (err.name === "CastError") return res.status(404).json({ message: "User not found" });
    console.error(err); res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/users", async (req, res) => {
  const errors = validate(req.body);
  if (errors.length) return res.status(400).json({ message: "Validation failed", errors });
  try {
    const { name, email, course, semester, role } = req.body;
    const user = await User.create({ name, email, course, semester: Number(semester), role });
    res.status(201).json(user.toObject());
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: "Email already exists" });
    if (err.name === "ValidationError") return res.status(400).json({ message: err.message });
    console.error(err); res.status(500).json({ message: "Internal server error" });
  }
});

app.put("/users/:id", async (req, res) => {
  const errors = validate(req.body);
  if (errors.length) return res.status(400).json({ message: "Validation failed", errors });
  try {
    const { name, email, course, semester, role } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, email, course, semester: Number(semester), role },
      { new: true, runValidators: true }
    ).lean();
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    if (err.name === "CastError") return res.status(404).json({ message: "User not found" });
    if (err.code === 11000) return res.status(400).json({ message: "Email already exists" });
    if (err.name === "ValidationError") return res.status(400).json({ message: err.message });
    console.error(err); res.status(500).json({ message: "Internal server error" });
  }
});

app.delete("/users/:id", async (req, res) => {
  try {
    const deleted = await User.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "User not found" });
    res.status(204).send();
  } catch (err) {
    if (err.name === "CastError") return res.status(404).json({ message: "User not found" });
    console.error(err); res.status(500).json({ message: "Internal server error" });
  }
});

async function start() {
  const uri = process.env.MONGODB_URI;
  let connected = false;
  if (uri && !uri.includes("<")) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
      console.log("[user-service] Connected to MongoDB at " + uri);
      connected = true;
    } catch (err) {
      console.warn("[user-service] MongoDB connect failed (" + err.message + "), falling back to in-memory MongoDB...");
    }
  }
  if (!connected) {
    try {
      const { MongoMemoryServer } = require("mongodb-memory-server");
      const mem = await MongoMemoryServer.create();
      await mongoose.connect(mem.getUri());
      console.log("[user-service] Connected to in-memory MongoDB");
    } catch (memErr) {
      console.error("[user-service] In-memory MongoDB failed:", memErr.message);
      process.exit(1);
    }
  }
  app.listen(PORT, () => console.log("[user-service] Listening on port " + PORT));
}

start();
