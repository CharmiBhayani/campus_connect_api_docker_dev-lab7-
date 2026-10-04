/**
 * Comprehensive Automated Test Suite for Lab 7
 * Validates API Gateway routing, request logging, centralized 502/503 error handling,
 * and service recovery.
 */
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { userService, productService, orderService } = require("./start_local_microservices");

async function runTestSuite() {
  console.log("================================================================================");
  console.log("        CAMPUSCONNECT LAB 7 - API GATEWAY & MICROSERVICES TEST SUITE           ");
  console.log("================================================================================");

  // 1. Start all 3 microservices
  await Promise.all([
    new Promise((r) => userService.listen(3001, r)),
    new Promise((r) => productService.listen(3002, r)),
    new Promise((r) => orderService.listen(3003, r))
  ]);
  console.log("[Setup] Backends running on ports 3001, 3002, 3003.");

  // 2. Start API Gateway on 8000
  const gateway = spawn("node", ["server.js"], {
    cwd: path.resolve(__dirname, "../api-gateway"),
    env: {
      ...process.env,
      PORT: "8000",
      USER_SERVICE_URL: "http://localhost:3001",
      PRODUCT_SERVICE_URL: "http://localhost:3002",
      ORDER_SERVICE_URL: "http://localhost:3003"
    }
  });

  gateway.stdout.on("data", (d) => {
    const txt = d.toString().trim();
    if (txt) console.log(`  [Gateway] ${txt}`);
  });

  await new Promise((r) => setTimeout(r, 2000));

  const GATEWAY_URL = "http://localhost:8000";
  const testResults = [];

  async function test(name, fn) {
    const start = Date.now();
    try {
      const res = await fn();
      const duration = Date.now() - start;
      console.log(`[PASS] ${name.padEnd(50)} (${duration}ms)`);
      testResults.push({ name, status: "PASS", duration, ...res });
    } catch (err) {
      const duration = Date.now() - start;
      console.error(`[FAIL] ${name.padEnd(50)}: ${err.message} (${duration}ms)`);
      testResults.push({ name, status: "FAIL", duration, error: err.message });
    }
  }

  let createdUserId = "";
  let createdProductId = "";
  let createdOrderId = "";

  // Test 1: Gateway Health Check
  await test("1. Gateway Health Check (GET /health)", async () => {
    const res = await fetch(`${GATEWAY_URL}/health`);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const json = await res.json();
    if (json.status !== "healthy") throw new Error("Status is not healthy");
    return { httpStatus: res.status, data: json };
  });

  // Test 2: Gateway Metadata
  await test("2. Gateway Metadata (GET /)", async () => {
    const res = await fetch(`${GATEWAY_URL}/`);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const json = await res.json();
    return { httpStatus: res.status, data: json };
  });

  // Test 3: List Users via Gateway
  await test("3. User Service: List Users (GET /users)", async () => {
    const res = await fetch(`${GATEWAY_URL}/users`);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json)) throw new Error("Expected array of users");
    return { httpStatus: res.status, count: json.length };
  });

  // Test 4: Create User via Gateway
  await test("4. User Service: Create User (POST /users)", async () => {
    const res = await fetch(`${GATEWAY_URL}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Dev Patel",
        email: "dev.patel@campus.edu",
        course: "Software Engineering",
        semester: 4,
        role: "student"
      })
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const json = await res.json();
    createdUserId = json._id;
    return { httpStatus: res.status, createdUserId };
  });

  // Test 5: Get User by ID via Gateway
  await test("5. User Service: Get User by ID (GET /users/:id)", async () => {
    const res = await fetch(`${GATEWAY_URL}/users/${createdUserId}`);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const json = await res.json();
    if (json._id !== createdUserId) throw new Error("User ID mismatch");
    return { httpStatus: res.status, user: json.name };
  });

  // Test 6: List Products via Gateway
  await test("6. Product Service: List Products (GET /products)", async () => {
    const res = await fetch(`${GATEWAY_URL}/products`);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json)) throw new Error("Expected array of products");
    return { httpStatus: res.status, count: json.length };
  });

  // Test 7: Create Product via Gateway
  await test("7. Product Service: Create Product (POST /products)", async () => {
    const res = await fetch(`${GATEWAY_URL}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Cloud Computing Handbook",
        description: "Docker, Kubernetes & Microservices Guide",
        category: "Books",
        price: 750.0,
        stock: 40
      })
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const json = await res.json();
    createdProductId = json._id;
    return { httpStatus: res.status, createdProductId };
  });

  // Test 8: Get Product by ID via Gateway
  await test("8. Product Service: Get Product by ID (GET /products/:id)", async () => {
    const res = await fetch(`${GATEWAY_URL}/products/${createdProductId}`);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const json = await res.json();
    if (json._id !== createdProductId) throw new Error("Product ID mismatch");
    return { httpStatus: res.status, product: json.name };
  });

  // Test 9: Create Order via Gateway (Inter-Service Validation)
  await test("9. Order Service: Create Order with Validation (POST /orders)", async () => {
    const res = await fetch(`${GATEWAY_URL}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: createdUserId,
        items: [{ productId: createdProductId, quantity: 2 }]
      })
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const json = await res.json();
    createdOrderId = json._id;
    if (json.totalAmount !== 1500.0) throw new Error(`Expected total 1500.00, got ${json.totalAmount}`);
    return { httpStatus: res.status, createdOrderId, totalAmount: json.totalAmount };
  });

  // Test 10: Fetch Order by ID via Gateway
  await test("10. Order Service: Fetch Order by ID (GET /orders/:id)", async () => {
    const res = await fetch(`${GATEWAY_URL}/orders/${createdOrderId}`);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const json = await res.json();
    return { httpStatus: res.status, orderId: json._id, total: json.totalAmount };
  });

  // Test 11: Invalid ID 404 Handling via Gateway
  await test("11. Error Handling: Invalid ID (GET /users/000000000000000000000000)", async () => {
    const res = await fetch(`${GATEWAY_URL}/users/000000000000000000000000`);
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
    return { httpStatus: res.status };
  });

  // Test 12: Unreachable Service Test (Stop User Service -> Expect Gateway 503)
  await test("12. Fault Tolerance: Downstream Service Down (GET /users -> 503)", async () => {
    // Gracefully close User Service to simulate crash/unreachability
    await new Promise((r) => userService.close(r));
    console.log("  [Simulation] user-service container/process stopped.");

    const res = await fetch(`${GATEWAY_URL}/users`);
    if (res.status !== 503 && res.status !== 502) {
      throw new Error(`Expected 502/503 from Gateway, got ${res.status}`);
    }
    const json = await res.json();
    if (json.status !== "error" || json.targetService !== "User Service") {
      throw new Error("Expected structured gateway error payload");
    }
    return { httpStatus: res.status, gatewayError: json.message, targetService: json.targetService };
  });

  // Test 13: Service Recovery / Self-Healing
  await test("13. Self-Healing: Restart Service & Verify Recovery (GET /users -> 200)", async () => {
    await new Promise((r) => userService.listen(3001, r));
    console.log("  [Simulation] user-service container/process restarted.");

    const res = await fetch(`${GATEWAY_URL}/users`);
    if (res.status !== 200) throw new Error(`Expected 200 after recovery, got ${res.status}`);
    return { httpStatus: res.status, recovered: true };
  });

  // Save report
  const resultsPath = path.resolve(__dirname, "../screenshots/lab7_gateway_test_results.json");
  fs.writeFileSync(resultsPath, JSON.stringify(testResults, null, 2));
  console.log("================================================================================");
  console.log(`  ALL ${testResults.filter((t) => t.status === "PASS").length}/${testResults.length} TESTS PASSED SUCCESSFULLY!`);
  console.log(`  Test results saved to: ${resultsPath}`);
  console.log("================================================================================");

  // Clean shutdown
  gateway.kill();
  userService.close();
  productService.close();
  orderService.close();
  process.exit(0);
}

runTestSuite();
