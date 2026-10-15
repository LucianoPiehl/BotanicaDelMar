export class AdminRepository {
  constructor(database) {
    this.database = database;
  }

  async getAdminUser() {
    const data = await this.database.read();
    return data.adminUser ?? null;
  }

  async saveAdminUser(adminUser) {
    const data = await this.database.update((current) => ({
      ...current,
      adminUser: {
        ...adminUser,
        updatedAt: new Date().toISOString(),
      },
    }));

    return data.adminUser;
  }
}
