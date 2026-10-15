export class CatalogService {
  constructor({ catalogRepository, configService, pricingService }) {
    this.catalogRepository = catalogRepository;
    this.configService = configService;
    this.pricingService = pricingService;
  }

  getCatalog() {
    return this.catalogRepository.getCatalog();
  }

  async getStorefrontCatalog() {
    const [catalog, config] = await Promise.all([
      this.catalogRepository.getStorefrontCatalog(),
      this.configService.getConfig(),
    ]);

    return {
      ...catalog,
      products: catalog.products.map((product) => {
        const pricing = this.pricingService.getProductPricing(product, config);
        return {
          ...product,
          originalPrice: pricing.originalPrice,
          displayPrice: pricing.finalPrice,
          appliedProductDiscount: pricing.appliedDiscount,
        };
      }),
      packOffers: this.pricingService.getVisiblePackOffers(catalog, config),
    };
  }
}
