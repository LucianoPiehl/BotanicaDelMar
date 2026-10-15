export class MetricsService {
  constructor({ orderService, catalogRepository, configService }) {
    this.orderService = orderService;
    this.catalogRepository = catalogRepository;
    this.configService = configService;
  }

  async getDashboard() {
    const orders = await this.orderService.listOrders();
    const paidOrders = orders.filter((order) => this.isPaidOrder(order));
    const catalog = this.catalogRepository.getCatalog();
    const config = await this.configService.getConfig();
    const totalOrders = paidOrders.length;
    const totalRevenue = paidOrders.reduce((total, order) => total + (order.totals?.amount ?? 0), 0);
    const totalUnits = paidOrders.reduce((total, order) => total + (order.totals?.units ?? 0), 0);

    return {
      summary: {
        totalOrders,
        totalRevenue,
        totalUnits,
        averageTicket: totalOrders ? Math.round(totalRevenue / totalOrders) : 0,
        markupPercent: config.markupPercent,
        catalogProducts: catalog.products.length,
      },
      topProducts: this.getTopProducts(paidOrders, 6),
    };
  }

  isPaidOrder(order) {
    return order?.status === "paid" || order?.payment?.status === "approved";
  }

  getTopProducts(orders, limit) {
    const catalog = this.catalogRepository.getCatalog();
    const productsById = new Map(catalog.products.map((product) => [product.id, product]));
    const counters = new Map();

    for (const order of orders) {
      for (const item of order.items ?? []) {
        if (item.type === "pack" && Array.isArray(item.packItems)) {
          for (const packItem of item.packItems) {
            counters.set(packItem.productId, (counters.get(packItem.productId) ?? 0) + packItem.totalQty);
          }
          continue;
        }

        counters.set(item.id, (counters.get(item.id) ?? 0) + item.qty);
      }
    }

    return [...counters.entries()]
      .map(([id, qty]) => {
        const product = productsById.get(id);
        return product ? { product, qty } : null;
      })
      .filter(Boolean)
      .sort((left, right) => right.qty - left.qty)
      .slice(0, limit);
  }
}
