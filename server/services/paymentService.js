import { createHmac, timingSafeEqual } from "node:crypto";
import { badRequest } from "../shared/errors.js";

export class PaymentService {
  constructor({ appConfig }) {
    this.appConfig = appConfig;
  }

  isConfigured() {
    return Boolean(this.appConfig.mercadoPago.accessToken);
  }

  async createCheckoutPreference(order, { deviceSessionId = "" } = {}) {
    if (!this.isConfigured()) {
      return {
        provider: "mercado_pago",
        configured: false,
        status: "missing_credentials",
        message: "Falta configurar MP_ACCESS_TOKEN.",
      };
    }

    const payer = this.getPayer(order.customer);
    if (this.appConfig.mercadoPago.useSandbox && !payer) {
      throw badRequest(
        "En modo de prueba de Mercado Pago, el email del checkout debe ser el del comprador de prueba y terminar en @testuser.com.",
      );
    }
    const description = this.getOrderDescription(order);
    const payload = {
      external_reference: order.id,
      statement_descriptor: this.appConfig.mercadoPago.statementDescriptor,
      notification_url: `${this.appConfig.publicBaseUrl}/api/payments/mercadopago/webhook`,
      back_urls: {
        success: `${this.appConfig.publicBaseUrl}/payment-result.html?status=success&order=${encodeURIComponent(order.id)}`,
        failure: `${this.appConfig.publicBaseUrl}/payment-result.html?status=failure&order=${encodeURIComponent(order.id)}`,
        pending: `${this.appConfig.publicBaseUrl}/payment-result.html?status=pending&order=${encodeURIComponent(order.id)}`,
      },
      auto_return: "approved",
      ...(payer ? { payer } : {}),
      items: [
        {
          id: order.id,
          title: `Pedido Botanica del Mar ${order.id}`,
          description,
          quantity: 1,
          unit_price: order.totals.amount,
          currency_id: "ARS",
        },
      ],
      shipments: {
        receiver_address: {
          street_name: order.customer.address || order.customer.location,
        },
      },
      metadata: {
        order_id: order.id,
        customer_phone: order.customer.phone,
        customer_location: order.customer.location,
        ...(this.appConfig.mercadoPago.useSandbox
          ? {}
          : {
              customer_email: order.customer.email,
            }),
      },
    };

    const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.appConfig.mercadoPago.accessToken}`,
        "Content-Type": "application/json",
        ...(deviceSessionId ? { "X-meli-session-id": deviceSessionId } : {}),
      },
      body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw badRequest(body?.message || "Mercado Pago rechazo la preferencia.", body);
    }

    return {
      provider: "mercado_pago",
      configured: true,
      preferenceId: body.id,
      initPoint: body.init_point,
      sandboxInitPoint: body.sandbox_init_point,
      checkoutUrl: this.appConfig.mercadoPago.useSandbox ? body.sandbox_init_point || body.init_point : body.init_point,
    };
  }

  getPayer(customer) {
    const normalizedEmail = String(customer?.email || "").trim();
    const normalizedName = String(customer?.name || "").trim();
    const normalizedPhone = String(customer?.phone || "").trim();

    if (!this.appConfig.mercadoPago.useSandbox) {
      return {
        ...(normalizedName ? { name: normalizedName } : {}),
        ...(normalizedEmail ? { email: normalizedEmail } : {}),
        ...(normalizedPhone
          ? {
              phone: {
                number: normalizedPhone,
              },
            }
          : {}),
      };
    }

    if (!normalizedEmail.endsWith("@testuser.com")) {
      return undefined;
    }

    return {
      email: normalizedEmail,
    };
  }

  getOrderDescription(order) {
    return (order.items ?? [])
      .map((item) => {
        if (item.type === "pack" && Array.isArray(item.packItems) && item.packItems.length) {
          const packItems = item.packItems.map((packItem) => `${packItem.totalQty} x ${packItem.name}`).join(", ");
          return `${item.qty} x ${item.name}: ${packItems}`;
        }

        return `${item.qty} x ${item.name}`;
      })
      .join(" | ")
      .slice(0, 240);
  }

  async getMercadoPagoPayment(paymentId) {
    if (!this.isConfigured()) {
      throw badRequest("Mercado Pago no esta configurado.");
    }

    const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: {
        Authorization: `Bearer ${this.appConfig.mercadoPago.accessToken}`,
      },
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw badRequest(body?.message || "No se pudo consultar el pago en Mercado Pago.", body);
    }

    return body;
  }

  verifyMercadoPagoSignature({ requestId, dataId, signatureHeader }) {
    const secret = this.appConfig.mercadoPago.webhookSecret;
    if (!secret) {
      return true;
    }

    const parts = Object.fromEntries(
      String(signatureHeader || "")
        .split(",")
        .map((part) => part.split("=").map((value) => value.trim())),
    );

    if (!parts.ts || !parts.v1) {
      return false;
    }

    const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;
    const expected = createHmac("sha256", secret).update(manifest).digest("hex");
    const actualBuffer = Buffer.from(parts.v1, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  }
}
