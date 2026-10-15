import {
  ORDER_STATUS,
  defaultConfig,
  formatCurrency,
  formatDateTime,
  getMarkupPercent,
  getNormalizedConfig,
} from "./store-common.js";
import { apiClient } from "./api-client.js";

const elements = {
  adminAuth: document.querySelector("#adminAuth"),
  authEyebrow: document.querySelector("#authEyebrow"),
  authTitle: document.querySelector("#authTitle"),
  authDescription: document.querySelector("#authDescription"),
  authForm: document.querySelector("#authForm"),
  authUsername: document.querySelector("#authUsername"),
  authPassword: document.querySelector("#authPassword"),
  authSubmit: document.querySelector("#authSubmit"),
  authFeedback: document.querySelector("#authFeedback"),
  panelSection: document.querySelector("#configuracion"),
  logoutButton: document.querySelector("#logoutButton"),
  markupForm: document.querySelector("#markupForm"),
  markupInput: document.querySelector("#markupInput"),
  metricGrid: document.querySelector("#metricGrid"),
  topProducts: document.querySelector("#topProducts"),
  ordersEmpty: document.querySelector("#ordersEmpty"),
  ordersTableWrap: document.querySelector("#ordersTableWrap"),
  ordersTableBody: document.querySelector("#ordersTableBody"),
  promotionsPanel: document.querySelector("#promociones"),
  offersSaveButton: document.querySelector("#offersSaveButton"),
  offersFeedback: document.querySelector("#offersFeedback"),
  purchaseDiscountList: document.querySelector("#purchaseDiscountList"),
  productDiscountList: document.querySelector("#productDiscountList"),
  packOfferList: document.querySelector("#packOfferList"),
  couponList: document.querySelector("#couponList"),
  addPurchaseDiscount: document.querySelector("#addPurchaseDiscount"),
  addProductDiscount: document.querySelector("#addProductDiscount"),
  addPackOffer: document.querySelector("#addPackOffer"),
  addCoupon: document.querySelector("#addCoupon"),
  packSectionVisible: document.querySelector("#packSectionVisible"),
};

const state = {
  orders: [],
  notifications: [],
  config: getNormalizedConfig(defaultConfig),
  metrics: null,
  catalog: { products: [] },
  setupRequired: false,
  authenticated: false,
  notifyingOrderId: null,
  notificationChannels: {
    whatsappEnabled: true,
    emailEnabled: false,
  },
  offersSaving: false,
};

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

function getProductImageUrl(imagePath) {
  if (!imagePath) {
    return "";
  }

  if (/^https?:\/\//iu.test(imagePath)) {
    return imagePath;
  }

  if (imagePath.startsWith("//")) {
    return `https:${imagePath}`;
  }

  return `./${imagePath}`;
}

function getProductPresentation(product) {
  return String(product.presentation || "").trim();
}

function makeDraftId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getSortedProducts() {
  return [...(state.catalog.products ?? [])].sort((left, right) => left.name.localeCompare(right.name, "es"));
}

function getProductOptions(selectedId, emptyLabel = "Elegir producto") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...getSortedProducts().map(
      (product) => {
        const presentation = getProductPresentation(product);
        const optionLabel = presentation ? `${product.name} - ${presentation}` : product.name;
        return `
        <option value="${product.id}" ${product.id === selectedId ? "selected" : ""}>
          ${escapeHtml(optionLabel)}
        </option>
      `;
      },
    ),
  ].join("");
}

function setOffersFeedback(tone = "", message = "") {
  if (!elements.offersFeedback) {
    return;
  }

  elements.offersFeedback.textContent = message;
  if (tone) {
    elements.offersFeedback.dataset.tone = tone;
    return;
  }

  delete elements.offersFeedback.dataset.tone;
}

function getMetrics() {
  const summary = state.metrics?.summary ?? {};

  return [
    { label: "Pedidos pagados", value: (summary.totalOrders ?? 0).toLocaleString("es-AR") },
    { label: "Facturacion pagada", value: formatCurrency(summary.totalRevenue ?? 0) },
    { label: "Unidades vendidas", value: (summary.totalUnits ?? 0).toLocaleString("es-AR") },
    { label: "Ticket promedio", value: formatCurrency(summary.averageTicket ?? 0) },
    { label: "Margen activo", value: `${getMarkupPercent(state.config)}%` },
    { label: "Catalogo disponible", value: `${summary.catalogProducts ?? 0} productos` },
  ];
}

