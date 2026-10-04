require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware");
const { loadServiceRegistry } = require("./config/serviceRegistry");

const app = express();
const PORT = process.env.PORT || 8000;

// Load externalized service discovery configuration (Part B)
const serviceRegistry = loadServiceRegistry();

// Enable CORS for all external incoming clients
app.use(cors());

// ── Gateway Request Logging Middleware ──────────────────────────────────────────
// Logs incoming method, path, resolved target service, status, and latency
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // Resolve target service from route prefix
  let targetService = "api-gateway (local)";
  for (const [key, svc] of Object.entries(serviceRegistry)) {
    if (req.originalUrl === svc.prefix || req.originalUrl.startsWith(svc.prefix + "/") || req.originalUrl.startsWith(svc.prefix + "?")) {
      targetService = `${svc.name} (${svc.url})`;
      break;
    }
  }

  res.on("finish", () => {
    const duration = Date.now() - startTime;
    console.log(
      `[GATEWAY LOG] ${new Date().toISOString()} | ${req.method.padEnd(6)} ${req.originalUrl.padEnd(25)} ` +
      `-> Target: ${targetService.padEnd(42)} | Status: ${res.statusCode} | ${duration}ms`
    );
  });

  next();
});

// ── Native Gateway Endpoints (No Proxying) ──────────────────────────────────
// Health check endpoint reports gateway status & active service discovery routing table
app.get("/health", (_req, res) => {
  res.json({
    status: "healthy",
    gateway: "api-gateway",
    version: "1.0.0",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    serviceDiscovery: Object.entries(serviceRegistry).reduce((acc, [key, svc]) => {
      acc[key] = {
        name: svc.name,
        prefix: svc.prefix,
        targetUrl: svc.url
      };
      return acc;
    }, {})
  });
});

// Root metadata endpoint
app.get("/", (_req, res) => {
  res.json({
    gateway: "CampusConnect API Gateway",
    version: "1.0.0",
    status: "active",
    endpoints: {
      health: "/health",
      users: "/users",
      products: "/products",
      orders: "/orders"
    },
    documentation: "Single entry point for CampusConnect microservices. Internal services are not exposed externally."
  });
});

// ── Centralized Error Handler for Proxies ──────────────────────────────────────
function createProxyErrorHandler(serviceName, targetUrl) {
  return function handleProxyError(err, req, res) {
    console.error(`[GATEWAY ERROR] Failed to proxy ${req.method} ${req.originalUrl} to ${serviceName} (${targetUrl}): ${err.message}`);

    if (res.headersSent) {
      return;
    }

    let statusCode = 502; // Bad Gateway default
    let reason = "Bad Gateway: Downstream service returned an invalid response";

    if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND" || err.code === "EHOSTUNREACH") {
      statusCode = 503;
      reason = `Service Unavailable: ${serviceName} is currently unreachable or stopped.`;
    } else if (err.code === "ETIMEDOUT" || err.code === "ESOCKETTIMEDOUT") {
      statusCode = 504;
      reason = `Gateway Timeout: ${serviceName} did not respond within the expected timeframe.`;
    }

    res.status(statusCode).json({
      status: "error",
      statusCode,
      message: reason,
      gateway: "api-gateway",
      targetService: serviceName,
      targetUrl,
      requestedPath: req.originalUrl,
      errorCode: err.code || "UPSTREAM_ERROR",
      timestamp: new Date().toISOString()
    });
  };
}

// ── Dynamic Reverse Proxy Route Registration ──────────────────────────────────
// Routes and target proxies are constructed dynamically from external configuration (Part B)
console.log("==================================================");
console.log("  CampusConnect API Gateway - Initializing Routes  ");
console.log("==================================================");

const proxyRoutes = [];

Object.entries(serviceRegistry).forEach(([serviceKey, service]) => {
  console.log(`[Service Discovery] Registering route: ${service.prefix}/* -> ${service.url} (${service.name})`);

  const proxyInstance = createProxyMiddleware({
    target: service.url,
    changeOrigin: true,
    proxyTimeout: 10000,
    timeout: 10000,
    on: {
      error: createProxyErrorHandler(service.name, service.url)
    }
  });

  proxyRoutes.push({
    prefix: service.prefix,
    service,
    proxy: proxyInstance
  });
});

console.log("==================================================");

// Route dispatcher that delegates matched prefixes to appropriate target proxies
app.use((req, res, next) => {
  for (const route of proxyRoutes) {
    if (
      req.url === route.prefix ||
      req.url.startsWith(route.prefix + "/") ||
      req.url.startsWith(route.prefix + "?")
    ) {
      return route.proxy(req, res, next);
    }
  }
  next();
});

// ── Catch-all 404 for Unmatched Routes ─────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    status: "error",
    statusCode: 404,
    message: `Cannot ${req.method} ${req.originalUrl} - Route not handled by API Gateway`,
    availableRoutes: ["/health", "/users", "/products", "/orders"]
  });
});

// ── Start API Gateway ─────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`[api-gateway] Server running on http://localhost:${PORT}`);
  console.log(`[api-gateway] Health check available at http://localhost:${PORT}/health`);
});

module.exports = { app, server };
