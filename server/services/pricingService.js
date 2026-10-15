import {
  buildCartPricing,
  getDisplayPrice,
  getProductPricing,
  getVisiblePackOffers,
  normalizeConfig,
} from "../../pricing-rules.js";
import { catalogData } from "../../data/catalog.js";

export class PricingService {
  getNormalizedConfig(config) {
    return normalizeConfig(config, catalogData.defaultMarkupPercent);
  }

  getDisplayPrice(product, config) {
    return getDisplayPrice(product, config, catalogData.defaultMarkupPercent);
  }

  getProductPricing(product, config) {
    return getProductPricing(product, config, catalogData.defaultMarkupPercent);
  }

  getVisiblePackOffers(catalog, config) {
    return getVisiblePackOffers(catalog, config, catalogData.defaultMarkupPercent);
  }

  buildCartPricing({ cartItems, catalog, config, couponCode }) {
    return buildCartPricing({
      cartItems,
      catalog,
      config,
      couponCode,
      defaultMarkupPercent: catalogData.defaultMarkupPercent,
    });
  }
}
