function clampPercent(value) {
  const normalized = Math.round(Number(value));
  if (!Number.isFinite(normalized)) {
    return 0;
  }

  return Math.max(0, Math.min(100, normalized));
}

function roundMoney(value) {
  const normalized = Math.round(Number(value));
  return Number.isFinite(normalized) ? normalized : 0;
}

function asBoolean(value, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function sanitizeCode(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .slice(0, 20);
}

function buildId(prefix, index) {
  return `${prefix}-${index + 1}`;
}

function normalizePurchaseDiscount(entry, index) {
  const thresholdAmount = roundMoney(entry?.thresholdAmount);
  const percentOff = clampPercent(entry?.percentOff);
  if (thresholdAmount <= 0 || percentOff <= 0) {
    return null;
  }

  return {
    id: String(entry?.id || buildId("purchase", index)).trim(),
    enabled: asBoolean(entry?.enabled, true),
    thresholdAmount,
    percentOff,
  };
}

function normalizeProductDiscount(entry, index) {
  const productId = String(entry?.productId || "").trim();
  const percentOff = clampPercent(entry?.percentOff);
  if (!productId || percentOff <= 0) {
    return null;
  }

  return {
    id: String(entry?.id || buildId("product", index)).trim(),
    enabled: asBoolean(entry?.enabled, true),
    productId,
    percentOff,
  };
}

function normalizePackItem(entry) {
  const productId = String(entry?.productId || "").trim();
  const qty = Math.max(1, Math.round(Number(entry?.qty || 1)));
  if (!productId) {
    return null;
  }

  return {
    productId,
    qty,
  };
}

function normalizePackOffer(entry, index) {
  const name = String(entry?.name || "").trim();
  const items = asArray(entry?.items).map(normalizePackItem).filter(Boolean);
  const percentOff = clampPercent(entry?.percentOff);
  if (!name || !items.length || percentOff <= 0) {
    return null;
  }

  return {
    id: String(entry?.id || buildId("pack", index)).trim(),
    enabled: asBoolean(entry?.enabled, true),
    name,
    description: String(entry?.description || "").trim(),
    percentOff,
    items,
  };
}

function normalizeCoupon(entry, index) {
  const code = sanitizeCode(entry?.code);
  const percentOff = clampPercent(entry?.percentOff);
  if (!code || percentOff <= 0) {
    return null;
  }

  return {
    id: String(entry?.id || buildId("coupon", index)).trim(),
    enabled: asBoolean(entry?.enabled, true),
    code,
    percentOff,
  };
}

export function getDefaultOffers() {
  return {
    packSectionVisible: true,
    purchaseDiscounts: [],
    packOffers: [],
    productDiscounts: [],
    coupons: [],
  };
}

export function normalizeOffers(rawOffers) {
  const offers = rawOffers ?? {};
  return {
    packSectionVisible: asBoolean(offers.packSectionVisible, true),
    purchaseDiscounts: asArray(offers.purchaseDiscounts).map(normalizePurchaseDiscount).filter(Boolean),
    packOffers: asArray(offers.packOffers).map(normalizePackOffer).filter(Boolean),
    productDiscounts: asArray(offers.productDiscounts).map(normalizeProductDiscount).filter(Boolean),
    coupons: asArray(offers.coupons).map(normalizeCoupon).filter(Boolean),
  };
}

export function normalizeConfig(config, defaultMarkupPercent = 0) {
  return {
    markupPercent: Math.max(0, roundMoney(config?.markupPercent ?? defaultMarkupPercent)),
    offers: normalizeOffers(config?.offers),
  };
}

export function normalizeCartItems(cartItems) {
  return asArray(cartItems)
    .map((entry) => {
      const id = String(entry?.id || "").trim();
      const qty = Math.max(0, Math.round(Number(entry?.qty || 0)));
      const kind = String(entry?.kind || "product").trim().toLowerCase() === "pack" ? "pack" : "product";
      if (!id || qty <= 0) {
        return null;
      }

      return {
        kind,
        id,
        qty,
      };
    })
    .filter(Boolean);
}

export function getMarkupPercent(config, defaultMarkupPercent = 0) {
  return normalizeConfig(config, defaultMarkupPercent).markupPercent;
}

export function getBaseDisplayPrice(product, config, defaultMarkupPercent = 0) {
  const normalizedConfig = normalizeConfig(config, defaultMarkupPercent);
  return roundMoney(Number(product?.basePrice || 0) * (1 + normalizedConfig.markupPercent / 100));
}

export function getBestProductDiscount(productId, config) {
  const normalizedConfig = normalizeConfig(config);
  return normalizedConfig.offers.productDiscounts
    .filter((discount) => discount.enabled && discount.productId === productId)
    .sort((left, right) => right.percentOff - left.percentOff)[0] ?? null;
}

export function getProductPricing(product, config, defaultMarkupPercent = 0) {
  const originalPrice = getBaseDisplayPrice(product, config, defaultMarkupPercent);
  const appliedDiscount = getBestProductDiscount(product?.id, config);
  const discountAmount = appliedDiscount ? roundMoney((originalPrice * appliedDiscount.percentOff) / 100) : 0;
  const finalPrice = Math.max(0, originalPrice - discountAmount);

  return {
    originalPrice,
    finalPrice,
    discountAmount,
    appliedDiscount: appliedDiscount
      ? {
          ...appliedDiscount,
          label: `${appliedDiscount.percentOff}% OFF`,
        }
      : null,
  };
}

export function getDisplayPrice(product, config, defaultMarkupPercent = 0) {
  return getProductPricing(product, config, defaultMarkupPercent).finalPrice;
}

export function sanitizeCouponCode(value) {
  return sanitizeCode(value);
}

export function getCouponByCode(code, config) {
  const normalizedCode = sanitizeCode(code);
  if (!normalizedCode) {
    return null;
  }

  const normalizedConfig = normalizeConfig(config);
  return normalizedConfig.offers.coupons.find((coupon) => coupon.enabled && coupon.code === normalizedCode) ?? null;
}

export function getBestPurchaseDiscount(subtotal, config) {
  const normalizedConfig = normalizeConfig(config);
  return normalizedConfig.offers.purchaseDiscounts
    .filter((discount) => discount.enabled && subtotal >= discount.thresholdAmount)
    .sort((left, right) => {
      if (right.thresholdAmount !== left.thresholdAmount) {
        return right.thresholdAmount - left.thresholdAmount;
      }

      return right.percentOff - left.percentOff;
    })[0] ?? null;
}

function buildProductsById(catalog) {
  return new Map(asArray(catalog?.products).map((product) => [product.id, product]));
}

export function getPackPricing(packOffer, catalog, config, defaultMarkupPercent = 0) {
  const productsById = buildProductsById(catalog);
  const normalizedConfig = normalizeConfig(config, defaultMarkupPercent);
  const percentOff = clampPercent(packOffer?.percentOff);
  const packItems = asArray(packOffer?.items);
  const resolvedItems = packItems
    .map((item) => {
      const product = productsById.get(item.productId);
      if (!product) {
        return null;
      }

      const pricing = getProductPricing(product, normalizedConfig, defaultMarkupPercent);
      return {
        id: product.id,
        name: product.name,
        image: product.image,
        presentation: product.presentation,
        brand: product.brand,
        unitPrice: pricing.finalPrice,
        qty: Math.max(1, Math.round(Number(item.qty || 1))),
      };
    })
    .filter(Boolean);

  if (!resolvedItems.length || resolvedItems.length !== packItems.length) {
    return null;
  }

  const originalUnitPrice = resolvedItems.reduce((total, item) => total + item.unitPrice * item.qty, 0);
  const discountAmount = roundMoney((originalUnitPrice * percentOff) / 100);
  const finalUnitPrice = Math.max(0, originalUnitPrice - discountAmount);

  return {
    id: packOffer.id,
    name: String(packOffer.name || "").trim(),
    description: String(packOffer.description || "").trim(),
    enabled: asBoolean(packOffer.enabled, true),
    percentOff,
    image: resolvedItems[0]?.image || "",
    brand: resolvedItems[0]?.brand || "",
    totalProductUnits: resolvedItems.reduce((total, item) => total + item.qty, 0),
    originalUnitPrice,
    finalUnitPrice,
    discountAmount,
    items: resolvedItems,
  };
}

export function getVisiblePackOffers(catalog, config, defaultMarkupPercent = 0) {
  const normalizedConfig = normalizeConfig(config, defaultMarkupPercent);
  if (!normalizedConfig.offers.packSectionVisible) {
    return [];
  }

  return normalizedConfig.offers.packOffers
    .filter((offer) => offer.enabled)
    .map((offer) => getPackPricing(offer, catalog, normalizedConfig, defaultMarkupPercent))
    .filter(Boolean);
}

export function buildCartPricing({ cartItems, catalog, config, couponCode = "", defaultMarkupPercent = 0 }) {
  const normalizedConfig = normalizeConfig(config, defaultMarkupPercent);
  const normalizedCartItems = normalizeCartItems(cartItems);
  const productsById = buildProductsById(catalog);
  const packOffersById = new Map(normalizedConfig.offers.packOffers.map((offer) => [offer.id, offer]));
  const items = [];
  const invalidItems = [];

  for (const cartItem of normalizedCartItems) {
    if (cartItem.kind === "pack") {
      const packOffer = packOffersById.get(cartItem.id);
      if (!packOffer || !packOffer.enabled) {
        invalidItems.push(cartItem);
        continue;
      }

      const pricing = getPackPricing(packOffer, catalog, normalizedConfig, defaultMarkupPercent);
      if (!pricing) {
        invalidItems.push(cartItem);
        continue;
      }

      const originalLineTotal = pricing.originalUnitPrice * cartItem.qty;
      const lineTotal = pricing.finalUnitPrice * cartItem.qty;
      items.push({
        kind: "pack",
        id: pricing.id,
        name: pricing.name,
        description: pricing.description,
        image: pricing.image,
        presentation: `${pricing.totalProductUnits} productos`,
        qty: cartItem.qty,
        fulfillmentUnits: pricing.totalProductUnits * cartItem.qty,
        originalUnitPrice: pricing.originalUnitPrice,
        unitPrice: pricing.finalUnitPrice,
        originalLineTotal,
        lineTotal,
        directDiscountAmount: originalLineTotal - lineTotal,
        appliedDirectDiscount:
          pricing.discountAmount > 0
            ? {
                type: "pack",
                id: pricing.id,
                percentOff: pricing.percentOff,
                label: `${pricing.percentOff}% OFF`,
                amount: originalLineTotal - lineTotal,
              }
            : null,
        packItems: pricing.items.map((packItem) => ({
          productId: packItem.id,
          name: packItem.name,
          presentation: packItem.presentation,
          qtyPerPack: packItem.qty,
          totalQty: packItem.qty * cartItem.qty,
        })),
      });
      continue;
    }

    const product = productsById.get(cartItem.id);
    if (!product) {
      invalidItems.push(cartItem);
      continue;
    }

    const pricing = getProductPricing(product, normalizedConfig, defaultMarkupPercent);
    const originalLineTotal = pricing.originalPrice * cartItem.qty;
    const lineTotal = pricing.finalPrice * cartItem.qty;
    items.push({
      kind: "product",
      id: product.id,
      name: product.name,
      image: product.image,
      presentation: product.presentation,
      categoryName: product.categoryName,
      qty: cartItem.qty,
      fulfillmentUnits: cartItem.qty,
      originalUnitPrice: pricing.originalPrice,
      unitPrice: pricing.finalPrice,
      originalLineTotal,
      lineTotal,
      directDiscountAmount: originalLineTotal - lineTotal,
      appliedDirectDiscount: pricing.appliedDiscount
        ? {
            type: "product",
            id: pricing.appliedDiscount.id,
            percentOff: pricing.appliedDiscount.percentOff,
            label: pricing.appliedDiscount.label,
            amount: originalLineTotal - lineTotal,
          }
        : null,
    });
  }

  const originalSubtotal = items.reduce((total, item) => total + item.originalLineTotal, 0);
  const subtotal = items.reduce((total, item) => total + item.lineTotal, 0);
  const directDiscountAmount = originalSubtotal - subtotal;
  const orderDiscounts = [];

  const purchaseDiscount = getBestPurchaseDiscount(subtotal, normalizedConfig);
  let runningTotal = subtotal;
  if (purchaseDiscount) {
    const amount = roundMoney((runningTotal * purchaseDiscount.percentOff) / 100);
    if (amount > 0) {
      runningTotal -= amount;
      orderDiscounts.push({
        type: "purchase",
        id: purchaseDiscount.id,
        label: `${purchaseDiscount.percentOff}% OFF por compra superior a $${purchaseDiscount.thresholdAmount}`,
        amount,
        percentOff: purchaseDiscount.percentOff,
        thresholdAmount: purchaseDiscount.thresholdAmount,
      });
    }
  }

  const normalizedCouponCode = sanitizeCode(couponCode);
  const coupon = getCouponByCode(normalizedCouponCode, normalizedConfig);
  if (coupon) {
    const amount = roundMoney((runningTotal * coupon.percentOff) / 100);
    if (amount > 0) {
      runningTotal -= amount;
      orderDiscounts.push({
        type: "coupon",
        id: coupon.id,
        label: `Cupon ${coupon.code}`,
        amount,
        percentOff: coupon.percentOff,
        code: coupon.code,
      });
    }
  }

  return {
    items,
    invalidItems,
    originalSubtotal,
    subtotal,
    directDiscountAmount,
    orderDiscounts,
    totalDiscountAmount: originalSubtotal - Math.max(0, runningTotal),
    total: Math.max(0, runningTotal),
    cartUnits: normalizedCartItems.reduce((total, item) => total + item.qty, 0),
    fulfillmentUnits: items.reduce((total, item) => total + item.fulfillmentUnits, 0),
    couponCode: normalizedCouponCode,
    appliedCoupon: coupon,
    invalidCouponCode: normalizedCouponCode && !coupon ? normalizedCouponCode : "",
  };
}
