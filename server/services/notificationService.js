import { randomUUID } from "node:crypto";
import { badRequest } from "../shared/errors.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[char];
  });
}

export class NotificationService {
  constructor({ appConfig, notificationRepository }) {
    this.appConfig = appConfig;
    this.notificationRepository = notificationRepository;
  }

  async notifyNewPaidOrder(order) {
    this.assertPaidOrder(order);
    const message = this.formatLogisticsMessage(order);
    const channels = this.getEnabledChannels(message, order);
    if (!channels.length) {
      throw badRequest("No hay canales de notificacion activos para este pedido.");
    }

    const results = await Promise.allSettled(channels.map((channel) => channel.send()));

    return this.notificationRepository.addNotification({
      id: `NOT-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
      orderId: order.id,
      createdAt: new Date().toISOString(),
      channelResults: results.map((result, index) => ({
        channel: channels[index].name,
        status: result.status,
        reason: result.status === "rejected" ? String(result.reason?.message || result.reason) : null,
        details: result.status === "fulfilled" ? result.value ?? null : null,
      })),
      message,
    });
  }

  async listNotifications() {
    return {
      channels: {
        whatsappEnabled: this.appConfig.notifications.whatsappEnabled,
        emailEnabled: this.appConfig.notifications.emailEnabled,
      },
      notifications: await this.notificationRepository.listNotifications(),
    };
  }

  verifyWhatsAppWebhook(query) {
    const mode = query.get("hub.mode");
    const token = query.get("hub.verify_token");
    const challenge = query.get("hub.challenge") || "";

    if (mode === "subscribe" && token === this.appConfig.whatsapp.webhookVerifyToken) {
      return {
        statusCode: 200,
        rawBody: challenge,
        contentType: "text/plain; charset=utf-8",
      };
    }

    throw badRequest("No se pudo verificar el webhook de WhatsApp.");
  }

  async processWhatsAppWebhook(payload) {
    const statuses = (payload?.entry ?? [])
      .flatMap((entry) => entry?.changes ?? [])
      .flatMap((change) => change?.value?.statuses ?? []);

    const events = statuses.map((status) => this.mapWhatsAppStatusEvent(status));
    await Promise.all(events.map((event) => this.notificationRepository.appendWhatsAppStatus(event)));
    return events;
  }

  getEnabledChannels(message, order) {
    const channels = [];

    if (this.appConfig.notifications.emailEnabled) {
      channels.push({
        name: "email",
        send: () => this.sendEmail(order, `Pedido pagado ${order.id}`, message),
      });
    }

    if (this.appConfig.notifications.whatsappEnabled) {
      channels.push({
        name: "whatsapp",
        send: () => this.sendWhatsApp(order, message),
      });
    }

    return channels;
  }

  assertPaidOrder(order) {
    const isPaid = order?.status === "paid" || order?.status === "fulfilled" || order?.payment?.status === "approved";
    if (!isPaid) {
      throw badRequest("Solo se pueden enviar notificaciones de pedidos pagados.");
    }
  }

  formatLogisticsMessage(order) {
    const subtotal = Number(order.totals?.subtotal ?? order.totals?.amount ?? 0);
    const discountLines = (order.totals?.orderDiscounts ?? []).map((discount) => `- ${discount.label}: -$${discount.amount}`);
    const lines = [
      `Nuevo pedido pagado: ${order.id}`,
      `Cliente: ${order.customer.name}`,
      `Telefono: ${order.customer.phone}`,
      `Email: ${order.customer.email || "Sin email"}`,
      `Localidad: ${order.customer.location}`,
      `Direccion: ${order.customer.address || "Sin direccion"}`,
      `Observaciones: ${order.customer.notes || "Sin observaciones"}`,
      `Subtotal: $${subtotal}`,
      ...(order.totals?.discountAmount ? [`Descuentos: -$${order.totals.discountAmount}`] : []),
      `Total: $${order.totals.amount}`,
      ...(discountLines.length ? ["Promociones aplicadas:", ...discountLines] : []),
      "Productos:",
      ...order.items.flatMap((item) => this.formatLogisticsItemLines(item)),
    ];

    return lines.join("\n");
  }

  formatLogisticsEmailHtml(order) {
    const summaryRows = [
      ["Pedido", order.id],
      ["Cliente", order.customer.name],
      ["Telefono", order.customer.phone],
      ["Email", order.customer.email || "Sin email"],
      ["Localidad", order.customer.location],
      ["Direccion", order.customer.address || "Sin direccion"],
      ["Observaciones", order.customer.notes || "Sin observaciones"],
      ["Subtotal", `$${order.totals?.subtotal ?? order.totals?.amount ?? 0}`],
      ["Descuentos", `-$${order.totals?.discountAmount ?? 0}`],
      ["Total", `$${order.totals.amount}`],
    ];

    const itemsMarkup = order.items
      .map(
        (item) => `
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #e5ded5;">${escapeHtml(item.name)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5ded5;">${escapeHtml(item.presentation)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5ded5;text-align:center;">${escapeHtml(item.qty)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5ded5;text-align:right;">$${escapeHtml(item.lineTotal)}</td>
          </tr>
          ${
            item.type === "pack" && Array.isArray(item.packItems) && item.packItems.length
              ? `
                <tr>
                  <td colspan="4" style="padding:0 12px 12px;border-bottom:1px solid #e5ded5;color:#6f6255;font-size:13px;">
                    Incluye: ${escapeHtml(item.packItems.map((packItem) => `${packItem.totalQty} x ${packItem.name}`).join(", "))}
                  </td>
                </tr>
              `
              : ""
          }
        `,
      )
      .join("");

    const promotionsMarkup = (order.totals?.orderDiscounts ?? [])
      .map(
        (discount) => `
          <li style="margin:0 0 8px;color:#6f6255;">
            ${escapeHtml(discount.label)}: <strong style="color:#1f4b43;">-$${escapeHtml(discount.amount)}</strong>
          </li>
        `,
      )
      .join("");

    const summaryMarkup = summaryRows
      .map(
        ([label, value]) => `
          <tr>
            <th style="padding:8px 0;text-align:left;color:#6f6255;font-weight:600;width:140px;">${escapeHtml(label)}</th>
            <td style="padding:8px 0;color:#231f1b;">${escapeHtml(value)}</td>
          </tr>
        `,
      )
      .join("");

    return `
      <div style="background:#f7f1ea;padding:24px;font-family:Arial,sans-serif;color:#231f1b;">
        <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #e5ded5;border-radius:16px;overflow:hidden;">
          <div style="padding:24px 28px;background:#1f4b43;color:#ffffff;">
            <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;">Botanica del Mar</p>
            <h1 style="margin:0;font-size:24px;line-height:1.2;">Nuevo pedido pagado</h1>
            <p style="margin:8px 0 0;font-size:15px;opacity:0.92;">${escapeHtml(order.id)}</p>
          </div>

          <div style="padding:28px;">
            <table style="width:100%;border-collapse:collapse;">
              ${summaryMarkup}
            </table>

            <div style="margin-top:28px;">
              <h2 style="margin:0 0 12px;font-size:18px;color:#1f4b43;">Productos</h2>
              <table style="width:100%;border-collapse:collapse;border:1px solid #e5ded5;border-radius:12px;overflow:hidden;">
                <thead>
                  <tr style="background:#f3ece4;color:#6f6255;">
                    <th style="padding:10px 12px;text-align:left;">Producto</th>
                    <th style="padding:10px 12px;text-align:left;">Presentacion</th>
                    <th style="padding:10px 12px;text-align:center;">Cant.</th>
                    <th style="padding:10px 12px;text-align:right;">Subtotal</th>
                  </tr>
                </thead>
                <tbody>${itemsMarkup}</tbody>
              </table>
            </div>

            ${
              promotionsMarkup
                ? `
                  <div style="margin-top:24px;">
                    <h2 style="margin:0 0 12px;font-size:18px;color:#1f4b43;">Promociones aplicadas</h2>
                    <ul style="margin:0;padding-left:18px;">${promotionsMarkup}</ul>
                  </div>
                `
                : ""
            }

            <p style="margin:24px 0 0;font-size:13px;color:#6f6255;">
              Este aviso fue generado automaticamente por la tienda para preparar el envio del pedido.
            </p>
          </div>
        </div>
      </div>
    `;
  }

  async sendWhatsApp(order, message) {
    const config = this.appConfig.whatsapp;
    if (!config.token || !config.phoneNumberId) {
      throw new Error("WhatsApp no configurado: faltan WHATSAPP_ACCESS_TOKEN y/o WHATSAPP_PHONE_NUMBER_ID.");
    }

    const recipient = this.getWhatsAppRecipient();

    const payload = config.orderTemplateName
      ? this.createWhatsAppTemplatePayload(order, recipient)
      : this.createWhatsAppTextPayload(message, recipient);

    const response = await fetch(`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responsePayload = await response.json().catch(async () => ({ raw: await response.text().catch(() => "") }));

    if (!response.ok) {
      throw new Error(this.formatWhatsAppError(responsePayload));
    }

    return {
      recipient,
      response: responsePayload,
    };
  }

  getWhatsAppRecipient() {
    const raw = String(this.appConfig.notifications.whatsappTo || "").trim();
    const digits = raw.replace(/\D+/g, "");
    const normalized = raw.startsWith("+") ? `+${digits}` : digits;

    if (digits.length < 10) {
      throw new Error("WhatsApp no configurado: NOTIFY_WHATSAPP_TO debe usar formato internacional, por ejemplo +542254414767.");
    }

    return normalized;
  }

  formatWhatsAppError(payload) {
    const error = payload?.error ?? {};
    const code = Number(error.code);
    const message = String(error.message || payload?.raw || "WhatsApp rechazo la notificacion.");

    if (code === 190) {
      return "WhatsApp rechazo la notificacion: token invalido o vencido. Renueva el token de Meta y vuelve a probar.";
    }

    if (code === 200) {
      return [
        "WhatsApp rechazo la notificacion: Meta bloqueo el acceso a la API para este token o numero.",
        "Verifica en Meta > WhatsApp > API Setup que el token pertenezca al mismo numero configurado, que la app tenga acceso a WhatsApp y, si usas el numero de prueba, que el destinatario este agregado como recipient de prueba.",
      ].join(" ");
    }

    if (code === 131030) {
      return [
        "WhatsApp rechazo la notificacion: el numero de destino no esta en la lista permitida del sandbox.",
        "Ve a Meta > tu app > Conectar en WhatsApp > Configuracion de la API y agrega ese numero exacto en la seccion Para antes de volver a probar.",
      ].join(" ");
    }

    if (code === 131047 || code === 470) {
      return [
        "WhatsApp rechazo la notificacion: no puedes iniciar una conversacion libre fuera de la ventana de 24 horas.",
        "Configura WHATSAPP_ORDER_TEMPLATE_NAME con una plantilla aprobada o haz que el destinatario escriba primero al numero de WhatsApp para abrir la ventana.",
      ].join(" ");
    }

    return `WhatsApp rechazo la notificacion: ${message}`;
  }

  mapWhatsAppStatusEvent(status) {
    return {
      messageId: String(status?.id || ""),
      status: String(status?.status || "unknown"),
      recipientId: String(status?.recipient_id || ""),
      conversationId: String(status?.conversation?.id || ""),
      conversationOrigin: String(status?.conversation?.origin?.type || ""),
      pricingCategory: String(status?.pricing?.category || ""),
      pricingModel: String(status?.pricing?.pricing_model || ""),
      errors: Array.isArray(status?.errors)
        ? status.errors.map((error) => ({
            code: error?.code ?? null,
            title: String(error?.title || ""),
            message: String(error?.message || ""),
            details: String(error?.error_data?.details || ""),
          }))
        : [],
      timestamp: status?.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      raw: status,
    };
  }

  createWhatsAppTextPayload(message, recipient) {
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "text",
      text: {
        preview_url: false,
        body: message,
      },
    };
  }

  createWhatsAppTemplatePayload(order, recipient) {
    const config = this.appConfig.whatsapp;
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "template",
      template: {
        name: config.orderTemplateName,
        language: {
          code: config.orderTemplateLanguage,
        },
        components: [
          {
            type: "body",
            parameters: this.getOrderTemplateParameters(order).map((value) => ({
              type: "text",
              text: value,
            })),
          },
        ],
      },
    };
  }

