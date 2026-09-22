import prisma from "../../config/prisma";
import { IServiceResponse } from "../../types";

export interface IListNotificationsOptions {
  page: number;
  limit: number;
  unread?: boolean;
}

export async function listNotificationsService(
  userId: string,
  { page, limit, unread }: IListNotificationsOptions
): Promise<IServiceResponse<any>> {
  try {
    const where = unread ? { userId, readAt: null } : { userId };

    const [items, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    return {
      ok: true,
      message: "Notifications fetched",
      data: { items, total, unread: unreadCount, page, limit },
    };
  } catch (error) {
    return { ok: false, message: "Error fetching notifications" };
  }
}

export async function markNotificationReadService(
  userId: string,
  id: number
): Promise<IServiceResponse<any>> {
  try {
    const existing = await prisma.notification.findFirst({ where: { id, userId } });
    if (!existing) return { ok: false, message: "Notification not found" };
    if (existing.readAt) {
      return { ok: true, message: "Notification already read", data: existing };
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return { ok: true, message: "Notification marked as read", data: updated };
  } catch (error) {
    return { ok: false, message: "Error updating notification" };
  }
}

export async function markAllNotificationsReadService(
  userId: string
): Promise<IServiceResponse<any>> {
  try {
    const { count } = await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true, message: "Notifications marked as read", data: { updated: count } };
  } catch (error) {
    return { ok: false, message: "Error updating notifications" };
  }
}
