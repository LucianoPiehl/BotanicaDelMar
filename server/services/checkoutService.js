export class CheckoutService {
  constructor({ orderService, paymentService }) {
    this.orderService = orderService;
    this.paymentService = paymentService;
  }

  async createCheckout(payload) {
    const order = await this.orderService.createOrder(payload);
    const payment = await this.paymentService.createCheckoutPreference(order, {
      deviceSessionId: String(payload?.deviceSessionId || "").trim(),
    });
    const updatedOrder = await this.orderService.attachPayment(order.id, {
      ...payment,
      status: payment.configured ? "preference_created" : "missing_credentials",
      createdAt: new Date().toISOString(),
    });

    return {
      order: updatedOrder,
      payment,
    };
  }
}
