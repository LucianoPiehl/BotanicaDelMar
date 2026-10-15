import { randomUUID } from "node:crypto";
import { ORDER_STATUS } from "../../store-common.js";
import { badRequest, notFound } from "../shared/errors.js";
import { COVERAGE_LOCATION_SET } from "../shared/coverageAreas.js";

export class OrderService {
  constructor({ orderRepository, catalogRepository, configService, pricingService, addressService }) {
    this.orderRepository = orderRepository;
    this.catalogRepository = catalogRepository;
    this.configService = configService;
    this.pricingService = pricingService;
    this.addressService = addressService;
  }

  async listOrders() {
    return this.orderRepository.listOrders();
  }

  async getOrder(orderId) {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw notFound("Pedido no encontrado.");
    }
    return order;
  }

  async createOrder(payload) {
    const customer = this.validateCustomer(payload?.customer);
    const addressValidation = await this.addressService.validate({
      address: customer.address,
      location: customer.location,
      placeId: customer.addressPlaceId,
    });
    const rawItems = this.validateRawItems(payload?.items);
    const config = await this.configService.getConfig();
    const catalog = this.catalogRepository.getStorefrontCatalog();
    const pricing = this.pricingService.buildCartPricing({
      cartItems: rawItems,
      catalog,
      config,
      couponCode: payload?.couponCode,
    });

    if (pricing.invalidItems.length) {
      throw badRequest("Uno o mas productos u ofertas ya no estan disponibles. Revisa el carrito y vuelve a intentar.");
    }

    if (pricing.invalidCouponCode) {
      throw badRequest("El cupon ingresado no es valido o ya no esta activo.");
    }

    if (!pricing.items.length) {
      throw badRequest("El pedido debe incluir al menos un producto.");
    }

    if (pricing.total <= 0) {
      throw badRequest("El total final del pedido debe ser mayor a cero.");
    }

    const items = pricing.items.map((item) => ({
      type: item.kind,
      id: item.id,
      name: item.name,
      presentation: item.presentation,
      image: item.image,
      qty: item.qty,
      fulfillmentUnits: item.fulfillmentUnits,
      originalUnitPrice: item.originalUnitPrice,
      unitPrice: item.unitPrice,
      originalLineTotal: item.originalLineTotal,
      lineTotal: item.lineTotal,
      directDiscountAmount: item.directDiscountAmount,
      appliedDirectDiscount: item.appliedDirectDiscount,
      ...(item.kind === "pack"
        ? {
            description: item.description,
            packItems: item.packItems,
          }
        : {}),
    }));

    const order = {
      id: `BDM-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "pending_payment",
      payment: {
        provider: "mercado_pago",
        status: "pending_preference",
      },
      brand: String(payload?.brand || "biocom"),
      customer,
      delivery: {
        addressValidation,
      },
      items,
      totals: {
        cartUnits: pricing.cartUnits,
        units: pricing.fulfillmentUnits,
        originalSubtotal: pricing.originalSubtotal,
        subtotal: pricing.subtotal,
        directDiscountAmount: pricing.directDiscountAmount,
        orderDiscounts: pricing.orderDiscounts,
        discountAmount: pricing.totalDiscountAmount,
        amount: pricing.total,
      },
      coupon: pricing.appliedCoupon
        ? {
            code: pricing.appliedCoupon.code,
            percentOff: pricing.appliedCoupon.percentOff,
          }
        : null,
    };

    return this.orderRepository.createOrder(order);
  }

  async attachPayment(orderId, paymentData) {
    const updatedOrder = await this.orderRepository.updatePayment(orderId, paymentData);
    if (!updatedOrder) {
      throw notFound("Pedido no encontrado.");
    }
    return updatedOrder;
  }

  async updateStatus(orderId, status) {
    if (!ORDER_STATUS[status]) {
      throw badRequest("Estado de pedido invalido.");
    }

    const updatedOrder = await this.orderRepository.updateStatus(orderId, status);
    if (!updatedOrder) {
      throw notFound("Pedido no encontrado.");
    }

    return updatedOrder;
  }

  validateCustomer(customer) {
    const normalized = {
      name: String(customer?.name || "").trim(),
      phone: String(customer?.phone || "").trim(),
      email: String(customer?.email || "").trim(),
      location: String(customer?.location || "").trim(),
      address: String(customer?.address || "").trim(),
      addressPlaceId: String(customer?.addressPlaceId || "").trim(),
      notes: String(customer?.notes || "").trim(),
    };

    if (!normalized.name || !normalized.phone || !normalized.email || !normalized.location || !normalized.address) {
      throw badRequest("Nombre, telefono, email, localidad y direccion son obligatorios.");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) {
      throw badRequest("Ingresa un email valido.");
    }

    if (!COVERAGE_LOCATION_SET.has(normalized.location)) {
      throw badRequest("La localidad seleccionada no esta dentro de la zona de cobertura.");
    }

    if (normalized.address.length < 6 || !/\d/.test(normalized.address)) {
      throw badRequest("Ingresa una direccion real con calle y numero.");
    }

    return normalized;
  }

  validateRawItems(items) {
    if (!Array.isArray(items) || !items.length) {
      throw badRequest("El pedido debe incluir al menos un producto.");
    }

    return items.map((item) => {
      const qty = Number(item?.qty);
      const id = String(item?.id || "").trim();
      const kind = String(item?.kind || "product").trim().toLowerCase() === "pack" ? "pack" : "product";
      if (!id || !Number.isInteger(qty) || qty <= 0) {
        throw badRequest("Todos los productos deben tener id y cantidad valida.");
      }

      return { kind, id, qty };
    });
  }
}
