import { catalogData } from "./data/catalog.js";
import {
  buildCartPricing,
  getDefaultOffers,
  getDisplayPrice as getOfferAwareDisplayPrice,
  getMarkupPercent as getNormalizedMarkupPercent,
  getPackPricing,
  getProductPricing,
  getVisiblePackOffers,
  normalizeCartItems,
  normalizeConfig,
  sanitizeCouponCode,
} from "./pricing-rules.js";

export { catalogData };

export const STORAGE_KEYS = {
  cart: "botanica-del-mar-cart",
  coupon: "botanica-del-mar-coupon",
  orders: "botanica-del-mar-orders",
  config: "botanica-del-mar-config",
};

export const ORDER_STATUS = {
  pending_payment: {
    label: "Pendiente de pago",
    className: "status-chip--pending",
  },
  paid: {
    label: "Pagado",
    className: "status-chip--paid",
  },
  fulfilled: {
    label: "Entregado",
    className: "status-chip--fulfilled",
  },
  cancelled: {
    label: "Cancelado",
    className: "status-chip--cancelled",
  },
  refunded: {
    label: "Devuelto",
    className: "status-chip--refunded",
  },
};

export const defaultConfig = {
  markupPercent: catalogData.defaultMarkupPercent,
  offers: getDefaultOffers(),
};

export const categoryOrder = new Map(catalogData.categories.map((category, index) => [category.id, index]));
export const productMap = new Map(catalogData.products.map((product) => [product.id, product]));

export function loadStoredJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveStoredJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function formatCurrency(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDateTime(isoString) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(isoString));
}

export function getMarkupPercent(config) {
  return getNormalizedMarkupPercent(config, defaultConfig.markupPercent);
}

export function getDisplayPrice(product, config) {
  return getOfferAwareDisplayPrice(product, config, defaultConfig.markupPercent);
}

export function getNormalizedConfig(config) {
  return normalizeConfig(config, defaultConfig.markupPercent);
}

export function getProductPriceDetails(product, config) {
  return getProductPricing(product, config, defaultConfig.markupPercent);
}

export function getPackOfferDetails(packOffer, catalog, config) {
  return getPackPricing(packOffer, catalog, config, defaultConfig.markupPercent);
}

export function getVisiblePackPromotions(catalog, config) {
  return getVisiblePackOffers(catalog, config, defaultConfig.markupPercent);
}

export function getCartPricing(cartItems, catalog, config, couponCode = "") {
  return buildCartPricing({
    cartItems,
    catalog,
    config,
    couponCode,
    defaultMarkupPercent: defaultConfig.markupPercent,
  });
}

export function normalizeStoredCartItems(cartItems) {
  return normalizeCartItems(cartItems);
}

export function normalizeCoupon(value) {
  return sanitizeCouponCode(value);
}