  getOrderTemplateParameters(order) {
    return [
      order.id,
      order.customer.name,
      order.customer.phone,
      order.customer.email || "Sin email",
      order.customer.location,
      order.customer.address || "Sin direccion",
      order.customer.notes || "Sin observaciones",
      `$${order.totals.amount}`,
      order.items.flatMap((item) => this.formatLogisticsItemLines(item)).join("\n"),
    ];
  }

  formatLogisticsItemLines(item) {
    const baseLine = `- ${item.qty} x ${item.name} (${item.presentation})`;
    if (item.type === "pack" && Array.isArray(item.packItems) && item.packItems.length) {
      return [
        `${baseLine} [Pack]`,
        ...item.packItems.map((packItem) => `  * ${packItem.totalQty} x ${packItem.name}`),
      ];
    }

    return [baseLine];
  }

  async sendEmail(order, subject, message) {
    const config = this.appConfig.email;
    const nodemailer = await import("nodemailer");
    const recipient = this.getEmailRecipient();
    const transportOptions = {
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
    };
    const auth = this.getEmailAuth(config);
    if (auth) {
      transportOptions.auth = auth;
    }

    const transporter = nodemailer.default.createTransport(transportOptions);
    const info = await transporter.sendMail({
      from: config.from,
      to: recipient,
      replyTo: order.customer.email || undefined,
      subject,
      text: message,
      html: this.formatLogisticsEmailHtml(order),
    });

    const accepted = Array.isArray(info.accepted) ? info.accepted.map((value) => String(value)) : [];
    if (!accepted.length) {
      throw new Error("El servidor SMTP respondio sin aceptar destinatarios.");
    }

    return {
      recipient,
      accepted,
      rejected: Array.isArray(info.rejected) ? info.rejected.map((value) => String(value)) : [],
      response: String(info.response || ""),
      messageId: String(info.messageId || ""),
    };
  }

  getEmailRecipient() {
    const recipient = String(this.appConfig.notifications.emailTo || "").trim();
    if (!recipient) {
      throw new Error("Email no configurado: falta NOTIFY_EMAIL_TO.");
    }

    return recipient;
  }

  getEmailAuth(config) {
    const authMethod = String(config.authMethod || "password").toLowerCase();

    if (!config.smtpHost || !config.from) {
      throw new Error("Email no configurado: faltan SMTP_HOST y/o SMTP_FROM.");
    }

    if (authMethod === "none") {
      return null;
    }

    if (!config.smtpUser) {
      throw new Error("Email no configurado: falta SMTP_USER.");
    }

    if (authMethod === "oauth2") {
      if (!config.googleClientId || !config.googleClientSecret || !config.googleRefreshToken) {
        throw new Error("Email OAuth2 no configurado: faltan GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y/o GOOGLE_REFRESH_TOKEN.");
      }

      return {
        type: "OAuth2",
        user: config.smtpUser,
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
        refreshToken: config.googleRefreshToken,
      };
    }

    if (!config.smtpPass) {
      throw new Error("Email SMTP no configurado: falta SMTP_PASS.");
    }

    return {
      user: config.smtpUser,
      pass: config.smtpPass,
    };
  }
}
