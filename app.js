import {
  STORAGE_KEYS,
  defaultConfig,
  formatCurrency,
  getCartPricing,
  getNormalizedConfig,
  getProductPriceDetails,
  getVisiblePackPromotions,
  loadStoredJson,
  normalizeCoupon,
  normalizeStoredCartItems,
  saveStoredJson,
} from "./store-common.js";
import { apiClient } from "./api-client.js";

let catalogData = {
  brandOptions: [],
  categories: [],
  products: [],
};
let categoryOrder = new Map();
let productMap = new Map();
let configRefreshInFlight = false;
const productAssetVersion = Date.now().toString(36);
let revealObserver = null;

const elements = {
  siteHeader: document.querySelector(".site-header"),
  siteHeaderCoupon: document.querySelector("#headerCoupon"),
  brandSwitcher: document.querySelector("#brandSwitcher"),
  categoryNav: document.querySelector("#categoryNav"),
  searchInput: document.querySelector("#searchInput"),
  sortSelect: document.querySelector("#sortSelect"),
  catalogSummary: document.querySelector("#catalogSummary"),
  activeFilters: document.querySelector("#activeFilters"),
  productGrid: document.querySelector("#productGrid"),
  packOffersSection: document.querySelector("#packOffersSection"),
  packOffersGrid: document.querySelector("#packOffersGrid"),
  cartCount: document.querySelector("#cartCount"),
  floatingCartCount: document.querySelector("#floatingCartCount"),
  cartDrawer: document.querySelector("#cartDrawer"),
  cartToggle: document.querySelector("#cartToggle"),
  floatingCartToggle: document.querySelector("#floatingCartToggle"),
  cartClose: document.querySelector("#cartClose"),
  cartClear: document.querySelector("#cartClear"),
  cartItems: document.querySelector("#cartItems"),
  cartSubtotal: document.querySelector("#cartSubtotal"),
  cartSavingsWrap: document.querySelector("#cartSavingsWrap"),
  cartSavings: document.querySelector("#cartSavings"),
  cartDiscountList: document.querySelector("#cartDiscountList"),
  cartTotal: document.querySelector("#cartTotal"),
  cartSuccess: document.querySelector("#cartSuccess"),
  checkoutForm: document.querySelector("#checkoutForm"),
  checkoutName: document.querySelector("#checkoutName"),
  checkoutPhone: document.querySelector("#checkoutPhone"),
  checkoutEmail: document.querySelector("#checkoutEmail"),
  checkoutLocation: document.querySelector("#checkoutLocation"),
  checkoutAddress: document.querySelector("#checkoutAddress"),
  addressSuggestions: document.querySelector("#addressSuggestions"),
  addressStatus: document.querySelector("#addressStatus"),
  checkoutNotes: document.querySelector("#checkoutNotes"),
  couponInput: document.querySelector("#couponInput"),
  couponRedeem: document.querySelector("#couponRedeem"),
  couponFeedback: document.querySelector("#couponFeedback"),
  menuToggle: document.querySelector("#menuToggle"),
  mainNav: document.querySelector("#mainNav"),
  modalBackdrop: document.querySelector("#modalBackdrop"),
  productModal: document.querySelector("#productModal"),
  productClose: document.querySelector("#productClose"),
  productModalImage: document.querySelector("#productModalImage"),
  productModalPackGallery: document.querySelector("#productModalPackGallery"),
  productModalContent: document.querySelector("#productModalContent"),
};

const state = {
  brand: "biocom",
  category: "all",
  search: "",
  sort: "recommended",
  cart: normalizeStoredCartItems(loadStoredJson(STORAGE_KEYS.cart, [])),
  config: getNormalizedConfig(defaultConfig),
  appliedCouponCode: loadStoredCouponCode(),
  couponDraft: loadStoredCouponCode(),
  couponFeedback: {
    tone: "muted",
    message: "",
  },
  pendingQuantities: {},
  activeProductId: null,
  lastScrollY: window.scrollY,
  headerScrollQueued: false,
  headerHidden: false,
  selectedAddress: null,
  addressDebounceTimer: null,
  addressRequestId: 0,
};

function loadStoredCouponCode() {
  try {
    return normalizeCoupon(localStorage.getItem(STORAGE_KEYS.coupon) || "");
  } catch {
    return "";
  }
}

function saveCouponCode() {
  try {
    if (state.appliedCouponCode) {
      localStorage.setItem(STORAGE_KEYS.coupon, state.appliedCouponCode);
      return;
    }

    localStorage.removeItem(STORAGE_KEYS.coupon);
  } catch {
    // noop
  }
}

