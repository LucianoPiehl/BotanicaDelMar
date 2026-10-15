import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class JsonFileDatabase {
  constructor(filePath, initialStateFactory) {
    this.filePath = filePath;
    this.initialStateFactory = initialStateFactory;
    this.writeQueue = Promise.resolve();
  }

  async read() {
    await this.ensureReady();
    const raw = await readFile(this.filePath, "utf8");
    return JSON.parse(raw);
  }

  async update(mutator) {
    this.writeQueue = this.writeQueue.then(async () => {
      const current = await this.read();
      const next = await mutator(structuredClone(current));
      await this.write(next);
      return next;
    });

    return this.writeQueue;
  }

  async ensureReady() {
    try {
      await readFile(this.filePath, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }

      await mkdir(dirname(this.filePath), { recursive: true });
      await this.write(this.initialStateFactory());
    }
  }

  async write(data) {
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await rename(tempPath, this.filePath);
  }
}
