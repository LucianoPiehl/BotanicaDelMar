export class ApiController {
  constructor({ authService, addressService, catalogService, checkoutService, configService, orderService, metricsService, paymentService, notificationService }) {
    this.authService = authService;
    this.addressService = addressService;
    this.catalogService = catalogService;
    this.checkoutService = checkoutService;
    this.configService = configService;
    this.orderService = orderService;
    this.metricsService = metricsService;
    this.paymentService = paymentService;
    this.notificationService = notificationService;
  }

  register(router) {
    router.get("/api/health", () => ({ ok: true }));
    router.get("/api/auth/status", ({ cookies }) => this.authService.getStatus(cookies.admin_session));
    router.post("/api/auth/setup", ({ body }) => this.authService.setup(body).then(() => ({ ok: true })));
    router.post("/api/auth/login", async ({ body, response }) => {
      const session = await this.authService.login(body);
      response.setSessionCookie(session.token, session.expiresAt);
      return { ok: true, user: { username: session.username } };
    });
    router.post("/api/auth/logout", ({ cookies, response }) => {
      this.authService.logout(cookies.admin_session);
      response.clearSessionCookie();
      return { ok: true };
    });
    router.get("/api/catalog", () => this.catalogService.getStorefrontCatalog());
    router.get("/api/config", () => this.configService.getConfig());
    router.get("/api/address/suggest", ({ query }) =>
      this.addressService.suggest({
        input: query.get("input"),
        location: query.get("location"),
      }),
    );
    router.post("/api/address/validate", ({ body }) => this.addressService.validate(body));
    router.put("/api/config", ({ body, cookies }) => {
      this.authService.requireAdmin(cookies.admin_session);
      return this.configService.updateConfig(body);
    });
    router.get("/api/orders", ({ cookies }) => {
      this.authService.requireAdmin(cookies.admin_session);
      return this.orderService.listOrders();
    });
    router.get("/api/notifications", ({ cookies }) => {
      this.authService.requireAdmin(cookies.admin_session);
      return this.notificationService.listNotifications();
    });
    router.post("/api/checkout", async ({ body }) => ({
      statusCode: 201,
      body: await this.checkoutService.createCheckout(body),
    }));
    router.patch("/api/orders/:orderId/status", ({ params, body, cookies }) => {
      this.authService.requireAdmin(cookies.admin_session);
      return this.orderService.updateStatus(params.orderId, body?.status);
    });
    router.post("/api/orders/:orderId/notify", async ({ params, cookies }) => {
      this.authService.requireAdmin(cookies.admin_session);
      const order = await this.orderService.getOrder(params.orderId);
      return this.notificationService.notifyNewPaidOrder(order);
    });
    router.get("/api/whatsapp/webhook", ({ query }) => this.notificationService.verifyWhatsAppWebhook(query));
    router.post("/api/whatsapp/webhook", async ({ body }) => {
      await this.notificationService.processWhatsAppWebhook(body);
      return { ok: true };
    });
    router.get("/api/metrics", ({ cookies }) => {
      this.authService.requireAdmin(cookies.admin_session);
      return this.metricsService.getDashboard();
    });
    router.post("/api/payments/mercadopago/webhook", async ({ request, body, query }) => {
      const dataId = body?.data?.id || body?.id || "";
      const isValid = this.paymentService.verifyMercadoPagoSignature({
        requestId: request.headers["x-request-id"],
        dataId,
        signatureHeader: request.headers["x-signature"],
      });

      if (!isValid) {
        return { statusCode: 401, body: { ok: false } };
      }

      const topic = body?.type || body?.topic || query.get("topic") || "";
      if (dataId && topic.includes("payment")) {
        const payment = await this.paymentService.getMercadoPagoPayment(dataId);
        const orderId = payment.external_reference || payment.metadata?.order_id;
        if (orderId) {
          await this.orderService.attachPayment(orderId, {
            provider: "mercado_pago",
            paymentId: String(payment.id),
            status: payment.status,
            statusDetail: payment.status_detail,
            paidAt: payment.date_approved || null,
            rawUpdatedAt: new Date().toISOString(),
          });

          if (payment.status === "approved") {
            const order = await this.orderService.updateStatus(orderId, "paid");
            await this.notificationService.notifyNewPaidOrder(order);
          }
        }
      }

      return { ok: true };
    });
  }
}