function isPaidOrder(order) {
  return order?.status === "paid" || order?.status === "fulfilled" || order?.payment?.status === "approved";
}

function getEnabledNotificationChannels() {
  return [
    state.notificationChannels.emailEnabled ? "email" : null,
    state.notificationChannels.whatsappEnabled ? "whatsapp" : null,
  ].filter(Boolean);
}

function getNotificationActionLabel() {
  const activeChannels = getEnabledNotificationChannels();
  if (activeChannels.length > 1) {
    return "Reenviar avisos";
  }

  if (activeChannels[0] === "email") {
    return "Reenviar email";
  }

  if (activeChannels[0] === "whatsapp") {
    return "Reenviar WhatsApp";
  }

  return "Reenviar aviso";
}

function getLatestChannelResult(orderId, channelName) {
  for (const notification of state.notifications) {
    if (notification.orderId !== orderId) {
      continue;
    }

    const result = notification.channelResults?.find((channelResult) => channelResult.channel === channelName) ?? null;
    if (result) {
      return {
        notification,
        result,
      };
    }
  }

  return null;
}

function getEmailNotificationSummary(orderId) {
  const latest = getLatestChannelResult(orderId, "email");
  if (!latest?.notification) {
    return {
      channelLabel: "Email",
      toneClassName: "",
      label: "Sin intento",
      detail: "Todavia no hay avisos guardados por email para este pedido.",
      canRetry: true,
      hasAttempt: false,
      severity: 0,
    };
  }

  const createdAt = formatDateTime(latest.notification.createdAt);
  if (latest.result?.status === "fulfilled") {
    const acceptedRecipient = latest.result.details?.accepted?.[0] || latest.result.details?.recipient || "la casilla configurada";
    return {
      channelLabel: "Email",
      toneClassName: "order-notification--ok",
      label: "Enviado",
      detail: `El servidor de correo acepto el mensaje el ${escapeHtml(createdAt)} para ${escapeHtml(acceptedRecipient)}.`,
      canRetry: true,
      hasAttempt: true,
      severity: 1,
    };
  }

  if (latest.result?.status === "rejected") {
    return {
      channelLabel: "Email",
      toneClassName: "order-notification--error",
      label: "Fallido",
      detail: `${escapeHtml(latest.result.reason || "El servidor SMTP rechazo el mensaje.")} Ultimo intento: ${escapeHtml(createdAt)}.`,
      canRetry: true,
      hasAttempt: true,
      severity: 3,
    };
  }

  return {
    channelLabel: "Email",
    toneClassName: "",
    label: "Sin resultado",
    detail: `Se guardo un intento el ${escapeHtml(createdAt)}, pero no hubo una confirmacion util del servidor de correo.`,
    canRetry: true,
    hasAttempt: true,
    severity: 2,
  };
}

