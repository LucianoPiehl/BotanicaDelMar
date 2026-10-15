import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function readBoolean(name, defaultValue) {
  const value = process.env[name];
  if (value === undefined || value === "") {
    return defaultValue;
  }

  return value === "true";
}

export function loadDotEnv(rootPath) {
  const envPath = join(rootPath, ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split("=");
    if (process.env[key]) {
      continue;
    }

    process.env[key] = valueParts.join("=").replace(/^["']|["']$/g, "");
  }
}

export function getAppConfig(publicRoot) {
  loadDotEnv(publicRoot);

  return {
    publicBaseUrl: process.env.PUBLIC_BASE_URL || "http://127.0.0.1:4173",
    server: {
      host: process.env.HOST || "127.0.0.1",
      port: Number(process.env.PORT || 4173),
    },
    admin: {
      sessionSecret: process.env.ADMIN_SESSION_SECRET || "dev-only-change-this-session-secret",
      sessionTtlMs: Number(process.env.ADMIN_SESSION_TTL_MS || 1000 * 60 * 60 * 8),
      initialUsername: process.env.ADMIN_INITIAL_USERNAME || "admin",
      initialPassword: process.env.ADMIN_INITIAL_PASSWORD || "",
      cookieDomain: process.env.ADMIN_COOKIE_DOMAIN || "",
      cookieSameSite: process.env.ADMIN_COOKIE_SAME_SITE || "Lax",
      cookieSecure: readBoolean("ADMIN_COOKIE_SECURE", false),
    },
    mercadoPago: {
      publicKey: process.env.MP_PUBLIC_KEY || "",
      accessToken: process.env.MP_ACCESS_TOKEN || "",
      webhookSecret: process.env.MP_WEBHOOK_SECRET || "",
      statementDescriptor: process.env.MP_STATEMENT_DESCRIPTOR || "BOTANICA DEL MAR",
      useSandbox: readBoolean("MP_USE_SANDBOX", true),
    },
    googleMaps: {
      apiKey: process.env.GOOGLE_MAPS_API_KEY || "",
      enforceAddressValidation: readBoolean("GOOGLE_MAPS_ENFORCE_ADDRESS_VALIDATION", true),
      allowBasicFallback: readBoolean("GOOGLE_MAPS_ALLOW_BASIC_FALLBACK", true),
    },
    notifications: {
      whatsappTo: process.env.NOTIFY_WHATSAPP_TO || "",
      emailTo: process.env.NOTIFY_EMAIL_TO || "",
      whatsappEnabled: readBoolean("NOTIFY_WHATSAPP_ENABLED", false),
      emailEnabled: readBoolean("NOTIFY_EMAIL_ENABLED", true),
    },
    whatsapp: {
      token: process.env.WHATSAPP_ACCESS_TOKEN || "",
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
      apiVersion: process.env.WHATSAPP_API_VERSION || "v20.0",
      orderTemplateName: process.env.WHATSAPP_ORDER_TEMPLATE_NAME || "",
      orderTemplateLanguage: process.env.WHATSAPP_ORDER_TEMPLATE_LANGUAGE || "es_AR",
      webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "botanica-whatsapp-webhook",
    },
    email: {
      authMethod: process.env.EMAIL_AUTH_METHOD || "password",
      smtpHost: process.env.SMTP_HOST || "",
      smtpPort: Number(process.env.SMTP_PORT || 587),
      smtpSecure: readBoolean("SMTP_SECURE", false),
      smtpUser: process.env.SMTP_USER || "",
      smtpPass: process.env.SMTP_PASS || "",
      from: process.env.SMTP_FROM || process.env.SMTP_USER || "",
      googleClientId: process.env.GOOGLE_CLIENT_ID || "",
      googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN || "",
    },
  };
}