function escapeHtml(value) {
  const normalizedValue = String(value ?? "")
    .replace(/&/g, " y ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return normalizedValue.replace(/[&<>"']/g, (char) => {
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

  return `./${imagePath}?v=${productAssetVersion}`;
}

function getPresentationLabel(product) {
  return String(product.presentationDetail || product.presentation || "").trim();
}

function getPendingKey(kind, id) {
  return `${kind}:${id}`;
}

function getPendingQty(kind, id) {
  return Math.max(1, Math.round(Number(state.pendingQuantities[getPendingKey(kind, id)] || 1)));
}

function setPendingQty(kind, id, nextQty) {
  state.pendingQuantities[getPendingKey(kind, id)] = Math.max(1, Math.round(Number(nextQty || 1)));
  syncPendingQtyDisplays(kind, id);
}

function syncPendingQtyDisplays(kind, id) {
  const key = getPendingKey(kind, id);
  const qty = String(getPendingQty(kind, id));
  for (const node of document.querySelectorAll(`[data-pending-qty="${key}"]`)) {
    node.textContent = qty;
  }
}

function getVisibleProducts() {
  const term = state.search.trim().toLowerCase();

  let products = catalogData.products.filter((product) => {
    const matchesBrand = product.brand.toLowerCase() === state.brand;
    const matchesCategory = state.category === "all" || product.categoryId === state.category;
    const haystack = [
      product.name,
      product.summary,
      product.description,
      product.presentation,
      product.presentationDetail,
      product.categoryName,
      product.subtitle ?? "",
      product.colorVariant ?? "",
      ...(product.actives ?? []),
      ...(product.benefits ?? []),
    ]
      .join(" ")
      .toLowerCase();

    return matchesBrand && matchesCategory && (!term || haystack.includes(term));
  });

  switch (state.sort) {
    case "price-asc":
      products = products.sort((left, right) => getProductPrice(left) - getProductPrice(right));
      break;
    case "price-desc":
      products = products.sort((left, right) => getProductPrice(right) - getProductPrice(left));
      break;
    case "name-asc":
      products = products.sort((left, right) => left.name.localeCompare(right.name, "es"));
      break;
    default:
      products = products.sort((left, right) => {
        const categoryDiff = (categoryOrder.get(left.categoryId) ?? 0) - (categoryOrder.get(right.categoryId) ?? 0);
        return categoryDiff !== 0 ? categoryDiff : left.name.localeCompare(right.name, "es");
      });
  }

  return products;
}

function getVisiblePackOffers() {
  return getVisiblePackPromotions(catalogData, state.config).filter((packOffer) => {
    const brand = String(packOffer.brand || "").trim().toLowerCase();
    return !brand || brand === state.brand;
  });
}

function getProductPrice(product) {
  return Number(product?.displayPrice) || getProductPriceDetails(product, state.config).finalPrice;
}

function getCartPricingState() {
  return getCartPricing(state.cart, catalogData, state.config, state.appliedCouponCode);
}

function sanitizeCartState() {
  const pricing = getCartPricingState();
  if (pricing.invalidItems.length) {
    const invalidKeys = new Set(pricing.invalidItems.map((item) => getPendingKey(item.kind, item.id)));
    state.cart = state.cart.filter((item) => !invalidKeys.has(getPendingKey(item.kind, item.id)));
    saveCart();
  }

  if (pricing.invalidCouponCode) {
    state.appliedCouponCode = "";
    state.couponDraft = "";
    saveCouponCode();
    setCouponFeedback("warning", "El cupón que habías aplicado ya no está disponible.");
  }
}

function preloadStorefrontImages() {
  const sources = [
    "./assets/logo-header.webp",
    ...catalogData.products.slice(0, 8).map((product) => getProductImageUrl(product.image)),
  ];

  for (const src of sources) {
    const image = new Image();
    image.decoding = "async";
    image.src = src;
  }
}

function getCategoryCount(categoryId) {
  return catalogData.products.filter(
    (product) => product.brand.toLowerCase() === state.brand && product.categoryId === categoryId,
  ).length;
}

function saveCart() {
  saveStoredJson(STORAGE_KEYS.cart, state.cart);
}

function setCartSuccess(message = "") {
  if (!message) {
    elements.cartSuccess.hidden = true;
    elements.cartSuccess.textContent = "";
    return;
  }

  elements.cartSuccess.hidden = false;
  elements.cartSuccess.textContent = message;
}

function setCouponFeedback(tone, message) {
  state.couponFeedback = { tone, message };
  renderCouponState();
}

function setAddressStatus(message, tone = "muted") {
  if (!elements.addressStatus) {
    return;
  }

  elements.addressStatus.textContent = message;
  elements.addressStatus.dataset.tone = tone;
}

function clearAddressSuggestions() {
  if (!elements.addressSuggestions) {
    return;
  }

  elements.addressSuggestions.hidden = true;
  elements.addressSuggestions.innerHTML = "";
}

function resetSelectedAddress(message = "Elegí una dirección sugerida para que podamos verificar la entrega.") {
  state.selectedAddress = null;
  setAddressStatus(message, "muted");
}

function renderAddressSuggestions(suggestions) {
  if (!elements.addressSuggestions) {
    return;
  }

  if (!suggestions.length) {
    elements.addressSuggestions.innerHTML = `
      <div class="address-suggestions__empty">No encontramos sugerencias para esa búsqueda.</div>
    `;
    elements.addressSuggestions.hidden = false;
    return;
  }

  elements.addressSuggestions.innerHTML = suggestions
    .map(
      (suggestion) => `
        <button type="button" data-address-place-id="${escapeHtml(suggestion.placeId)}" data-address-label="${escapeHtml(suggestion.label)}">
          ${escapeHtml(suggestion.label)}
        </button>
      `,
    )
    .join("");
  elements.addressSuggestions.hidden = false;
}

function handleAddressInput() {
  window.clearTimeout(state.addressDebounceTimer);
  resetSelectedAddress();

  const input = elements.checkoutAddress.value.trim();
  const location = elements.checkoutLocation.value.trim();
  if (!input || input.length < 3) {
    clearAddressSuggestions();
    return;
  }

  if (!location) {
    clearAddressSuggestions();
    setAddressStatus("Primero elegí una localidad para buscar calles cercanas.", "warning");
    return;
  }

  const requestId = ++state.addressRequestId;
  state.addressDebounceTimer = window.setTimeout(async () => {
    try {
      setAddressStatus("Buscando direcciones reales...", "muted");
      const result = await apiClient.suggestAddresses({ input, location });
      if (requestId !== state.addressRequestId) {
        return;
      }

      if (!result.configured) {
        clearAddressSuggestions();
        setAddressStatus("Google Maps no está configurado para validar direcciones.", "warning");
        return;
      }

      renderAddressSuggestions(result.suggestions || []);
    } catch (error) {
      clearAddressSuggestions();
      setAddressStatus(error.message || "No pudimos buscar direcciones ahora.", "warning");
    }
  }, 320);
}

function handleAddressSuggestionClick(event) {
  const option = event.target.closest("[data-address-place-id]");
  if (!option) {
    return;
  }

  state.selectedAddress = {
    placeId: option.dataset.addressPlaceId,
    label: option.dataset.addressLabel,
  };
  elements.checkoutAddress.value = state.selectedAddress.label;
  clearAddressSuggestions();
  setAddressStatus("Dirección seleccionada. La validaremos antes de crear el pago.", "success");
}

function syncFloatingCartVisibility() {
  elements.floatingCartToggle?.classList.toggle("is-visible", state.headerHidden);
}

function openCart(message = "") {
  closeMenu();
  state.headerHidden = false;
  elements.siteHeader?.classList.remove("is-hidden");
  syncFloatingCartVisibility();
  syncLayoutMetrics();
  elements.cartDrawer.classList.add("is-open");
  elements.cartDrawer.setAttribute("aria-hidden", "false");
  setCartSuccess(message);
}

function closeCart() {
  elements.cartDrawer.classList.remove("is-open");
  elements.cartDrawer.setAttribute("aria-hidden", "true");
  setCartSuccess("");
  syncLayoutMetrics();
}

function openMenu() {
  if (!elements.mainNav || !elements.menuToggle) {
    return;
  }

  elements.mainNav.classList.add("is-open");
  elements.menuToggle.setAttribute("aria-expanded", "true");
}

function closeMenu() {
  if (!elements.mainNav || !elements.menuToggle) {
    return;
  }

  elements.mainNav.classList.remove("is-open");
  elements.menuToggle.setAttribute("aria-expanded", "false");
}

function toggleMenu() {
  if (!elements.mainNav) {
    return;
  }

  if (elements.mainNav.classList.contains("is-open")) {
    closeMenu();
    return;
  }

  openMenu();
}

function handleHeaderScroll() {
  if (!elements.siteHeader) {
    return;
  }

  const currentY = window.scrollY;
  const delta = currentY - state.lastScrollY;
  const isProductOpen = elements.productModal && !elements.productModal.hidden;
  const isCartOpen = elements.cartDrawer.classList.contains("is-open");
  const isMenuOpen = elements.mainNav?.classList.contains("is-open");

  elements.siteHeader.classList.toggle("is-scrolled", currentY > 12);

  if (currentY <= 8 || isProductOpen || isCartOpen || isMenuOpen) {
    state.headerHidden = false;
    elements.siteHeader.classList.toggle("is-hidden", state.headerHidden);
    syncFloatingCartVisibility();
    state.lastScrollY = currentY;
    syncLayoutMetrics();
    return;
  }

  if (Math.abs(delta) >= 8) {
    state.headerHidden = delta > 0;
  }

  elements.siteHeader.classList.toggle("is-hidden", state.headerHidden);
  syncFloatingCartVisibility();
  state.lastScrollY = currentY;
  syncLayoutMetrics();
}

function queueHeaderScroll() {
  if (state.headerScrollQueued) {
    return;
  }

  state.headerScrollQueued = true;
  window.requestAnimationFrame(() => {
    handleHeaderScroll();
    state.headerScrollQueued = false;
  });
}

function roundCurrencyAmount(value) {
  const normalized = Math.round(Number(value));
  return Number.isFinite(normalized) ? Math.max(0, normalized) : 0;
}

function getAppliedCoupon() {
  const couponCode = normalizeCoupon(state.appliedCouponCode);
  if (!couponCode) {
    return null;
  }

  return state.config.offers.coupons.find((coupon) => coupon.enabled && coupon.code === couponCode) ?? null;
}

function getCouponAdjustedAmount(amount) {
  const coupon = getAppliedCoupon();
  const originalAmount = roundCurrencyAmount(amount);
  if (!coupon) {
    return {
      coupon: null,
      originalAmount,
      finalAmount: originalAmount,
      discountAmount: 0,
    };
  }

  const discountAmount = roundCurrencyAmount((originalAmount * coupon.percentOff) / 100);
  return {
    coupon,
    originalAmount,
    finalAmount: Math.max(0, originalAmount - discountAmount),
    discountAmount,
  };
}

function getDisplayProductPricing(product) {
  const pricing = getProductPriceDetails(product, state.config);
  const couponEffect = getCouponAdjustedAmount(pricing.finalPrice);
  return {
    ...pricing,
    coupon: couponEffect.coupon,
    displayFinalPrice: couponEffect.finalAmount,
    displayReferencePrice: couponEffect.coupon ? pricing.finalPrice : pricing.originalPrice,
    showReferencePrice: couponEffect.coupon
      ? couponEffect.finalAmount < pricing.finalPrice
      : pricing.originalPrice > pricing.finalPrice,
  };
}

function getDisplayPackPricing(packOffer) {
  const couponEffect = getCouponAdjustedAmount(packOffer.finalUnitPrice);
  return {
    ...packOffer,
    coupon: couponEffect.coupon,
    displayFinalUnitPrice: couponEffect.finalAmount,
    displayReferenceUnitPrice: couponEffect.coupon ? packOffer.finalUnitPrice : packOffer.originalUnitPrice,
    showReferencePrice: couponEffect.coupon
      ? couponEffect.finalAmount < packOffer.finalUnitPrice
      : packOffer.originalUnitPrice > packOffer.finalUnitPrice,
  };
}

function syncLayoutMetrics() {
  const headerHeight = Math.round(elements.siteHeader?.getBoundingClientRect().height || 0);
  const offset = state.headerHidden ? 24 : headerHeight + 18;
  document.documentElement.style.setProperty("--header-offset", `${Math.max(24, offset)}px`);
}

function renderCartState() {
  renderSummary(getVisibleProducts());
  renderCart();
  syncLayoutMetrics();
}

function ensureRevealObserver() {
  if (revealObserver || !("IntersectionObserver" in window)) {
    return;
  }

  revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }

        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    },
    {
      threshold: 0.14,
      rootMargin: "0px 0px -8% 0px",
    },
  );
}

