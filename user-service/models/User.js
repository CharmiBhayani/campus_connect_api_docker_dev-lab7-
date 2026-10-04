const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true },
    email:    { type: String, required: true, trim: true, unique: true },
    course:   { type: String, required: true, trim: true },
    semester: { type: Number, required: true, min: 1 },
    role:     { type: String, enum: ["student", "faculty", "admin"], default: "student" }
  },
  { versionKey: false, timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
