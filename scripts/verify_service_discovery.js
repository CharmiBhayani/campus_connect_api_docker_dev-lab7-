/**
 * Part B Service Discovery Proof:
 * Proves that changing a service's URL/port only via configuration (environment variable)
 * redirects the API Gateway routing without touching ANY application code.
 * (Uses native Node http and fetch - zero external dependencies required)
 */
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");

async function runProof() {
  console.log("================================================================================");
  console.log("  LAB 7 - PART B: SERVICE DISCOVERY CONFIGURATION PROOF TEST                    ");
  console.log("================================================================================");

  // Step 1: Start a mock User Service on new port 4001 using native Node.js http
  const NEW_PORT = 4001;
  const mockServer = http.createServer((req, res) => {
    if (req.url === "/users" || req.url.startsWith("/users/")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "success",
        source: "Dynamic/Migrated User Service",
        port: NEW_PORT,
        message: "Gateway successfully reached User Service at reconfigured location!",
        users: [{ id: "mock-1", name: "Discovered User", email: "discovery@campus.edu" }]
      }));
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  });

  await new Promise((resolve) => mockServer.listen(NEW_PORT, resolve));
  console.log(`[Proof Step 1] Started mock User Service on NEW port: http://localhost:${NEW_PORT}`);

  // Step 2: Spawn API Gateway with USER_SERVICE_URL configured to point to NEW_PORT
  // NO code modification made to server.js or gateway logic!
  console.log(`[Proof Step 2] Launching API Gateway with config: USER_SERVICE_URL=http://localhost:${NEW_PORT}`);
  const gatewayProcess = spawn("node", ["server.js"], {
    cwd: path.resolve(__dirname, "../api-gateway"),
    env: {
      ...process.env,
      PORT: "8000",
      USER_SERVICE_URL: `http://localhost:${NEW_PORT}`
    }
  });

  gatewayProcess.stdout.on("data", (data) => {
    const line = data.toString().trim();
    if (line) console.log(`  [Gateway stdout] ${line}`);
  });

  gatewayProcess.stderr.on("data", (data) => {
    const line = data.toString().trim();
    if (line && !line.includes("DeprecationWarning")) console.error(`  [Gateway stderr] ${line}`);
  });

  // Wait for gateway to start
  await new Promise((r) => setTimeout(r, 2000));

  // Step 3: Send request to Gateway /users endpoint
  console.log("[Proof Step 3] Sending GET request to API Gateway: http://localhost:8000/users");
  try {
    const res = await fetch("http://localhost:8000/users");
    const json = await res.json();
    console.log(`[Proof Step 4] Response received via Gateway! HTTP Status: ${res.status}`);
    console.log("  Response payload:", JSON.stringify(json, null, 2));

    if (res.status === 200 && json.port === NEW_PORT) {
      console.log("================================================================================");
      console.log("  >>> SUCCESS: SERVICE DISCOVERY VERIFICATION PASSED! <<<                      ");
      console.log(`  Gateway successfully routed /users to new location :${NEW_PORT} purely via configuration.`);
      console.log("================================================================================");
    } else {
      console.error(">>> FAILURE: Gateway did not route to the reconfigured port! <<<");
    }
  } catch (err) {
    console.error("[Proof Step 4] Error during gateway request:", err);
  } finally {
    gatewayProcess.kill();
    mockServer.close();
    process.exit(0);
  }
}

runProof();