function getWhatsAppNotificationSummary(orderId) {
  const latest = getLatestChannelResult(orderId, "whatsapp");
  if (!latest?.notification) {
    return {
      channelLabel: "WhatsApp",
      toneClassName: "",
      label: "Sin intento",
      detail: "Todavia no hay avisos guardados por WhatsApp para este pedido.",
      canRetry: true,
      hasAttempt: false,
      severity: 0,
    };
  }

  const createdAt = formatDateTime(latest.notification.createdAt);
  const delivery = latest.result?.details?.delivery ?? null;
  const resolvedWaId = latest.result?.details?.response?.contacts?.[0]?.wa_id ?? "";

  if (delivery?.status === "delivered") {
    return {
      channelLabel: "WhatsApp",
      toneClassName: "order-notification--ok",
      label: "Entregado",
      detail: `WhatsApp confirmo la entrega el ${escapeHtml(formatDateTime(delivery.timestamp))}.`,
      canRetry: true,
      hasAttempt: true,
      severity: 1,
    };
  }

  if (delivery?.status === "read") {
    return {
      channelLabel: "WhatsApp",
      toneClassName: "order-notification--ok",
      label: "Leido",
      detail: `WhatsApp confirmo lectura el ${escapeHtml(formatDateTime(delivery.timestamp))}.`,
      canRetry: true,
      hasAttempt: true,
      severity: 1,
    };
  }

  if (delivery?.status === "failed") {
    const deliveryError = delivery.errors?.[0]?.message || delivery.errors?.[0]?.title || "WhatsApp no entrego el mensaje.";
    return {
      channelLabel: "WhatsApp",
      toneClassName: "order-notification--error",
      label: "No entregado",
      detail: `${escapeHtml(deliveryError)} Ultimo estado: ${escapeHtml(formatDateTime(delivery.timestamp))}.`,
      canRetry: true,
      hasAttempt: true,
      severity: 3,
    };
  }

  if (delivery?.status === "sent") {
    return {
      channelLabel: "WhatsApp",
      toneClassName: "",
      label: "En curso",
      detail: `Meta acepto el mensaje y lo envio a WhatsApp el ${escapeHtml(formatDateTime(delivery.timestamp))}.`,
      canRetry: true,
      hasAttempt: true,
      severity: 2,
    };
  }

  if (latest.result?.status === "fulfilled") {
    return {
      channelLabel: "WhatsApp",
      toneClassName: "",
      label: "Aceptado por Meta",
      detail: resolvedWaId
        ? `Meta acepto el envio el ${escapeHtml(createdAt)} y lo vinculo al WhatsApp ${escapeHtml(resolvedWaId)}. Falta confirmar entrega real.`
        : `Meta acepto el envio el ${escapeHtml(createdAt)}. Falta confirmar entrega real.`,
      canRetry: true,
      hasAttempt: true,
      severity: 2,
    };
  }

  if (latest.result?.status === "rejected") {
    return {
      channelLabel: "WhatsApp",
      toneClassName: "order-notification--error",
      label: "Fallido",
      detail: `${escapeHtml(latest.result.reason || "WhatsApp no entrego el mensaje.")} Ultimo intento: ${escapeHtml(createdAt)}.`,
      canRetry: true,
      hasAttempt: true,
      severity: 3,
    };
  }

  return {
    channelLabel: "WhatsApp",
    toneClassName: "",
    label: "Sin resultado",
    detail: `Se guardo un intento el ${escapeHtml(createdAt)}, pero no hubo respuesta util de WhatsApp.`,
    canRetry: true,
    hasAttempt: true,
    severity: 2,
  };
}

function getNotificationSummary(order) {
  const activeChannels = getEnabledNotificationChannels();
  if (!activeChannels.length) {
    return {
      toneClassName: "",
      label: "Canales apagados",
      detail: "No hay canales de aviso activos en esta configuracion.",
      canRetry: false,
    };
  }

  if (!isPaidOrder(order)) {
    return {
      toneClassName: "",
      label: "Aun no pagado",
      detail: "El aviso se habilita cuando el pedido queda marcado como pagado.",
      canRetry: false,
    };
  }

  const channelSummaries = activeChannels.map((channelName) =>
    channelName === "email" ? getEmailNotificationSummary(order.id) : getWhatsAppNotificationSummary(order.id),
  );

  if (!channelSummaries.some((summary) => summary.hasAttempt)) {
    return {
      toneClassName: "",
      label: "Sin intento",
      detail:
        activeChannels.length === 1
          ? channelSummaries[0].detail
          : "Todavia no hay avisos guardados para este pedido en los canales activos.",
      canRetry: true,
    };
  }

  const primarySummary =
    channelSummaries
      .slice()
      .sort((left, right) => right.severity - left.severity || Number(right.hasAttempt) - Number(left.hasAttempt))[0] ??
    channelSummaries[0];

  return {
    toneClassName: primarySummary.toneClassName,
    label: activeChannels.length > 1 ? `${primarySummary.channelLabel}: ${primarySummary.label}` : primarySummary.label,
    detail: channelSummaries.map((summary) => `${summary.channelLabel}: ${summary.detail}`).join(" | "),
    canRetry: channelSummaries.some((summary) => summary.canRetry),
  };
}

function renderMetrics() {
  elements.metricGrid.innerHTML = getMetrics()
    .map(
      (metric) => `
        <article class="metric-card">
          <span>${escapeHtml(metric.label)}</span>
          <strong>${escapeHtml(metric.value)}</strong>
        </article>
      `,
    )
    .join("");
}

