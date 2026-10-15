import { catalogData } from "../../data/catalog.js";

export class CatalogRepository {
  getCatalog() {
    return catalogData;
  }

  getStorefrontCatalog() {
    const products = catalogData.products.filter((product) => product.storefrontEnabled !== false);
    const visibleCategoryIds = new Set(products.map((product) => product.categoryId));

    return {
      ...catalogData,
      categories: catalogData.categories.filter((category) => visibleCategoryIds.has(category.id)),
      products,
    };
  }

  getProductById(productId) {
    return catalogData.products.find((product) => product.id === productId) ?? null;
  }
}
