const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true },
    name:      { type: String, required: true },
    price:     { type: Number, required: true },
    quantity:  { type: Number, required: true, min: 1 }
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    userId:      { type: String, required: true },
    userName:    { type: String, required: true },
    userEmail:   { type: String, required: true },
    items:       { type: [orderItemSchema], required: true },
    totalAmount: { type: Number, required: true, min: 0 },
    status:      { type: String, enum: ["pending", "confirmed", "cancelled"], default: "pending" }
  },
  { versionKey: false, timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
