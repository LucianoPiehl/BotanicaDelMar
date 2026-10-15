export class ApiClient {
  constructor(baseUrl = "/api") {
    this.baseUrl = baseUrl;
  }

  getCatalog() {
    return this.request("/catalog");
  }

  getConfig() {
    return this.request("/config");
  }

  suggestAddresses({ input, location }) {
    const params = new URLSearchParams({ input, location });
    return this.request(`/address/suggest?${params.toString()}`);
  }

  validateAddress(payload) {
    return this.request("/address/validate", {
      method: "POST",
      body: payload,
    });
  }

  updateConfig(config) {
    return this.request("/config", {
      method: "PUT",
      body: config,
    });
  }

  listOrders() {
    return this.request("/orders");
  }

  listNotifications() {
    return this.request("/notifications");
  }

  createOrder(order) {
    return this.request("/orders", {
      method: "POST",
      body: order,
    });
  }

  updateOrderStatus(orderId, status) {
    return this.request(`/orders/${encodeURIComponent(orderId)}/status`, {
      method: "PATCH",
      body: { status },
    });
  }

  notifyOrder(orderId) {
    return this.request(`/orders/${encodeURIComponent(orderId)}/notify`, {
      method: "POST",
      body: {},
    });
  }

  getMetrics() {
    return this.request("/metrics");
  }

  getAuthStatus() {
    return this.request("/auth/status");
  }

  setupAdmin(credentials) {
    return this.request("/auth/setup", {
      method: "POST",
      body: credentials,
    });
  }

  login(credentials) {
    return this.request("/auth/login", {
      method: "POST",
      body: credentials,
    });
  }

  logout() {
    return this.request("/auth/logout", {
      method: "POST",
      body: {},
    });
  }

  createCheckout(order) {
    return this.request("/checkout", {
      method: "POST",
      body: order,
    });
  }

  async request(path, { method = "GET", body = null } = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : null,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error?.message || "No se pudo completar la solicitud.");
    }

    return payload;
  }
}

export const apiClient = new ApiClient();