function observeRevealTargets(root = document) {
  const targets = Array.from(root.querySelectorAll?.("[data-reveal]") || []);
  if (!targets.length) {
    return;
  }

  if (!("IntersectionObserver" in window)) {
    for (const target of targets) {
      target.classList.add("is-visible");
    }
    return;
  }

  ensureRevealObserver();
  for (const target of targets) {
    if (target.classList.contains("is-visible")) {
      continue;
    }

    revealObserver.observe(target);
  }
}

function renderPriceBlock(product) {
  const pricing = getDisplayProductPricing(product);
  const presentationLabel = getPresentationLabel(product);
  return `
    <div class="price-block">
      ${
        pricing.showReferencePrice
          ? `<small class="price-block__before">${formatCurrency(pricing.displayReferencePrice)}</small>`
          : ""
      }
      <strong>${formatCurrency(pricing.displayFinalPrice)}</strong>
      ${presentationLabel ? `<small>${escapeHtml(presentationLabel)}</small>` : ""}
      ${
        pricing.coupon
          ? `<span class="price-block__coupon">Cupón ${escapeHtml(pricing.coupon.code)} aplicado</span>`
          : ""
      }
    </div>
  `;
}

function renderPendingQtyControl(kind, id) {
  const key = getPendingKey(kind, id);
  return `
    <div class="qty-picker">
      <button type="button" data-pending-step="-1" data-pending-kind="${kind}" data-pending-id="${id}" aria-label="Restar una unidad">-</button>
      <span data-pending-qty="${key}">${getPendingQty(kind, id)}</span>
      <button type="button" data-pending-step="1" data-pending-kind="${kind}" data-pending-id="${id}" aria-label="Sumar una unidad">+</button>
    </div>
  `;
}

