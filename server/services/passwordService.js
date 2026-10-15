import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

export class PasswordService {
  hashPassword(password) {
    const salt = randomBytes(16).toString("hex");
    const hash = pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
    return `pbkdf2_sha256$120000$${salt}$${hash}`;
  }

  verifyPassword(password, storedHash) {
    const [algorithm, iterations, salt, hash] = String(storedHash || "").split("$");
    if (algorithm !== "pbkdf2_sha256" || !iterations || !salt || !hash) {
      return false;
    }

    const candidate = pbkdf2Sync(password, salt, Number(iterations), 32, "sha256");
    const expected = Buffer.from(hash, "hex");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  }
}
