export class NotificationRepository {
  constructor(database) {
    this.database = database;
  }

  async addNotification(notification) {
    const data = await this.database.update((current) => ({
      ...current,
      notifications: [notification, ...(current.notifications ?? [])],
    }));

    return data.notifications[0];
  }

  async listNotifications() {
    const data = await this.database.read();
    return data.notifications ?? [];
  }

  async appendWhatsAppStatus(event) {
    let matchedNotification = null;

    await this.database.update((current) => {
      const notifications = (current.notifications ?? []).map((notification) => {
        let notificationChanged = false;

        const channelResults = (notification.channelResults ?? []).map((channelResult) => {
          const messageId = channelResult?.details?.response?.messages?.[0]?.id;
          if (channelResult.channel !== "whatsapp" || messageId !== event.messageId) {
            return channelResult;
          }

          notificationChanged = true;
          const statusEvents = [event, ...(channelResult.details?.statusEvents ?? [])];
          return {
            ...channelResult,
            details: {
              ...channelResult.details,
              delivery: event,
              statusEvents,
            },
          };
        });

        if (!notificationChanged) {
          return notification;
        }

        matchedNotification = {
          ...notification,
          channelResults,
        };

        return matchedNotification;
      });

      if (matchedNotification) {
        return {
          ...current,
          notifications,
        };
      }

      return {
        ...current,
        whatsappEvents: [event, ...(current.whatsappEvents ?? [])],
      };
    });

    return matchedNotification;
  }
}
