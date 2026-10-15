import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { catalogData } from "../data/catalog.js";
import { normalizeConfig } from "../pricing-rules.js";
import { getAppConfig } from "./config/env.js";
import { ApiController } from "./controllers/apiController.js";
import { Router } from "./http/router.js";
import { sendError, sendStaticFile } from "./http/httpUtils.js";
import { JsonFileDatabase } from "./infrastructure/jsonFileDatabase.js";
import { AdminRepository } from "./repositories/adminRepository.js";
import { CatalogRepository } from "./repositories/catalogRepository.js";
import { ConfigRepository } from "./repositories/configRepository.js";
import { NotificationRepository } from "./repositories/notificationRepository.js";
import { OrderRepository } from "./repositories/orderRepository.js";
import { AuthService } from "./services/authService.js";
import { AddressService } from "./services/addressService.js";
import { CatalogService } from "./services/catalogService.js";
import { CheckoutService } from "./services/checkoutService.js";
import { ConfigService } from "./services/configService.js";
import { MetricsService } from "./services/metricsService.js";
import { NotificationService } from "./services/notificationService.js";
import { OrderService } from "./services/orderService.js";
import { PasswordService } from "./services/passwordService.js";
import { PaymentService } from "./services/paymentService.js";
import { PricingService } from "./services/pricingService.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(__dirname, "..");
const appConfig = getAppConfig(publicRoot);
const runtimeDbPath = process.env.BOTANICA_DB_PATH || join(publicRoot, "data", "runtime", "database.json");
const defaultConfig = normalizeConfig(
  {
    markupPercent: catalogData.defaultMarkupPercent,
  },
  catalogData.defaultMarkupPercent,
);

const database = new JsonFileDatabase(runtimeDbPath, () => ({
  config: {
    ...defaultConfig,
    updatedAt: new Date().toISOString(),
  },
  orders: [],
  notifications: [],
  adminUser: null,
}));

const adminRepository = new AdminRepository(database);
const catalogRepository = new CatalogRepository();
const configRepository = new ConfigRepository(database);
const notificationRepository = new NotificationRepository(database);
const orderRepository = new OrderRepository(database);
const passwordService = new PasswordService();
const pricingService = new PricingService();
const addressService = new AddressService({ appConfig });

const authService = new AuthService({
  adminRepository,
  passwordService,
  appConfig,
});
const configService = new ConfigService(configRepository, catalogRepository);
const catalogService = new CatalogService({
  catalogRepository,
  configService,
  pricingService,
});
const paymentService = new PaymentService({ appConfig });
const orderService = new OrderService({
  orderRepository,
  catalogRepository,
  configService,
  pricingService,
  addressService,
});
const checkoutService = new CheckoutService({
  orderService,
  paymentService,
});
const metricsService = new MetricsService({
  orderService,
  catalogRepository,
  configService,
});
const notificationService = new NotificationService({
  appConfig,
  notificationRepository,
});

const router = new Router({
  adminCookie: {
    domain: appConfig.admin.cookieDomain,
    sameSite: appConfig.admin.cookieSameSite,
    secure: appConfig.admin.cookieSecure,
  },
});
new ApiController({
  authService,
  addressService,
  catalogService,
  checkoutService,
  configService,
  orderService,
  metricsService,
  paymentService,
  notificationService,
}).register(router);

await authService.ensureInitialAdmin();

const server = createServer(async (request, response) => {
  try {
    if (request.url.startsWith("/api/")) {
      await router.handle(request, response);
      return;
    }

    await sendStaticFile(request, response, publicRoot);
  } catch (error) {
    console.error(error);
    sendError(response, error);
  }
});

server.listen(appConfig.server.port, appConfig.server.host, () => {
  console.log(`Botanica del Mar escuchando en ${appConfig.server.host}:${appConfig.server.port}`);
  console.log(`URL publica configurada: ${appConfig.publicBaseUrl}`);
  console.log(`Panel interno: ${appConfig.publicBaseUrl.replace(/\/$/, "")}/admin.html`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log(`Cerrando Botanica del Mar por ${signal}...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
