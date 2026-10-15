export class OrderRepository {
  constructor(database) {
    this.database = database;
  }

  async listOrders() {
    const data = await this.database.read();
    return [...data.orders].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  }

  async createOrder(order) {
    const data = await this.database.update((current) => ({
      ...current,
      orders: [order, ...current.orders],
    }));

    return data.orders.find((item) => item.id === order.id);
  }

  async updateStatus(orderId, status) {
    let updatedOrder = null;
    await this.database.update((current) => ({
      ...current,
      orders: current.orders.map((order) => {
        if (order.id !== orderId) {
          return order;
        }

        updatedOrder = {
          ...order,
          status,
          updatedAt: new Date().toISOString(),
        };
        return updatedOrder;
      }),
    }));

    return updatedOrder;
  }

  async updatePayment(orderId, paymentData) {
    let updatedOrder = null;
    await this.database.update((current) => ({
      ...current,
      orders: current.orders.map((order) => {
        if (order.id !== orderId) {
          return order;
        }

        updatedOrder = {
          ...order,
          payment: {
            ...(order.payment ?? {}),
            ...paymentData,
          },
          updatedAt: new Date().toISOString(),
        };
        return updatedOrder;
      }),
    }));

    return updatedOrder;
  }

  async findById(orderId) {
    const data = await this.database.read();
    return data.orders.find((order) => order.id === orderId) ?? null;
  }
}