function openProduct(productId) {
  const product = productMap.get(productId);
  if (!product) {
    return;
  }

  const pricing = getDisplayProductPricing(product);
  const detailTags = [
    product.subtitle ? escapeHtml(product.subtitle) : "",
    pricing.appliedDiscount ? escapeHtml(pricing.appliedDiscount.label) : "",
  ].filter(Boolean);
  const presentationLabel = getPresentationLabel(product);

  closeMenu();
  state.headerHidden = false;
  elements.siteHeader?.classList.remove("is-hidden");
  elements.productModal.classList.remove("product-modal--pack");
  state.activeProductId = productId;
  elements.productModal.dataset.productId = product.id;
  elements.productModalImage.hidden = false;
  elements.productModalPackGallery.hidden = true;
  elements.productModalPackGallery.innerHTML = "";
  elements.productModalImage.src = getProductImageUrl(product.image);
  elements.productModalImage.alt = product.name;
  elements.productModalContent.innerHTML = `
    <span class="eyebrow">${escapeHtml(product.categoryName)}</span>
    <h3>${escapeHtml(product.name)}</h3>
    ${product.colorVariant ? `<span class="product-card__variant">${escapeHtml(product.colorVariant)}</span>` : ""}
    <p>${escapeHtml(product.description)}</p>

    <div class="detail-meta">
      ${product.presentation ? `<span>${escapeHtml(product.presentation)}</span>` : ""}
      <span>${escapeHtml(product.brand)}</span>
    </div>

    <div class="detail-price">
      ${
        pricing.showReferencePrice
          ? `<small>${formatCurrency(pricing.displayReferencePrice)}</small>`
          : ""
      }
      <strong>${formatCurrency(pricing.displayFinalPrice)}</strong>
      ${
        pricing.coupon
          ? `<span class="detail-price__coupon">Cupón ${escapeHtml(pricing.coupon.code)} aplicado al precio final.</span>`
          : ""
      }
    </div>

    ${
      detailTags.length
        ? `<div class="detail-tags">${detailTags.map((tag) => `<span>${tag}</span>`).join("")}</div>`
        : ""
    }

    <div class="detail-blocks">
      <article class="detail-block" ${presentationLabel ? "" : "hidden"}>
        <strong>Presentación</strong>
        <p>${escapeHtml(presentationLabel)}</p>
      </article>
      ${
        product.actives?.length
          ? `
            <article class="detail-block">
              <strong>Activos principales</strong>
              <ul class="detail-list">
                ${product.actives.map((active) => `<li>${escapeHtml(active)}</li>`).join("")}
              </ul>
            </article>
          `
          : ""
      }
      ${
        product.benefits?.length
          ? `
            <article class="detail-block">
              <strong>Beneficios</strong>
              <ul class="detail-list">
                ${product.benefits.map((benefit) => `<li>${escapeHtml(benefit)}</li>`).join("")}
              </ul>
            </article>
          `
          : ""
      }
      ${
        product.howToUse
          ? `
            <article class="detail-block">
              <strong>Modo de aplicación</strong>
              <p>${escapeHtml(product.howToUse)}</p>
            </article>
          `
          : ""
      }
    </div>

    <div class="detail-purchase">
      <label>
        <span>Cantidad</span>
        ${renderPendingQtyControl("product", product.id)}
      </label>
    </div>

    <div class="detail-actions">
      <button class="button button--secondary" type="button" data-close-product="true">Seguir viendo</button>
      <button class="button button--primary" type="button" data-add-kind="product" data-add-id="${product.id}">Agregar al carrito</button>
    </div>
  `;
  elements.modalBackdrop.hidden = false;
  elements.productModal.hidden = false;
  elements.productModal.scrollTop = 0;
  elements.productModalContent.scrollTop = 0;
  syncLayoutMetrics();
  syncPendingQtyDisplays("product", product.id);
}

function openPack(packId) {
  const visiblePackOffer = getVisiblePackOffers().find((packOffer) => packOffer.id === packId);
  if (!visiblePackOffer) {
    return;
  }
  const packOffer = getDisplayPackPricing(visiblePackOffer);

  closeMenu();
  state.headerHidden = false;
  elements.siteHeader?.classList.remove("is-hidden");
  elements.productModal.classList.add("product-modal--pack");
  state.activeProductId = null;
  delete elements.productModal.dataset.productId;
  elements.productModalImage.hidden = true;
  elements.productModalImage.src = "";
  elements.productModalImage.alt = "";
  elements.productModalPackGallery.hidden = false;
  elements.productModalPackGallery.innerHTML = `
    <div class="modal-pack-gallery__header">
      <span class="eyebrow">Productos del pack</span>
      <strong>${packOffer.items.length} productos para revisar</strong>
    </div>
    <div class="modal-pack-gallery__list">
      ${packOffer.items
        .map(
          (item) => `
            <article class="modal-pack-item">
              <img src="${getProductImageUrl(item.image)}" alt="${escapeHtml(item.name)}">
              <div class="modal-pack-item__copy">
                <strong>${escapeHtml(item.name)}</strong>
                <span>${escapeHtml(item.presentation)}</span>
                <span>${item.qty} por pack</span>
              </div>
              <button class="button button--ghost" type="button" data-open-product="${item.id}">Ver detalle</button>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
  elements.productModalContent.innerHTML = `
    <span class="eyebrow">Pack especial</span>
    <h3>${escapeHtml(packOffer.name)}</h3>
    <p>${escapeHtml(packOffer.description || "Armamos esta combinación para que compres varias referencias en un solo movimiento.")}</p>

    <div class="detail-meta">
      <span>${packOffer.totalProductUnits} unidades por pack</span>
      <span>${packOffer.items.length} productos distintos</span>
    </div>

    <div class="detail-tags">
      <span>${escapeHtml(`${packOffer.percentOff}% OFF`)}</span>
    </div>

    <div class="detail-price">
      ${
        packOffer.showReferencePrice
          ? `<small>${formatCurrency(packOffer.displayReferenceUnitPrice)}</small>`
          : ""
      }
      <strong>${formatCurrency(packOffer.displayFinalUnitPrice)}</strong>
      ${
        packOffer.coupon
          ? `<span class="detail-price__coupon">El cupón se aplica sobre el valor promocional del pack.</span>`
          : ""
      }
    </div>

    <div class="detail-blocks">
      <article class="detail-block">
        <strong>Incluye</strong>
        <ul class="detail-list">
          ${packOffer.items.map((item) => `<li>${item.qty} x ${escapeHtml(item.name)}</li>`).join("")}
        </ul>
      </article>
    </div>

    <div class="detail-purchase">
      <label>
        <span>Cantidad</span>
        ${renderPendingQtyControl("pack", packOffer.id)}
      </label>
    </div>

    <div class="detail-actions">
      <button class="button button--secondary" type="button" data-close-product="true">Seguir viendo</button>
      <button class="button button--primary" type="button" data-add-kind="pack" data-add-id="${packOffer.id}">Agregar pack</button>
    </div>
  `;
  elements.modalBackdrop.hidden = false;
  elements.productModal.hidden = false;
  elements.productModal.scrollTop = 0;
  elements.productModalPackGallery.scrollTop = 0;
  elements.productModalContent.scrollTop = 0;
  syncLayoutMetrics();
  syncPendingQtyDisplays("pack", packOffer.id);
}

