require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const mongoose = require("mongoose");
const User     = require("./models/User");

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

let memUsers = [
  {
    _id: "670100000000000000000001",
    name: "Alice Kumar",
    email: "alice@campus.edu",
    course: "Computer Science",
    semester: 3,
    role: "student",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

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

app.get("/", (_req, res) => res.json({
  service: "user-service",
  status: "running",
  port: PORT,
  database: isDbConnected() ? "mongodb" : "in-memory-fallback"
}));

app.get("/users", async (_req, res) => {
  try {
    if (isDbConnected()) {
      const users = await User.find().sort({ createdAt: 1 }).lean();
      return res.json(users);
    }
    res.json(memUsers);
  } catch (err) {
    console.error("[user-service] GET /users error:", err.message);
    res.json(memUsers);
  }
});

app.get("/users/:id", async (req, res) => {
  try {
    if (isDbConnected()) {
      const user = await User.findById(req.params.id).lean();
      if (!user) return res.status(404).json({ message: "User not found" });
      return res.json(user);
    }
    const user = memUsers.find(u => String(u._id) === String(req.params.id));
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    if (err.name === "CastError") return res.status(404).json({ message: "User not found" });
    const user = memUsers.find(u => String(u._id) === String(req.params.id));
    if (user) return res.json(user);
    res.status(404).json({ message: "User not found" });
  }
});

app.post("/users", async (req, res) => {
  const errors = validate(req.body);
  if (errors.length) return res.status(400).json({ message: "Validation failed", errors });

  const { name, email, course, semester, role } = req.body;

  try {
    if (isDbConnected()) {
      const user = await User.create({ name, email, course, semester: Number(semester), role: role || "student" });
      return res.status(201).json(user.toObject());
    }
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: "Email already exists" });
    if (err.name === "ValidationError") return res.status(400).json({ message: err.message });
    console.error("[user-service] DB save failed, falling back to memory:", err.message);
  }

  if (memUsers.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ message: "Email already exists" });
  }

  const newUser = {
    _id: new mongoose.Types.ObjectId().toString(),
    name: name.trim(),
    email: email.trim(),
    course: course.trim(),
    semester: Number(semester),
    role: role || "student",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  memUsers.push(newUser);
  res.status(201).json(newUser);
});

app.put("/users/:id", async (req, res) => {
  const errors = validate(req.body);
  if (errors.length) return res.status(400).json({ message: "Validation failed", errors });

  const { name, email, course, semester, role } = req.body;

  try {
    if (isDbConnected()) {
      const user = await User.findByIdAndUpdate(
        req.params.id,
        { name, email, course, semester: Number(semester), role },
        { new: true, runValidators: true }
      ).lean();
      if (!user) return res.status(404).json({ message: "User not found" });
      return res.json(user);
    }
  } catch (err) {
    if (err.name === "CastError") return res.status(404).json({ message: "User not found" });
    if (err.code === 11000) return res.status(400).json({ message: "Email already exists" });
  }

  const idx = memUsers.findIndex(u => String(u._id) === String(req.params.id));
  if (idx === -1) return res.status(404).json({ message: "User not found" });

  memUsers[idx] = {
    ...memUsers[idx],
    name: name.trim(),
    email: email.trim(),
    course: course.trim(),
    semester: Number(semester),
    role: role || memUsers[idx].role,
    updatedAt: new Date().toISOString()
  };
  res.json(memUsers[idx]);
});

app.delete("/users/:id", async (req, res) => {
  try {
    if (isDbConnected()) {
      const deleted = await User.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ message: "User not found" });
      return res.status(204).send();
    }
  } catch (err) {
    if (err.name === "CastError") return res.status(404).json({ message: "User not found" });
  }

  const idx = memUsers.findIndex(u => String(u._id) === String(req.params.id));
  if (idx === -1) return res.status(404).json({ message: "User not found" });
  memUsers.splice(idx, 1);
  res.status(204).send();
});

async function start() {
  const uri = process.env.MONGODB_URI;
  if (uri && !uri.includes("<") && !uri.includes("placeholder")) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      console.log("[user-service] Connected to MongoDB at " + uri.replace(/:([^:@]{3,})@/, ":***@"));
    } catch (err) {
      console.warn("[user-service] MongoDB connect warning: " + err.message + " -> running in in-memory mode.");
    }
  } else {
    console.log("[user-service] No valid MONGODB_URI provided. Running in in-memory mode.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log("[user-service] Listening on port " + PORT);
  });
}

start();
