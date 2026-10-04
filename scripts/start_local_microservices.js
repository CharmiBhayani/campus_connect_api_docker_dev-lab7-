/**
 * Local Microservices & API Gateway Test Harness
 * Runs User Service (3001), Product Service (3002), Order Service (3003)
 * with lightweight fast memory persistence, enabling instant end-to-end testing
 * without needing Docker Desktop or downloading heavy MongoDB binaries.
 */
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");

// In-memory data stores
const users = [
  { _id: "670100000000000000000001", name: "Alice Kumar", email: "alice@campus.edu", course: "Computer Science", semester: 3, role: "student" }
];
const products = [
  { _id: "670200000000000000000001", name: "Distributed Systems Principles", description: "SOA & Gateway Guide", category: "Books", price: 599.0, stock: 25 }
];
const orders = [];

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

// ── User Service (Port 3001) ────────────────────────────────────────────────
const userService = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:3001");
  const pathname = url.pathname;

  if (req.method === "GET" && pathname === "/") {
    return json(res, 200, { service: "user-service", status: "running", port: 3001 });
  }
  if (req.method === "GET" && pathname === "/users") {
    return json(res, 200, users);
  }
  if (req.method === "POST" && pathname === "/users") {
    const data = await parseBody(req);
    const newUser = {
      _id: "6701" + Date.now().toString(16).padStart(20, "0").slice(-20),
      ...data,
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    return json(res, 201, newUser);
  }
  if (pathname.startsWith("/users/")) {
    const id = pathname.replace("/users/", "");
    const user = users.find((u) => u._id === id);
    if (!user) return json(res, 404, { message: "User not found" });

    if (req.method === "GET") return json(res, 200, user);
    if (req.method === "PUT") {
      const data = await parseBody(req);
      Object.assign(user, data);
      return json(res, 200, user);
    }
    if (req.method === "DELETE") {
      const idx = users.indexOf(user);
      if (idx > -1) users.splice(idx, 1);
      res.writeHead(204);
      return res.end();
    }
  }
  json(res, 404, { message: "Endpoint not found" });
});

// ── Product Service (Port 3002) ─────────────────────────────────────────────
const productService = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:3002");
  const pathname = url.pathname;

  if (req.method === "GET" && pathname === "/") {
    return json(res, 200, { service: "product-service", status: "running", port: 3002 });
  }
  if (req.method === "GET" && pathname === "/products") {
    return json(res, 200, products);
  }
  if (req.method === "POST" && pathname === "/products") {
    const data = await parseBody(req);
    const newProduct = {
      _id: "6702" + Date.now().toString(16).padStart(20, "0").slice(-20),
      ...data,
      createdAt: new Date().toISOString()
    };
    products.push(newProduct);
    return json(res, 201, newProduct);
  }
  if (pathname.startsWith("/products/")) {
    const id = pathname.replace("/products/", "");
    const prod = products.find((p) => p._id === id);
    if (!prod) return json(res, 404, { message: "Product not found" });

    if (req.method === "GET") return json(res, 200, prod);
    if (req.method === "PUT") {
      const data = await parseBody(req);
      Object.assign(prod, data);
      return json(res, 200, prod);
    }
    if (req.method === "DELETE") {
      const idx = products.indexOf(prod);
      if (idx > -1) products.splice(idx, 1);
      res.writeHead(204);
      return res.end();
    }
  }
  json(res, 404, { message: "Endpoint not found" });
});

// ── Order Service (Port 3003) ───────────────────────────────────────────────
const orderService = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:3003");
  const pathname = url.pathname;

  if (req.method === "GET" && pathname === "/") {
    return json(res, 200, { service: "order-service", status: "running", port: 3003 });
  }
  if (req.method === "GET" && pathname === "/orders") {
    return json(res, 200, orders);
  }
  if (req.method === "POST" && pathname === "/orders") {
    const { userId, items } = await parseBody(req);
    if (!userId) return json(res, 400, { message: "userId is required" });
    if (!Array.isArray(items) || items.length === 0)
      return json(res, 400, { message: "items must be a non-empty array" });

    // Validate user from User Service memory
    const user = users.find((u) => u._id === userId);
    if (!user) return json(res, 404, { message: `User ${userId} not found` });

    let totalAmount = 0;
    const resolvedItems = [];
    for (const it of items) {
      const product = products.find((p) => p._id === it.productId);
      if (!product) return json(res, 404, { message: `Product ${it.productId} not found` });
      const qty = Number(it.quantity || 1);
      resolvedItems.push({
        productId: product._id,
        name: product.name,
        price: product.price,
        quantity: qty
      });
      totalAmount += product.price * qty;
    }

    const order = {
      _id: "6703" + Date.now().toString(16).padStart(20, "0").slice(-20),
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
      items: resolvedItems,
      totalAmount: Math.round(totalAmount * 100) / 100,
      createdAt: new Date().toISOString()
    };
    orders.push(order);
    return json(res, 201, order);
  }
  if (pathname.startsWith("/orders/")) {
    const id = pathname.replace("/orders/", "");
    const ord = orders.find((o) => o._id === id);
    if (!ord) return json(res, 404, { message: "Order not found" });
    return json(res, 200, ord);
  }
  json(res, 404, { message: "Endpoint not found" });
});

async function start() {
  await Promise.all([
    new Promise((r) => userService.listen(3001, r)),
    new Promise((r) => productService.listen(3002, r)),
    new Promise((r) => orderService.listen(3003, r))
  ]);

  console.log("==================================================");
  console.log("  Local Microservices Test Bed Started!           ");
  console.log("  - User Service:    http://localhost:3001       ");
  console.log("  - Product Service: http://localhost:3002       ");
  console.log("  - Order Service:   http://localhost:3003       ");
  console.log("==================================================");

  // Start API Gateway on 8000
  const gateway = spawn("node", ["server.js"], {
    cwd: path.resolve(__dirname, "../api-gateway"),
    env: {
      ...process.env,
      PORT: "8000",
      USER_SERVICE_URL: "http://localhost:3001",
      PRODUCT_SERVICE_URL: "http://localhost:3002",
      ORDER_SERVICE_URL: "http://localhost:3003"
    },
    stdio: "inherit"
  });

  process.on("SIGINT", () => {
    gateway.kill();
    userService.close();
    productService.close();
    orderService.close();
    process.exit(0);
  });
}

if (require.main === module) {
  start();
}

module.exports = {
  userService,
  productService,
  orderService,
  users,
  products,
  orders
};
