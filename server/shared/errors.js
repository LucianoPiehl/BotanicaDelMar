export class AppError extends Error {
  constructor(message, { statusCode = 500, code = "internal_error", details = null } = {}) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message, details = null) {
  return new AppError(message, { statusCode: 400, code: "bad_request", details });
}

export function notFound(message = "Recurso no encontrado") {
  return new AppError(message, { statusCode: 404, code: "not_found" });
}

export function unauthorized(message = "No autorizado") {
  return new AppError(message, { statusCode: 401, code: "unauthorized" });
}