function closeProduct() {
  state.activeProductId = null;
  elements.modalBackdrop.hidden = true;
  elements.productModal.hidden = true;
  elements.productModal.classList.remove("product-modal--pack");
  delete elements.productModal.dataset.productId;
  elements.productModalImage.hidden = false;
  elements.productModalImage.src = "";
  elements.productModalImage.alt = "";
  elements.productModalPackGallery.hidden = true;
  elements.productModalPackGallery.innerHTML = "";
  elements.productModalContent.innerHTML = "";
  syncLayoutMetrics();
}

function upsertCartItem(kind, itemId, nextQty) {
  const safeQty = Math.max(0, Math.floor(nextQty));
  const nextCart = state.cart
    .map((item) => (item.id === itemId && item.kind === kind ? { ...item, qty: safeQty } : item))
    .filter((item) => item.qty > 0);

  if (!nextCart.some((item) => item.id === itemId && item.kind === kind) && safeQty > 0) {
    nextCart.push({ kind, id: itemId, qty: safeQty });
  }

  state.cart = nextCart;
  saveCart();
  renderCartState();
}

function getCartItemLabel(kind, itemId) {
  if (kind === "pack") {
    return getVisiblePackPromotions(catalogData, state.config).find((packOffer) => packOffer.id === itemId)?.name || "Pack";
  }

  return productMap.get(itemId)?.name || "Producto";
}

function addToCart(kind, itemId, qty = 1, { openDrawer = false } = {}) {
  const existing = state.cart.find((item) => item.kind === kind && item.id === itemId);
  const currentQty = existing?.qty ?? 0;
  upsertCartItem(kind, itemId, currentQty + qty);
  setPendingQty(kind, itemId, 1);

  if (openDrawer) {
    openCart(`${getCartItemLabel(kind, itemId)} se agrego al carrito.`);
  }
}

function stepCartItem(kind, itemId, delta) {
  const existing = state.cart.find((item) => item.kind === kind && item.id === itemId);
  if (!existing) {
    return;
  }

  upsertCartItem(kind, itemId, existing.qty + delta);
}

function removeCartItem(kind, itemId) {
  upsertCartItem(kind, itemId, 0);
}

function clearCart() {
  if (!state.cart.length) {
    setCartSuccess("El carrito ya estaba vacío.");
    return;
  }

  state.cart = [];
  saveCart();
  renderCartState();
  setCartSuccess("El carrito se vació.");
}

function applyCouponCode() {
  const nextCode = normalizeCoupon(elements.couponInput.value);
  state.couponDraft = nextCode;
  if (!nextCode) {
    state.appliedCouponCode = "";
    saveCouponCode();
    setCouponFeedback("warning", "Ingresa un codigo antes de intentar canjearlo.");
    renderAllStorefront();
    return;
  }

  const pricing = getCartPricing(state.cart, catalogData, state.config, nextCode);
  if (pricing.invalidCouponCode) {
    setCouponFeedback("warning", "Ese cupón no existe o ya no está activo.");
    return;
  }

  state.appliedCouponCode = nextCode;
  state.couponDraft = nextCode;
  saveCouponCode();
  setCouponFeedback("success", `Cupón ${nextCode} aplicado correctamente.`);
  renderAllStorefront();
}

function clearCouponCode() {
  state.appliedCouponCode = "";
  state.couponDraft = "";
  saveCouponCode();
  setCouponFeedback("muted", "");
  renderAllStorefront();
}

function handleCouponAction() {
  const nextCode = normalizeCoupon(elements.couponInput?.value || "");
  if (state.appliedCouponCode && (!nextCode || nextCode === state.appliedCouponCode)) {
    clearCouponCode();
    return;
  }

  applyCouponCode();
}

function renderBrandSwitcher() {
  elements.brandSwitcher.innerHTML = catalogData.brandOptions
    .map(
      (brand) => `
        <button
          class="brand-chip ${state.brand === brand.id ? "is-active" : ""}"
          type="button"
          data-brand="${brand.id}"
        >
          ${escapeHtml(brand.label)}
        </button>
      `,
    )
    .join("");
}

function renderCategoryNav() {
  const totalProducts = catalogData.products.filter((product) => product.brand.toLowerCase() === state.brand).length;
  const allButton = `
    <button class="category-button ${state.category === "all" ? "is-active" : ""}" type="button" data-category="all">
      <span>Todos los productos</span>
      <span>${totalProducts}</span>
    </button>
  `;

  const categoryButtons = catalogData.categories
    .filter((category) => getCategoryCount(category.id) > 0)
    .map(
      (category) => `
        <button class="category-button ${state.category === category.id ? "is-active" : ""}" type="button" data-category="${category.id}">
          <span>${escapeHtml(category.label)}</span>
          <span>${getCategoryCount(category.id)}</span>
        </button>
      `,
    )
    .join("");

  elements.categoryNav.innerHTML = allButton + categoryButtons;
}

