require("dotenv").config();

/**
 * Service Discovery Registry (Configuration-Driven)
 * Externalizes service locations so routing targets can be changed
 * without altering any application or route-handling code.
 */
function loadServiceRegistry() {
  return {
    user: {
      name: "User Service",
      prefix: "/users",
      url: process.env.USER_SERVICE_URL || "http://localhost:3001"
    },
    product: {
      name: "Product Service",
      prefix: "/products",
      url: process.env.PRODUCT_SERVICE_URL || "http://localhost:3002"
    },
    order: {
      name: "Order Service",
      prefix: "/orders",
      url: process.env.ORDER_SERVICE_URL || "http://localhost:3003"
    }
  };
}

module.exports = {
  loadServiceRegistry
};