function renderTopProducts() {
  const topProducts = state.metrics?.topProducts ?? [];

  if (!topProducts.length) {
    elements.topProducts.innerHTML = `
      <article class="cart-empty">
        <strong>Sin datos todavia.</strong>
        <p>Cuando entren pedidos, aca vas a ver rapidamente que productos rotan mas.</p>
      </article>
    `;
    return;
  }

  elements.topProducts.innerHTML = topProducts
    .map(
      ({ product, qty }) => {
        const presentation = getProductPresentation(product);
        const secondaryLine = presentation ? `${presentation} - ${product.categoryName}` : product.categoryName;
        return `
        <article class="top-product">
          <img src="${getProductImageUrl(product.image)}" alt="${escapeHtml(product.name)}">
          <div>
            <strong>${escapeHtml(product.name)}</strong>
            <span>${escapeHtml(secondaryLine)}</span>
          </div>
          <span class="top-product__qty">${qty} u.</span>
        </article>
      `;
      },
    )
    .join("");
}

function formatOrderItems(order) {
  return (order.items ?? [])
    .map((item) => {
      const packDetail =
        item.type === "pack" && Array.isArray(item.packItems) && item.packItems.length
          ? `<small style="display:block;margin-top:6px;color:var(--ink-500);">Incluye: ${escapeHtml(item.packItems.map((packItem) => `${packItem.totalQty} x ${packItem.name}`).join(", "))}</small>`
          : "";

      return `${item.qty} x ${escapeHtml(item.name)}${packDetail}`;
    })
    .join("<br>");
}

