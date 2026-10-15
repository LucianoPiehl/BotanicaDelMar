import { randomBytes, createHmac } from "node:crypto";
import { badRequest, unauthorized } from "../shared/errors.js";

export class AuthService {
  constructor({ adminRepository, passwordService, appConfig }) {
    this.adminRepository = adminRepository;
    this.passwordService = passwordService;
    this.appConfig = appConfig;
    this.sessions = new Map();
  }

  async getStatus(sessionToken) {
    const adminUser = await this.adminRepository.getAdminUser();
    const session = this.getSession(sessionToken);
    return {
      setupRequired: !adminUser,
      authenticated: Boolean(session),
      user: session ? { username: session.username } : null,
    };
  }

  async setup({ username, password }) {
    const existingUser = await this.adminRepository.getAdminUser();
    if (existingUser) {
      throw badRequest("El usuario administrador ya fue creado.");
    }

    const safeUsername = String(username || "").trim();
    if (!safeUsername || String(password || "").length < 10) {
      throw badRequest("El usuario es obligatorio y la contrasena debe tener al menos 10 caracteres.");
    }

    return this.adminRepository.saveAdminUser({
      username: safeUsername,
      passwordHash: this.passwordService.hashPassword(password),
      createdAt: new Date().toISOString(),
    });
  }

  async ensureInitialAdmin() {
    const existingUser = await this.adminRepository.getAdminUser();
    const password = this.appConfig.admin.initialPassword;
    if (existingUser || !password) {
      return;
    }

    await this.setup({
      username: this.appConfig.admin.initialUsername,
      password,
    });
  }

  async login({ username, password }) {
    const adminUser = await this.adminRepository.getAdminUser();
    if (!adminUser || adminUser.username !== String(username || "").trim()) {
      throw badRequest("Usuario o contrasena incorrectos.");
    }

    if (!this.passwordService.verifyPassword(String(password || ""), adminUser.passwordHash)) {
      throw badRequest("Usuario o contrasena incorrectos.");
    }

    return this.createSession(adminUser.username);
  }

  logout(sessionToken) {
    if (sessionToken) {
      this.sessions.delete(sessionToken);
    }
  }

  requireAdmin(sessionToken) {
    const session = this.getSession(sessionToken);
    if (!session) {
      throw unauthorized("Necesitas iniciar sesion como administrador.");
    }
    return session;
  }

  createSession(username) {
    const rawToken = randomBytes(32).toString("hex");
    const signature = this.sign(rawToken);
    const token = `${rawToken}.${signature}`;
    const expiresAt = Date.now() + this.appConfig.admin.sessionTtlMs;

    this.sessions.set(token, { username, expiresAt });
    return { token, expiresAt, username };
  }

  getSession(token) {
    if (!token || !this.isValidSignature(token)) {
      return null;
    }

    const session = this.sessions.get(token);
    if (!session || session.expiresAt < Date.now()) {
      this.sessions.delete(token);
      return null;
    }

    return session;
  }

  sign(rawToken) {
    return createHmac("sha256", this.appConfig.admin.sessionSecret).update(rawToken).digest("hex");
  }

  isValidSignature(token) {
    const [rawToken, signature] = String(token).split(".");
    return Boolean(rawToken && signature && this.sign(rawToken) === signature);
  }
}
