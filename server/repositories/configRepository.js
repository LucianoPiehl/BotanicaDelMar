export class ConfigRepository {
  constructor(database) {
    this.database = database;
  }

  async getConfig() {
    const data = await this.database.read();
    return data.config;
  }

  async updateConfig(nextConfig) {
    const data = await this.database.update((current) => ({
      ...current,
      config: {
        ...current.config,
        ...nextConfig,
        updatedAt: new Date().toISOString(),
      },
    }));

    return data.config;
  }
}
