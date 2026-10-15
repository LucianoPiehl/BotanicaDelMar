import { clearSessionCookie, getCookie, readJsonBody, sendJson, sendRaw, setSessionCookie } from "./httpUtils.js";
import { notFound } from "../shared/errors.js";

export class Router {
  constructor({ adminCookie = {} } = {}) {
    this.routes = [];
    this.adminCookie = adminCookie;
  }

  get(path, handler) {
    this.add("GET", path, handler);
  }

  post(path, handler) {
    this.add("POST", path, handler);
  }

  put(path, handler) {
    this.add("PUT", path, handler);
  }

  patch(path, handler) {
    this.add("PATCH", path, handler);
  }

  add(method, path, handler) {
    const keys = [];
    const pattern = path
      .split("/")
      .map((segment) => {
        if (!segment.startsWith(":")) {
          return segment;
        }
        keys.push(segment.slice(1));
        return "([^/]+)";
      })
      .join("/");

    this.routes.push({
      method,
      path,
      keys,
      regex: new RegExp(`^${pattern}$`),
      handler,
    });
  }

  async handle(request, response) {
    const url = new URL(request.url, "http://localhost");
    const route = this.routes.find((candidate) => candidate.method === request.method && candidate.regex.test(url.pathname));

    if (!route) {
      throw notFound("Endpoint no encontrado.");
    }

    const match = url.pathname.match(route.regex);
    const params = Object.fromEntries(route.keys.map((key, index) => [key, decodeURIComponent(match[index + 1])]));
    const body = ["POST", "PUT", "PATCH"].includes(request.method) ? await readJsonBody(request) : null;
    const cookies = {
      admin_session: getCookie(request, "admin_session"),
    };
    const responseHelpers = {
      setSessionCookie: (token, expiresAt) => setSessionCookie(response, token, expiresAt, this.adminCookie),
      clearSessionCookie: () => clearSessionCookie(response, this.adminCookie),
    };
    const result = await route.handler({ request, response: responseHelpers, cookies, params, body, query: url.searchParams });

    if (result && Object.prototype.hasOwnProperty.call(result, "rawBody")) {
      sendRaw(response, result.statusCode ?? 200, result.rawBody, result.contentType);
      return;
    }

    sendJson(response, result?.statusCode ?? 200, result?.body ?? result ?? {});
  }
}
