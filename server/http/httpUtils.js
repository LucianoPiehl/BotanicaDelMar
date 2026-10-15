import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { AppError, badRequest } from "../shared/errors.js";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const PUBLIC_ROOT_FILES = new Set([
  "admin.css",
  "admin.html",
  "admin.js",
  "api-client.js",
  "app.js",
  "arrepentimiento.html",
  "envios.html",
  "index.css",
  "index.html",
  "legal.html",
  "payment-result.html",
  "payment-result.js",
  "pricing-rules.js",
  "store-common.js",
]);
const PUBLIC_DIRECTORY_PREFIXES = ["assets/"];
const PUBLIC_NESTED_FILES = new Set(["data/catalog.js"]);

function getBaseHeaders(cacheControl = "no-store") {
  return {
    "Cache-Control": cacheControl,
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "frame-src 'self' https://www.mercadolibre.com https://www.mercadopago.com",
      "img-src 'self' data: https:",
      "script-src 'self' https://www.mercadopago.com https://sdk.mercadopago.com",
      "style-src 'self'",
      "connect-src 'self' https://www.mercadolibre.com https://www.mercadopago.com https://sdk.mercadopago.com https://http2.mlstatic.com",
      "font-src 'self' data:",
      "object-src 'none'",
    ].join("; "),
  };
}

function normalizePublicPath(pathname) {
  return pathname
    .split(/[\\/]+/)
    .filter(Boolean)
    .join("/");
}

function isAllowedPublicPath(pathname) {
  if (!pathname) {
    return false;
  }

  const segments = pathname.split("/");
  if (segments.some((segment) => segment.startsWith("."))) {
    return false;
  }

  if (PUBLIC_ROOT_FILES.has(pathname) || PUBLIC_NESTED_FILES.has(pathname)) {
    return true;
  }

  return PUBLIC_DIRECTORY_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function getStaticCacheControl(publicPath) {
  if (publicPath.startsWith("assets/products-web/")) {
    return "no-store";
  }

  if (publicPath.startsWith("assets/")) {
    return "public, max-age=86400";
  }

  return "no-store";
}

export async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw badRequest("El cuerpo de la solicitud no es JSON valido.");
  }
}

export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...getBaseHeaders(),
  });
  response.end(JSON.stringify(payload));
}

export function sendRaw(response, statusCode, payload, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    ...getBaseHeaders(),
  });
  response.end(payload);
}

export function getCookie(request, name) {
  const cookieHeader = request.headers.cookie || "";
  const cookies = Object.fromEntries(
    cookieHeader
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const [key, ...valueParts] = cookie.split("=");
        return [key, decodeURIComponent(valueParts.join("="))];
      }),
  );

  return cookies[name] || "";
}

export function setSessionCookie(response, token, expiresAt, options = {}) {
  const cookieParts = [
    `admin_session=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${options.sameSite || "Lax"}`,
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ];

  if (options.domain) {
    cookieParts.push(`Domain=${options.domain}`);
  }

  if (options.secure) {
    cookieParts.push("Secure");
  }

  response.setHeader("Set-Cookie", [
    cookieParts.join("; "),
  ]);
}

export function clearSessionCookie(response, options = {}) {
  const cookieParts = [
    "admin_session=",
    "Path=/",
    "HttpOnly",
    `SameSite=${options.sameSite || "Lax"}`,
    "Max-Age=0",
  ];

  if (options.domain) {
    cookieParts.push(`Domain=${options.domain}`);
  }

  if (options.secure) {
    cookieParts.push("Secure");
  }

  response.setHeader("Set-Cookie", [cookieParts.join("; ")]);
}

export function sendError(response, error) {
  const statusCode = error instanceof AppError ? error.statusCode : 500;
  const code = error instanceof AppError ? error.code : "internal_error";
  const message = statusCode === 500 ? "Error interno del servidor." : error.message;

  sendJson(response, statusCode, {
    error: {
      code,
      message,
      details: error.details ?? null,
    },
  });
}

export async function sendStaticFile(request, response, publicRoot) {
  const url = new URL(request.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const normalizedPath = normalize(relativePath);
  const publicPath = normalizePublicPath(normalizedPath);

  if (normalizedPath.startsWith("..") || !isAllowedPublicPath(publicPath)) {
    sendJson(response, 403, { error: { code: "forbidden", message: "Acceso denegado." } });
    return;
  }

  const filePath = join(publicRoot, publicPath);
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      sendJson(response, 404, { error: { code: "not_found", message: "Archivo no encontrado." } });
      return;
    }

    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      ...getBaseHeaders(getStaticCacheControl(publicPath)),
    });
    createReadStream(filePath).pipe(response);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(response, 404, { error: { code: "not_found", message: "Archivo no encontrado." } });
      return;
    }

    throw error;
  }
}