function renderOrders() {
  if (!state.orders.length) {
    elements.ordersEmpty.hidden = false;
    elements.ordersTableWrap.hidden = true;
    elements.ordersTableBody.innerHTML = "";
    return;
  }

  elements.ordersEmpty.hidden = true;
  elements.ordersTableWrap.hidden = false;

  elements.ordersTableBody.innerHTML = state.orders
    .map((order) => {
      const status = ORDER_STATUS[order.status] ?? ORDER_STATUS.pending_payment;
      const notification = getNotificationSummary(order);
      const isRetrying = state.notifyingOrderId === order.id;
      const orderDiscounts = order.totals?.orderDiscounts ?? [];
      const paymentStatus = String(order.payment?.status || "").trim();
      const paymentStatusDetail = String(order.payment?.statusDetail || "").trim();
      const paymentId = String(order.payment?.paymentId || "").trim();

      return `
        <tr>
          <td class="order-meta">
            <strong>${escapeHtml(order.id)}</strong>
            <small>${escapeHtml(formatDateTime(order.createdAt))}</small>
          </td>
          <td class="order-customer">
            <strong>${escapeHtml(order.customer?.name || "Sin nombre")}</strong>
            <small>${escapeHtml(order.customer?.phone || "Sin telefono")}</small>
            <small>${escapeHtml(order.customer?.location || "Sin localidad")}</small>
          </td>
          <td>
            ${formatOrderItems(order)}
            ${
              order.customer?.notes
                ? `<small style="display:block;margin-top:8px;color:var(--ink-500);">${escapeHtml(order.customer.notes)}</small>`
                : ""
            }
          </td>
          <td>
            <strong>${formatCurrency(order.totals?.amount ?? 0)}</strong>
            <small style="display:block;margin-top:4px;color:var(--ink-500);">${order.totals?.units ?? 0} unidades reales</small>
            ${
              order.totals?.discountAmount
                ? `<small style="display:block;margin-top:4px;color:var(--sea-600);">Descuentos: -${formatCurrency(order.totals.discountAmount)}</small>`
                : ""
            }
            ${
              orderDiscounts.length
                ? `<small style="display:block;margin-top:6px;color:var(--ink-500);">${escapeHtml(orderDiscounts.map((discount) => discount.label).join(" | "))}</small>`
                : ""
            }
          </td>
          <td>
            <span class="status-chip ${status.className}">${escapeHtml(status.label)}</span>
            ${
              paymentStatus
                ? `<small style="display:block;margin-top:8px;color:var(--ink-500);">Pago MP: ${escapeHtml(paymentStatus)}</small>`
                : ""
            }
            ${
              paymentStatusDetail
                ? `<small style="display:block;margin-top:4px;color:var(--ink-500);">Detalle MP: ${escapeHtml(paymentStatusDetail)}</small>`
                : ""
            }
            ${
              paymentId
                ? `<small style="display:block;margin-top:4px;color:var(--ink-500);">ID pago: ${escapeHtml(paymentId)}</small>`
                : ""
            }
            <label class="field" style="margin-top:10px;">
              <span>Actualizar</span>
              <select data-order-status="${order.id}">
                ${Object.entries(ORDER_STATUS)
                  .map(
                    ([key, definition]) => `
                      <option value="${key}" ${key === order.status ? "selected" : ""}>
                        ${escapeHtml(definition.label)}
                      </option>
                    `,
                  )
                  .join("")}
              </select>
            </label>
          </td>
          <td>
            <div class="order-notification ${notification.toneClassName}">
              <strong>${escapeHtml(notification.label)}</strong>
              <small>${escapeHtml(notification.detail)}</small>
              ${
                notification.canRetry
                  ? `
                    <button
                      class="button button--ghost order-notification__action"
                      type="button"
                      data-order-notify="${order.id}"
                      ${isRetrying ? "disabled" : ""}
                    >
                      ${isRetrying ? "Reintentando..." : getNotificationActionLabel()}
                    </button>
                  `
                  : ""
              }
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderPurchaseDiscounts() {
  const discounts = state.config.offers.purchaseDiscounts ?? [];
  if (!discounts.length) {
    elements.purchaseDiscountList.innerHTML = `<div class="offer-empty">Todavia no hay descuentos por compra configurados.</div>`;
    return;
  }

  elements.purchaseDiscountList.innerHTML = discounts
    .map(
      (discount, index) => `
        <article class="offer-card">
          <div class="offer-card__header">
            <strong>Escalon ${index + 1}</strong>
            <label class="offer-toggle">
              <input
                type="checkbox"
                data-offer-kind="purchaseDiscounts"
                data-offer-index="${index}"
                data-field="enabled"
                ${discount.enabled ? "checked" : ""}
              >
              <span>Activo</span>
            </label>
          </div>
          <div class="offer-card__grid">
            <label class="field">
              <span>Compra minima</span>
              <input type="number" min="1" step="1" value="${discount.thresholdAmount}" data-offer-kind="purchaseDiscounts" data-offer-index="${index}" data-field="thresholdAmount">
            </label>
            <label class="field">
              <span>Porcentaje</span>
              <input type="number" min="1" max="100" step="1" value="${discount.percentOff}" data-offer-kind="purchaseDiscounts" data-offer-index="${index}" data-field="percentOff">
            </label>
          </div>
          <button class="offer-card__remove" type="button" data-offer-remove="purchaseDiscounts" data-offer-index="${index}">Eliminar</button>
        </article>
      `,
    )
    .join("");
}

function renderProductDiscounts() {
  const discounts = state.config.offers.productDiscounts ?? [];
  if (!discounts.length) {
    elements.productDiscountList.innerHTML = `<div class="offer-empty">Todavia no hay descuentos por producto configurados.</div>`;
    return;
  }

  elements.productDiscountList.innerHTML = discounts
    .map(
      (discount, index) => `
        <article class="offer-card">
          <div class="offer-card__header">
            <strong>Descuento ${index + 1}</strong>
            <label class="offer-toggle">
              <input
                type="checkbox"
                data-offer-kind="productDiscounts"
                data-offer-index="${index}"
                data-field="enabled"
                ${discount.enabled ? "checked" : ""}
              >
              <span>Activo</span>
            </label>
          </div>
          <div class="offer-card__grid">
            <label class="field">
              <span>Producto</span>
              <select data-offer-kind="productDiscounts" data-offer-index="${index}" data-field="productId">
                ${getProductOptions(discount.productId)}
              </select>
            </label>
            <label class="field">
              <span>Porcentaje</span>
              <input type="number" min="1" max="100" step="1" value="${discount.percentOff}" data-offer-kind="productDiscounts" data-offer-index="${index}" data-field="percentOff">
            </label>
          </div>
          <button class="offer-card__remove" type="button" data-offer-remove="productDiscounts" data-offer-index="${index}">Eliminar</button>
        </article>
      `,
    )
    .join("");
}

function renderCoupons() {
  const coupons = state.config.offers.coupons ?? [];
  if (!coupons.length) {
    elements.couponList.innerHTML = `<div class="offer-empty">Todavia no hay cupones creados.</div>`;
    return;
  }

  elements.couponList.innerHTML = coupons
    .map(
      (coupon, index) => `
        <article class="offer-card">
          <div class="offer-card__header">
            <strong>Cupon ${index + 1}</strong>
            <label class="offer-toggle">
              <input
                type="checkbox"
                data-offer-kind="coupons"
                data-offer-index="${index}"
                data-field="enabled"
                ${coupon.enabled ? "checked" : ""}
              >
              <span>Activo</span>
            </label>
          </div>
          <div class="offer-card__grid">
            <label class="field">
              <span>Codigo</span>
              <input type="text" maxlength="20" value="${escapeHtml(coupon.code)}" data-offer-kind="coupons" data-offer-index="${index}" data-field="code">
            </label>
            <label class="field">
              <span>Porcentaje</span>
              <input type="number" min="1" max="100" step="1" value="${coupon.percentOff}" data-offer-kind="coupons" data-offer-index="${index}" data-field="percentOff">
            </label>
          </div>
          <button class="offer-card__remove" type="button" data-offer-remove="coupons" data-offer-index="${index}">Eliminar</button>
        </article>
      `,
    )
    .join("");
}

function renderPackOffers() {
  const packOffers = state.config.offers.packOffers ?? [];
  elements.packSectionVisible.checked = state.config.offers.packSectionVisible !== false;

  if (!packOffers.length) {
    elements.packOfferList.innerHTML = `<div class="offer-empty">Todavia no hay packs configurados.</div>`;
    return;
  }

  elements.packOfferList.innerHTML = packOffers
    .map(
      (packOffer, packIndex) => `
        <article class="offer-card">
          <div class="offer-card__header">
            <strong>${escapeHtml(packOffer.name || `Pack ${packIndex + 1}`)}</strong>
            <label class="offer-toggle">
              <input
                type="checkbox"
                data-offer-kind="packOffers"
                data-offer-index="${packIndex}"
                data-field="enabled"
                ${packOffer.enabled ? "checked" : ""}
              >
              <span>Activo</span>
            </label>
          </div>
          <div class="offer-card__grid">
            <label class="field">
              <span>Nombre del pack</span>
              <input type="text" value="${escapeHtml(packOffer.name)}" data-offer-kind="packOffers" data-offer-index="${packIndex}" data-field="name">
            </label>
            <label class="field">
              <span>Porcentaje</span>
              <input type="number" min="1" max="100" step="1" value="${packOffer.percentOff}" data-offer-kind="packOffers" data-offer-index="${packIndex}" data-field="percentOff">
            </label>
            <label class="field" style="grid-column:1 / -1;">
              <span>Descripcion</span>
              <input type="text" value="${escapeHtml(packOffer.description || "")}" data-offer-kind="packOffers" data-offer-index="${packIndex}" data-field="description">
            </label>
          </div>
          <div class="offer-card__actions">
            <span class="offer-pill">${packOffer.items.length} productos cargados</span>
            <button class="button button--ghost" type="button" data-pack-add-item="${packIndex}">Agregar producto al pack</button>
          </div>
          <div class="pack-items">
            ${packOffer.items
              .map(
                (item, itemIndex) => `
                  <div class="pack-item-row">
                    <label class="field">
                      <span>Producto</span>
                      <select data-pack-index="${packIndex}" data-pack-item-index="${itemIndex}" data-pack-field="productId">
                        ${getProductOptions(item.productId)}
                      </select>
                    </label>
                    <label class="field">
                      <span>Cantidad</span>
                      <input type="number" min="1" step="1" value="${item.qty}" data-pack-index="${packIndex}" data-pack-item-index="${itemIndex}" data-pack-field="qty">
                    </label>
                    <button class="pack-item-remove" type="button" data-pack-remove-item="${packIndex}" data-pack-item-index="${itemIndex}">
                      Quitar
                    </button>
                  </div>
                `,
              )
              .join("")}
          </div>
          <button class="offer-card__remove" type="button" data-offer-remove="packOffers" data-offer-index="${packIndex}">Eliminar pack</button>
        </article>
      `,
    )
    .join("");
}

function renderPromotions() {
  renderPurchaseDiscounts();
  renderProductDiscounts();
  renderPackOffers();
  renderCoupons();
}

function renderAll() {
  elements.markupInput.value = String(getMarkupPercent(state.config));
  renderMetrics();
  renderTopProducts();
  renderOrders();
  renderPromotions();
}

async function loadDashboard() {
  const [config, orders, metrics, notificationState, catalog] = await Promise.all([
    apiClient.getConfig(),
    apiClient.listOrders(),
    apiClient.getMetrics(),
    apiClient.listNotifications(),
    apiClient.getCatalog(),
  ]);
  state.config = getNormalizedConfig({ ...defaultConfig, ...config });
  state.orders = orders;
  state.metrics = metrics;
  state.notifications = notificationState.notifications ?? [];
  state.catalog = catalog ?? { products: [] };
  state.notificationChannels = {
    whatsappEnabled: notificationState.channels?.whatsappEnabled !== false,
    emailEnabled: notificationState.channels?.emailEnabled !== false,
  };
}

function showAuth(status) {
  state.setupRequired = status.setupRequired;
  state.authenticated = status.authenticated;
  elements.adminAuth.hidden = status.authenticated;
  elements.panelSection.hidden = !status.authenticated;
  elements.logoutButton.hidden = !status.authenticated;

  if (status.authenticated) {
    return;
  }

  elements.authEyebrow.textContent = status.setupRequired ? "Primer acceso" : "Acceso interno";
  elements.authTitle.textContent = status.setupRequired ? "Crear usuario administrador" : "Ingresar al panel";
  elements.authDescription.textContent = status.setupRequired
    ? "Crea el usuario que podra modificar precios, ver pedidos y gestionar promociones."
    : "Este panel permite modificar precios, promociones y pedidos. Inicia sesion para continuar.";
  elements.authSubmit.textContent = status.setupRequired ? "Crear administrador" : "Ingresar";
}

async function refreshAuthStatus() {
  const status = await apiClient.getAuthStatus();
  showAuth(status);
  return status;
}

function getOfferCollection(collectionName) {
  return state.config.offers[collectionName];
}

function addPurchaseDiscount() {
  state.config.offers.purchaseDiscounts.push({
    id: makeDraftId("purchase"),
    enabled: true,
    thresholdAmount: 30000,
    percentOff: 10,
  });
  renderPromotions();
  setOffersFeedback("", "");
}

function addProductDiscount() {
  state.config.offers.productDiscounts.push({
    id: makeDraftId("product"),
    enabled: true,
    productId: getSortedProducts()[0]?.id || "",
    percentOff: 10,
  });
  renderPromotions();
  setOffersFeedback("", "");
}

function addPackOffer() {
  state.config.offers.packOffers.push({
    id: makeDraftId("pack"),
    enabled: true,
    name: `Pack ${state.config.offers.packOffers.length + 1}`,
    description: "Describe brevemente por que conviene este pack.",
    percentOff: 10,
    items: [
      {
        productId: getSortedProducts()[0]?.id || "",
        qty: 1,
      },
    ],
  });
  renderPromotions();
  setOffersFeedback("", "");
}

function addCoupon() {
  state.config.offers.coupons.push({
    id: makeDraftId("coupon"),
    enabled: true,
    code: `CUPON${state.config.offers.coupons.length + 1}`,
    percentOff: 10,
  });
  renderPromotions();
  setOffersFeedback("", "");
}

function removeOffer(collectionName, index) {
  getOfferCollection(collectionName).splice(index, 1);
  renderPromotions();
  setOffersFeedback("", "");
}

function addPackItem(packIndex) {
  state.config.offers.packOffers[packIndex]?.items.push({
    productId: getSortedProducts()[0]?.id || "",
    qty: 1,
  });
  renderPromotions();
  setOffersFeedback("", "");
}

function removePackItem(packIndex, itemIndex) {
  state.config.offers.packOffers[packIndex]?.items.splice(itemIndex, 1);
  renderPromotions();
  setOffersFeedback("", "");
}

async function saveOffers() {
  if (state.offersSaving) {
    return;
  }

  state.offersSaving = true;
  elements.offersSaveButton.disabled = true;
  elements.offersSaveButton.textContent = "Guardando...";

  try {
    state.config = getNormalizedConfig(
      await apiClient.updateConfig({
        markupPercent: getMarkupPercent(state.config),
        offers: state.config.offers,
      }),
    );
    renderPromotions();
    setOffersFeedback("success", "Las promociones se guardaron correctamente.");
  } catch (error) {
    setOffersFeedback("warning", error.message || "No se pudieron guardar las promociones.");
  } finally {
    state.offersSaving = false;
    elements.offersSaveButton.disabled = false;
    elements.offersSaveButton.textContent = "Guardar promociones";
  }
}

function updateOfferField(target) {
  const collectionName = target.dataset.offerKind;
  const index = Number(target.dataset.offerIndex);
  const field = target.dataset.field;
  const collection = getOfferCollection(collectionName);
  const entry = collection?.[index];
  if (!entry) {
    return;
  }

  if (target.type === "checkbox") {
    entry[field] = target.checked;
  } else if (field === "percentOff" || field === "thresholdAmount") {
    entry[field] = Number(target.value);
  } else {
    entry[field] = target.value;
  }

  setOffersFeedback("", "");
}

function updatePackItemField(target) {
  const packIndex = Number(target.dataset.packIndex);
  const itemIndex = Number(target.dataset.packItemIndex);
  const field = target.dataset.packField;
  const item = state.config.offers.packOffers?.[packIndex]?.items?.[itemIndex];
  if (!item) {
    return;
  }

  item[field] = field === "qty" ? Number(target.value) : target.value;
  setOffersFeedback("", "");
}

function attachEvents() {
  elements.authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    elements.authFeedback.textContent = "";
    const payload = {
      username: elements.authUsername.value.trim(),
      password: elements.authPassword.value,
    };

    try {
      if (state.setupRequired) {
        await apiClient.setupAdmin(payload);
      }
      await apiClient.login(payload);
      elements.authForm.reset();
      await refreshAuthStatus();
      await loadDashboard();
      renderAll();
    } catch (error) {
      elements.authFeedback.textContent = error.message || "No se pudo iniciar sesion.";
    }
  });

  elements.logoutButton.addEventListener("click", async () => {
    await apiClient.logout();
    await refreshAuthStatus();
  });

  elements.markupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nextPercent = Number(elements.markupInput.value);
    state.config = getNormalizedConfig(
      await apiClient.updateConfig({
        markupPercent: Number.isFinite(nextPercent) ? Math.max(0, Math.round(nextPercent)) : defaultConfig.markupPercent,
        offers: state.config.offers,
      }),
    );
    await loadDashboard();
    renderAll();
  });

  elements.ordersTableBody.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-order-status]");
    if (!select) {
      return;
    }

    await apiClient.updateOrderStatus(select.dataset.orderStatus, select.value);
    await loadDashboard();
    renderAll();
  });

  elements.ordersTableBody.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-order-notify]");
    if (!button) {
      return;
    }

    state.notifyingOrderId = button.dataset.orderNotify;
    renderOrders();

    try {
      await apiClient.notifyOrder(state.notifyingOrderId);
      await loadDashboard();
    } finally {
      state.notifyingOrderId = null;
      renderAll();
    }
  });

  elements.addPurchaseDiscount?.addEventListener("click", addPurchaseDiscount);
  elements.addProductDiscount?.addEventListener("click", addProductDiscount);
  elements.addPackOffer?.addEventListener("click", addPackOffer);
  elements.addCoupon?.addEventListener("click", addCoupon);
  elements.offersSaveButton?.addEventListener("click", saveOffers);

  elements.promotionsPanel?.addEventListener("input", (event) => {
    const target = event.target;
    if (target.id === "packSectionVisible") {
      state.config.offers.packSectionVisible = target.checked;
      setOffersFeedback("", "");
      return;
    }

    if (target.dataset.packField) {
      updatePackItemField(target);
      return;
    }

    if (target.dataset.offerKind && target.dataset.field) {
      updateOfferField(target);
    }
  });

  elements.promotionsPanel?.addEventListener("change", (event) => {
    const target = event.target;
    if (target.id === "packSectionVisible") {
      state.config.offers.packSectionVisible = target.checked;
      setOffersFeedback("", "");
      return;
    }

    if (target.dataset.packField) {
      updatePackItemField(target);
      return;
    }

    if (target.dataset.offerKind && target.dataset.field) {
      updateOfferField(target);
    }
  });

  elements.promotionsPanel?.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-offer-remove]");
    if (removeButton) {
      removeOffer(removeButton.dataset.offerRemove, Number(removeButton.dataset.offerIndex));
      return;
    }

    const addPackItemButton = event.target.closest("[data-pack-add-item]");
    if (addPackItemButton) {
      addPackItem(Number(addPackItemButton.dataset.packAddItem));
      return;
    }

    const removePackItemButton = event.target.closest("[data-pack-remove-item]");
    if (removePackItemButton) {
      removePackItem(Number(removePackItemButton.dataset.packRemoveItem), Number(removePackItemButton.dataset.packItemIndex));
    }
  });
}

async function init() {
  renderAll();
  attachEvents();
  const status = await refreshAuthStatus();
  if (status.authenticated) {
    await loadDashboard();
    renderAll();
  }
}

init().catch((error) => {
  console.error(error);
  elements.metricGrid.innerHTML = `
    <article class="metric-card">
      <span>Backend</span>
      <strong>No disponible</strong>
    </article>
  `;
});