function renderPackOffers() {
  const packOffers = getVisiblePackOffers();
  if (!packOffers.length) {
    elements.packOffersSection.hidden = true;
    elements.packOffersGrid.innerHTML = "";
    return;
  }

  elements.packOffersSection.hidden = false;
  elements.packOffersGrid.innerHTML = packOffers
    .map((packOffer) => {
      const displayPricing = getDisplayPackPricing(packOffer);
      return `
        <article class="pack-card">
          <div class="pack-card__header">
            <div>
              <span class="eyebrow">Pack destacado</span>
              <h3>${escapeHtml(packOffer.name)}</h3>
            </div>
            <span class="pack-card__badge">${escapeHtml(packOffer.percentOff)}% OFF</span>
          </div>
          ${packOffer.description ? `<p>${escapeHtml(packOffer.description)}</p>` : ""}
          <ul class="pack-card__list">
            ${packOffer.items.map((item) => `<li>${item.qty} x ${escapeHtml(item.name)}</li>`).join("")}
          </ul>
          <div class="pack-card__footer">
            <div class="pack-card__price">
              ${
                displayPricing.showReferencePrice
                  ? `<small>${formatCurrency(displayPricing.displayReferenceUnitPrice)}</small>`
                  : ""
              }
              <strong>${formatCurrency(displayPricing.displayFinalUnitPrice)}</strong>
              ${
                displayPricing.coupon
                  ? `<span class="pack-card__price-note">Cupón ${escapeHtml(displayPricing.coupon.code)} aplicado</span>`
                  : ""
              }
            </div>
            <div class="pack-card__purchase">
              ${renderPendingQtyControl("pack", packOffer.id)}
              <div class="pack-card__actions">
                <button class="button button--ghost" type="button" data-open-pack="${packOffer.id}">Ver detalle</button>
                <button class="button button--primary" type="button" data-add-kind="pack" data-add-id="${packOffer.id}">
                  Agregar pack
                </button>
              </div>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  for (const packOffer of packOffers) {
    syncPendingQtyDisplays("pack", packOffer.id);
  }
}

function renderSummary(products) {
  const selectedCategory = catalogData.categories.find((category) => category.id === state.category);
  const categoryLabel = selectedCategory ? selectedCategory.label : "Todos los productos";
  const pricing = getCartPricingState();

  elements.catalogSummary.innerHTML = `
    <strong>${escapeHtml(categoryLabel)}</strong>
    <div>${products.length} productos visibles - ${pricing.cartUnits} unidades en carrito</div>
  `;

  const filterPills = [];
  if (selectedCategory) {
    filterPills.push(`<span class="filter-pill">${escapeHtml(selectedCategory.label)}</span>`);
  }
  if (state.search.trim()) {
    filterPills.push(`<span class="filter-pill">Búsqueda: ${escapeHtml(state.search.trim())}</span>`);
  }
  if (state.appliedCouponCode) {
    filterPills.push(`<span class="filter-pill">Cupón: ${escapeHtml(state.appliedCouponCode)}</span>`);
  }

  elements.activeFilters.innerHTML = filterPills.join("");
}

function renderProductGrid() {
  const products = getVisibleProducts();
  renderSummary(products);

  if (!products.length) {
    elements.productGrid.innerHTML = `
      <article class="empty-state">
        <span class="eyebrow">Sin resultados</span>
        <h3>No encontramos productos con esos filtros</h3>
        <p>Probá con otra categoría o cambia la búsqueda para volver a explorar el catálogo.</p>
      </article>
    `;
    return;
  }

  elements.productGrid.innerHTML = products
    .map(
      (product, index) => {
        const pricing = getDisplayProductPricing(product);
        const badgeLabels = [pricing.appliedDiscount ? pricing.appliedDiscount.label : ""].filter(Boolean);
        return `
          <article class="product-card" data-product-id="${product.id}">
            <div class="product-card__media" data-product-media>
              <img
                src="${getProductImageUrl(product.image)}"
                alt="${escapeHtml(product.name)}"
                ${index < 12 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'}
              >
              <div class="product-card__fallback" data-product-fallback hidden>
                <strong>${escapeHtml(product.name)}</strong>
                <span>Imagen del producto</span>
              </div>
              ${
                badgeLabels.length
                  ? `
                    <div class="product-card__badge-stack">
                      ${badgeLabels.map((label) => `<span class="product-card__offer-badge">${escapeHtml(label)}</span>`).join("")}
                    </div>
                  `
                  : ""
              }
            </div>
            <div class="product-card__body">
              <div class="product-card__meta">
                <span>${escapeHtml(product.categoryName)}</span>
                ${product.presentation ? `<span>${escapeHtml(product.presentation)}</span>` : ""}
              </div>
              <h3>${escapeHtml(product.name)}</h3>
              ${product.colorVariant ? `<span class="product-card__variant">${escapeHtml(product.colorVariant)}</span>` : ""}
              <p>${escapeHtml(product.summary)}</p>
              ${renderPriceBlock(product)}
              <div class="product-card__purchase">
                <div>
                  <small class="product-card__qty-label">Cantidad</small>
                  ${renderPendingQtyControl("product", product.id)}
                </div>
                <button class="button button--primary product-card__add" type="button" data-add-kind="product" data-add-id="${product.id}">
                  Agregar
                </button>
              </div>
              <div class="product-card__actions">
                <button class="product-card__detail" type="button" data-open-product="${product.id}">Ver detalle</button>
              </div>
            </div>
          </article>
        `;
      },
    )
    .join("");

  bindProductCardMedia();
  for (const product of products) {
    syncPendingQtyDisplays("product", product.id);
  }
}

function bindProductCardMedia() {
  for (const media of elements.productGrid.querySelectorAll("[data-product-media]")) {
    const image = media.querySelector("img");
    const fallback = media.querySelector("[data-product-fallback]");
    if (!image || !fallback) {
      continue;
    }

    const showFallback = () => {
      fallback.hidden = false;
      image.hidden = true;
    };

    if (image.complete && image.naturalWidth === 0) {
      showFallback();
      continue;
    }

    image.addEventListener("error", showFallback, { once: true });
  }
}

function renderCouponState() {
  const draftCode = normalizeCoupon(state.couponDraft);
  const hasAppliedCoupon = Boolean(state.appliedCouponCode);
  const isEditingDifferentCode = hasAppliedCoupon && draftCode && draftCode !== state.appliedCouponCode;

  if (elements.couponInput) {
    elements.couponInput.value = state.couponDraft;
    elements.couponInput.setAttribute("aria-invalid", state.couponFeedback.tone === "warning" ? "true" : "false");
  }

  if (elements.couponFeedback) {
    elements.couponFeedback.textContent = state.couponFeedback.message;
  }

  if (elements.siteHeaderCoupon) {
    elements.siteHeaderCoupon.dataset.tone = state.couponFeedback.tone;
    elements.siteHeaderCoupon.classList.toggle("is-applied", hasAppliedCoupon && !isEditingDifferentCode);
    elements.siteHeaderCoupon.classList.toggle("is-editing", Boolean(isEditingDifferentCode));
  }

  if (elements.couponRedeem) {
    if (hasAppliedCoupon && !isEditingDifferentCode) {
      elements.couponRedeem.textContent = "Quitar";
    } else if (hasAppliedCoupon && isEditingDifferentCode) {
      elements.couponRedeem.textContent = "Cambiar";
    } else {
      elements.couponRedeem.textContent = "Canjear";
    }
  }

  syncLayoutMetrics();
}

function renderCart() {
  const pricing = getCartPricingState();
  const cartCount = String(pricing.cartUnits);
  elements.cartCount.textContent = cartCount;
  if (elements.floatingCartCount) {
    elements.floatingCartCount.textContent = cartCount;
  }

  elements.cartSubtotal.textContent = formatCurrency(pricing.subtotal);
  elements.cartTotal.textContent = formatCurrency(pricing.total);
  elements.cartSavingsWrap.hidden = pricing.totalDiscountAmount <= 0;
  elements.cartSavings.textContent = `-${formatCurrency(pricing.totalDiscountAmount)}`;
  elements.cartDiscountList.innerHTML = pricing.orderDiscounts
    .map(
      (discount) => `
        <div class="cart-summary__row cart-summary__row--discount">
          <span>${escapeHtml(discount.label)}</span>
          <strong>-${formatCurrency(discount.amount)}</strong>
        </div>
      `,
    )
    .join("");
  syncFloatingCartVisibility();

  if (!pricing.items.length) {
    elements.cartItems.innerHTML = `
      <div class="cart-empty">
        <strong>Tu carrito está vacío.</strong>
        <p>Agrega productos o packs promocionales y luego completa el formulario para dejar tu pedido.</p>
      </div>
    `;
    return;
  }

  elements.cartItems.innerHTML = pricing.items
    .map((item) => {
      const includedPackItems =
        item.kind === "pack" && Array.isArray(item.packItems) && item.packItems.length
          ? `
            <ul class="cart-item__pack-list">
              ${item.packItems.map((packItem) => `<li>${packItem.totalQty} x ${escapeHtml(packItem.name)}</li>`).join("")}
            </ul>
          `
          : "";

      return `
        <article class="cart-item">
          <div class="cart-item__top">
            <img src="${getProductImageUrl(item.image)}" alt="${escapeHtml(item.name)}">
            <div>
              <strong>${escapeHtml(item.name)}</strong>
              <div class="cart-item__meta">${escapeHtml(item.presentation)}</div>
              ${
                item.directDiscountAmount > 0
                  ? `<div class="cart-item__offer">${escapeHtml(item.appliedDirectDiscount?.label || "Oferta aplicada")}</div>`
                  : ""
              }
            </div>
            <div class="cart-item__price">
              ${
                item.originalLineTotal > item.lineTotal
                  ? `<small>${formatCurrency(item.originalLineTotal)}</small>`
                  : ""
              }
              <strong>${formatCurrency(item.lineTotal)}</strong>
            </div>
          </div>
          ${includedPackItems}
          <div class="cart-item__controls">
            <div class="qty-controls">
              <button type="button" data-cart-step="-1" data-cart-kind="${item.kind}" data-cart-id="${item.id}" aria-label="Restar una unidad">-</button>
              <span>${item.qty}</span>
              <button type="button" data-cart-step="1" data-cart-kind="${item.kind}" data-cart-id="${item.id}" aria-label="Sumar una unidad">+</button>
            </div>
            <button class="remove-button" type="button" data-remove-cart="${item.id}" data-remove-kind="${item.kind}">Quitar</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function createOrderFromForm() {
  return {
    brand: state.brand,
    deviceSessionId: String(window.MP_DEVICE_SESSION_ID || "").trim(),
    customer: {
      name: elements.checkoutName.value.trim(),
      phone: elements.checkoutPhone.value.trim(),
      email: elements.checkoutEmail.value.trim(),
      location: elements.checkoutLocation.value.trim(),
      address: elements.checkoutAddress.value.trim(),
      addressPlaceId: state.selectedAddress?.placeId || "",
      notes: elements.checkoutNotes.value.trim(),
    },
    couponCode: state.appliedCouponCode,
    items: state.cart.map((item) => ({ kind: item.kind, id: item.id, qty: item.qty })),
  };
}

async function handleCheckout(event) {
  event.preventDefault();
  setCartSuccess("");

  const pricing = getCartPricingState();
  if (!pricing.items.length) {
    openCart("Agrega al menos un producto antes de finalizar el pedido.");
    return;
  }

  try {
    setCartSuccess("Validando dirección de entrega...");
    await apiClient.validateAddress({
      address: elements.checkoutAddress.value.trim(),
      location: elements.checkoutLocation.value.trim(),
      placeId: state.selectedAddress?.placeId || "",
    });
    setCartSuccess("Dirección validada. Creando pedido...");
    const checkout = await apiClient.createCheckout(createOrderFromForm());
    const order = checkout.order;
    const paymentUrl = checkout.payment?.checkoutUrl || checkout.payment?.sandboxInitPoint || checkout.payment?.initPoint;
    state.cart = [];
    state.appliedCouponCode = "";
    state.couponDraft = "";
    state.selectedAddress = null;
    saveCart();
    saveCouponCode();
    elements.checkoutForm.reset();
    resetSelectedAddress();
    clearAddressSuggestions();
    setCouponFeedback("muted", "");
    renderAllStorefront();
    if (paymentUrl) {
      openCart(`Pedido creado. Te estamos llevando a Mercado Pago para abonar ${order.totals.units} unidades.`);
      window.location.href = paymentUrl;
      return;
    }
    openCart("Pedido creado, pero falta configurar Mercado Pago para cobrar online.");
  } catch (error) {
    openCart(error.message || "No se pudo registrar el pedido. Intenta nuevamente.");
  }
}

function syncControls() {
  elements.searchInput.value = state.search;
  elements.sortSelect.value = state.sort;
  renderCouponState();
}

function applyConfig(nextConfig) {
  state.config = getNormalizedConfig(nextConfig);
  sanitizeCartState();
}

async function refreshConfig({ rerender = true } = {}) {
  if (configRefreshInFlight) {
    return;
  }

  configRefreshInFlight = true;
  try {
    const [nextCatalogData, nextConfig] = await Promise.all([apiClient.getCatalog(), apiClient.getConfig()]);
    catalogData = nextCatalogData;
    productMap = new Map(catalogData.products.map((product) => [product.id, product]));
    applyConfig(nextConfig);
    if (rerender) {
      renderAllStorefront();
    }
  } finally {
    configRefreshInFlight = false;
  }
}

async function loadInitialData() {
  const [nextCatalogData, nextConfig] = await Promise.all([apiClient.getCatalog(), apiClient.getConfig()]);
  catalogData = nextCatalogData;
  categoryOrder = new Map(catalogData.categories.map((category, index) => [category.id, index]));
  productMap = new Map(catalogData.products.map((product) => [product.id, product]));
  state.brand = catalogData.brandOptions[0]?.id ?? "biocom";
  applyConfig(nextConfig);
}

function renderAllStorefront() {
  renderBrandSwitcher();
  renderCategoryNav();
  renderPackOffers();
  renderProductGrid();
  renderCouponState();
  renderCart();
  syncLayoutMetrics();
  observeRevealTargets(document);
}

function handleBrandClick(event) {
  const button = event.target.closest("[data-brand]");
  if (!button) {
    return;
  }

  state.brand = button.dataset.brand;
  state.category = "all";
  renderAllStorefront();
}

function handleCategoryClick(event) {
  const button = event.target.closest("[data-category]");
  if (!button) {
    return;
  }

  state.category = button.dataset.category;
  renderAllStorefront();
}

function handlePendingQtyClick(event) {
  const stepButton = event.target.closest("[data-pending-step]");
  if (!stepButton) {
    return false;
  }

  const kind = stepButton.dataset.pendingKind === "pack" ? "pack" : "product";
  const itemId = stepButton.dataset.pendingId;
  setPendingQty(kind, itemId, getPendingQty(kind, itemId) + Number(stepButton.dataset.pendingStep));
  return true;
}

function handleAddToCartClick(event) {
  const addButton = event.target.closest("[data-add-kind]");
  if (!addButton) {
    return false;
  }

  const kind = addButton.dataset.addKind === "pack" ? "pack" : "product";
  const itemId = addButton.dataset.addId;
  addToCart(kind, itemId, getPendingQty(kind, itemId));
  return true;
}

function handleProductGridClick(event) {
  if (handlePendingQtyClick(event)) {
    return;
  }

  if (handleAddToCartClick(event)) {
    return;
  }

  const openButton = event.target.closest("[data-open-product]");
  if (openButton) {
    openProduct(openButton.dataset.openProduct);
  }
}

function handlePackGridClick(event) {
  if (handlePendingQtyClick(event)) {
    return;
  }

  const openButton = event.target.closest("[data-open-pack]");
  if (openButton) {
    openPack(openButton.dataset.openPack);
    return;
  }

  handleAddToCartClick(event);
}

function handleCartClick(event) {
  const stepButton = event.target.closest("[data-cart-step]");
  if (stepButton) {
    stepCartItem(
      stepButton.dataset.cartKind === "pack" ? "pack" : "product",
      stepButton.dataset.cartId,
      Number(stepButton.dataset.cartStep),
    );
    return;
  }

  const removeButton = event.target.closest("[data-remove-cart]");
  if (removeButton) {
    removeCartItem(removeButton.dataset.removeKind === "pack" ? "pack" : "product", removeButton.dataset.removeCart);
  }
}

function handleModalClick(event) {
  if (handlePendingQtyClick(event)) {
    return;
  }

  const openButton = event.target.closest("[data-open-product]");
  if (openButton) {
    openProduct(openButton.dataset.openProduct);
    return;
  }

  const closeButton = event.target.closest("[data-close-product]");
  if (closeButton) {
    closeProduct();
    return;
  }

  if (handleAddToCartClick(event)) {
    closeProduct();
  }
}

function attachEvents() {
  elements.brandSwitcher.addEventListener("click", handleBrandClick);
  elements.categoryNav.addEventListener("click", handleCategoryClick);
  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value;
    renderProductGrid();
  });
  elements.sortSelect.addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderProductGrid();
  });
  elements.productGrid.addEventListener("click", handleProductGridClick);
  elements.packOffersGrid?.addEventListener("click", handlePackGridClick);
  elements.cartItems.addEventListener("click", handleCartClick);
  elements.checkoutForm.addEventListener("submit", handleCheckout);
  elements.checkoutAddress.addEventListener("input", handleAddressInput);
  elements.checkoutLocation.addEventListener("change", () => {
    elements.checkoutAddress.value = "";
    clearAddressSuggestions();
    resetSelectedAddress("Empezá a escribir una dirección dentro de la localidad elegida.");
  });
  elements.addressSuggestions?.addEventListener("click", handleAddressSuggestionClick);
  elements.couponRedeem?.addEventListener("click", handleCouponAction);
  elements.couponInput?.addEventListener("input", (event) => {
    state.couponDraft = normalizeCoupon(event.target.value);
    state.couponFeedback = {
      tone: state.appliedCouponCode && state.couponDraft === state.appliedCouponCode ? "success" : "muted",
      message:
        state.appliedCouponCode && state.couponDraft === state.appliedCouponCode
          ? `Cupón ${state.appliedCouponCode} aplicado correctamente.`
          : "",
    };
    renderCouponState();
  });
  elements.couponInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleCouponAction();
    }
  });

  elements.cartToggle.addEventListener("click", () => openCart());
  elements.floatingCartToggle?.addEventListener("click", () => openCart());
  elements.cartClose.addEventListener("click", closeCart);
  elements.cartClear?.addEventListener("click", clearCart);
  if (elements.menuToggle && elements.mainNav) {
    elements.menuToggle.addEventListener("click", toggleMenu);
  }
  window.addEventListener("scroll", queueHeaderScroll, { passive: true });
  window.addEventListener("focus", () => refreshConfig());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      refreshConfig();
    }
  });
  window.setInterval(() => refreshConfig(), 10000);

  elements.productClose.addEventListener("click", closeProduct);
  elements.modalBackdrop.addEventListener("click", closeProduct);
  elements.productModal.addEventListener("click", handleModalClick);
  window.addEventListener("resize", syncLayoutMetrics);

  if (elements.mainNav) {
    elements.mainNav.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        closeMenu();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeProduct();
      closeMenu();
    }
  });
}

async function init() {
  await loadInitialData();
  sanitizeCartState();
  preloadStorefrontImages();
  syncControls();
  renderAllStorefront();
  attachEvents();
  syncLayoutMetrics();
  handleHeaderScroll();
  observeRevealTargets(document);
}

init().catch((error) => {
  console.error(error);
  elements.productGrid.innerHTML = `
    <article class="empty-state">
      <span class="eyebrow">Sin conexión</span>
      <h3>No pudimos cargar el catálogo</h3>
      <p>Verifica que el backend este iniciado y vuelve a intentar.</p>
    </article>
  `;
});
