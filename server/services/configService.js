import { catalogData } from "../../data/catalog.js";
import { normalizeConfig } from "../../pricing-rules.js";
import { badRequest } from "../shared/errors.js";

export class ConfigService {
  constructor(configRepository, catalogRepository) {
    this.configRepository = configRepository;
    this.catalogRepository = catalogRepository;
  }

  async getConfig() {
    const config = await this.configRepository.getConfig();
    return normalizeConfig(config, catalogData.defaultMarkupPercent);
  }

  async updateConfig(payload) {
    const markupPercent = Number(payload?.markupPercent);
    if (!Number.isFinite(markupPercent) || markupPercent < 0) {
      throw badRequest("El margen comercial debe ser un numero positivo.");
    }

    const normalized = normalizeConfig(
      {
        markupPercent,
        offers: payload?.offers,
      },
      catalogData.defaultMarkupPercent,
    );

    this.validateOffers(normalized.offers);

    return this.configRepository.updateConfig({
      markupPercent: normalized.markupPercent,
      offers: normalized.offers,
    });
  }

  validateOffers(offers) {
    const catalog = this.catalogRepository.getCatalog();
    const validProductIds = new Set((catalog?.products ?? []).map((product) => product.id));

    for (const discount of offers.purchaseDiscounts) {
      if (discount.thresholdAmount <= 0) {
        throw badRequest("Cada descuento por compra debe tener un monto minimo mayor a cero.");
      }

      if (discount.percentOff <= 0 || discount.percentOff > 100) {
        throw badRequest("Cada descuento por compra debe tener un porcentaje valido entre 1 y 100.");
      }
    }

    for (const discount of offers.productDiscounts) {
      if (!validProductIds.has(discount.productId)) {
        throw badRequest("Uno de los descuentos por producto apunta a un producto inexistente.");
      }

      if (discount.percentOff <= 0 || discount.percentOff > 100) {
        throw badRequest("Cada descuento por producto debe tener un porcentaje valido entre 1 y 100.");
      }
    }

    for (const coupon of offers.coupons) {
      if (!coupon.code) {
        throw badRequest("Todos los cupones deben tener un codigo.");
      }

      if (coupon.percentOff <= 0 || coupon.percentOff > 100) {
        throw badRequest("Cada cupon debe tener un porcentaje valido entre 1 y 100.");
      }
    }

    for (const packOffer of offers.packOffers) {
      if (!packOffer.name) {
        throw badRequest("Cada pack debe tener un nombre.");
      }

      if (packOffer.percentOff <= 0 || packOffer.percentOff > 100) {
        throw badRequest("Cada pack debe tener un porcentaje valido entre 1 y 100.");
      }

      if (!Array.isArray(packOffer.items) || !packOffer.items.length) {
        throw badRequest("Cada pack debe incluir al menos un producto.");
      }

      for (const item of packOffer.items) {
        if (!validProductIds.has(item.productId)) {
          throw badRequest("Uno de los packs incluye un producto inexistente.");
        }

        if (!Number.isInteger(item.qty) || item.qty <= 0) {
          throw badRequest("Cada producto dentro de un pack debe tener una cantidad entera positiva.");
        }
      }
    }
  }
}
