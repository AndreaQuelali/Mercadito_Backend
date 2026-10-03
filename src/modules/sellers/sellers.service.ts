import prisma from "../../config/prisma";
import { IServiceResponse } from "../../types";
import {
  ICreateSellerDto,
  IUpdateSellerDto,
  IUpdateSellerStatusDto,
} from "./dtos/seller.dto";
import { OrderStatus, SellerStatus, UserRole } from "@prisma/client";
import { ENV } from "../../config/env.config";
import { normalizePrefs } from "./notificationPrefs";
import { NotificationSettingsInput } from "./schemas/notificationSettings.schema";

export const createSellerService = async (
  userId: string,
  payload: ICreateSellerDto
): Promise<IServiceResponse<any>> => {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return { ok: false, message: "User not found" };
    }
    if (user.role === UserRole.admin) {
      return { ok: false, message: "Admins cannot create a seller profile" };
    }

    const existing = await prisma.seller.findUnique({ where: { userId } });
    if (existing) {
      return { ok: false, message: "Seller profile already exists" };
    }

    const seller = await prisma.seller.create({
      data: {
        userId,
        businessName: payload.businessName,
        description: payload.description,
        avatarUrl: payload.avatarUrl || null,
        location: payload.location,
        status: SellerStatus.active,
      },
    });

    return { ok: true, message: "Seller profile created", data: seller };
  } catch (error) {
    return { ok: false, message: "Error creating seller profile" };
  }
};

export const getMySellerService = async (
  userId: string
): Promise<IServiceResponse<any>> => {
  try {
    const seller = await prisma.seller.findUnique({ where: { userId } });
    if (!seller) {
      return { ok: false, message: "Seller profile not found" };
    }
    return { ok: true, message: "Seller profile fetched", data: seller };
  } catch (error) {
    return { ok: false, message: "Error fetching seller profile" };
  }
};

export const updateMySellerService = async (
  userId: string,
  payload: IUpdateSellerDto
): Promise<IServiceResponse<any>> => {
  try {
    const existing = await prisma.seller.findUnique({ where: { userId } });
    if (!existing) {
      return { ok: false, message: "Seller profile not found" };
    }

    const data: Record<string, unknown> = {};
    if (payload.businessName !== undefined) data.businessName = payload.businessName;
    if (payload.description !== undefined) data.description = payload.description;
    if (payload.avatarUrl !== undefined) {
      data.avatarUrl = payload.avatarUrl === "" ? null : payload.avatarUrl;
    }
    if (payload.location !== undefined) data.location = payload.location;

    const updated = await prisma.seller.update({
      where: { userId },
      data,
    });

    return { ok: true, message: "Seller profile updated", data: updated };
  } catch (error) {
    return { ok: false, message: "Error updating seller profile" };
  }
};

export const deleteMySellerService = async (
  userId: string
): Promise<IServiceResponse<any>> => {
  try {
    const existing = await prisma.seller.findUnique({
      where: { userId },
      include: { _count: { select: { products: true } } },
    });
    if (!existing) {
      return { ok: false, message: "Seller profile not found" };
    }
    if (existing._count.products > 0) {
      return {
        ok: false,
        message: "Cannot delete seller profile while products exist",
      };
    }

    const deleted = await prisma.seller.delete({ where: { userId } });
    return { ok: true, message: "Seller profile deleted", data: deleted };
  } catch (error) {
    return { ok: false, message: "Error deleting seller profile" };
  }
};

export const listSellersService = async (): Promise<IServiceResponse<any[]>> => {
  try {
    const sellers = await prisma.seller.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
    return { ok: true, message: "Sellers fetched", data: sellers };
  } catch (error) {
    return { ok: false, message: "Error listing sellers" };
  }
};

export const updateSellerStatusService = async (
  sellerId: string,
  payload: IUpdateSellerStatusDto
): Promise<IServiceResponse<any>> => {
  try {
    const updated = await prisma.seller.update({
      where: { id: sellerId },
      data: { status: payload.status },
    });
    return { ok: true, message: "Seller status updated", data: updated };
  } catch (error: any) {
    if (error?.code === "P2025") {
      return { ok: false, message: "Seller not found" };
    }
    return { ok: false, message: "Error updating seller status" };
  }
};

/** Orders in these statuses count as sales; pending and cancelled orders do not. */
const SALE_STATUSES: OrderStatus[] = [
  OrderStatus.paid,
  OrderStatus.confirmed,
  OrderStatus.shipped,
  OrderStatus.delivered,
];
const TOP_PRODUCTS_LIMIT = 5;

const toCents = (price: unknown) => Math.round(Number(String(price)) * 100);
const fromCents = (cents: number) => (cents / 100).toFixed(2);

export const getSellerSalesService = async (
  sellerId: string,
  range: { from?: Date; to?: Date }
): Promise<IServiceResponse<any>> => {
  try {
    const createdAt: { gte?: Date; lte?: Date } = {};
    if (range.from) createdAt.gte = range.from;
    if (range.to) createdAt.lte = range.to;

    const lines = await prisma.orderItem.findMany({
      where: {
        product: { sellerId },
        ...(range.from || range.to ? { order: { createdAt } } : {}),
      },
      select: {
        productId: true,
        quantity: true,
        price: true,
        product: { select: { name: true, image: true } },
        order: { select: { id: true, status: true } },
      },
    });

    const ordersByStatus = Object.fromEntries(
      Object.values(OrderStatus).map((s) => [s, new Set<number>()])
    ) as Record<OrderStatus, Set<number>>;
    const products = new Map<number, { name: string; image: string; units: number; cents: number }>();
    let totalCents = 0;
    let unitsSold = 0;

    for (const l of lines) {
      ordersByStatus[l.order.status].add(l.order.id);
      if (!SALE_STATUSES.includes(l.order.status)) continue;

      const cents = toCents(l.price) * l.quantity;
      totalCents += cents;
      unitsSold += l.quantity;

      const p = products.get(l.productId) ?? { name: l.product.name, image: l.product.image, units: 0, cents: 0 };
      p.units += l.quantity;
      p.cents += cents;
      products.set(l.productId, p);
    }

    const ordersCount = new Set(
      SALE_STATUSES.flatMap((s) => [...ordersByStatus[s]])
    ).size;

    const topProducts = [...products.entries()]
      .map(([productId, p]) => ({ productId, name: p.name, image: p.image, units: p.units, cents: p.cents }))
      .sort((a, b) => b.units - a.units || b.cents - a.cents || a.productId - b.productId)
      .slice(0, TOP_PRODUCTS_LIMIT)
      .map(({ cents, ...p }) => ({ ...p, revenue: fromCents(cents) }));

    return {
      ok: true,
      message: "Sales summary",
      data: {
        range: {
          from: range.from ? range.from.toISOString() : null,
          to: range.to ? range.to.toISOString() : null,
        },
        total: fromCents(totalCents),
        ordersCount,
        unitsSold,
        ordersByStatus: Object.fromEntries(
          Object.entries(ordersByStatus).map(([s, ids]) => [s, ids.size])
        ),
        topProducts,
      },
    };
  } catch (error) {
    return { ok: false, message: "Error fetching sales" };
  }
};

const notificationSettingsOf = (notificationPrefs: unknown) => ({
  preferences: normalizePrefs(notificationPrefs),
  // Set by the server (LOW_STOCK_THRESHOLD); sellers only see it
  lowStockThreshold: ENV.LOW_STOCK_THRESHOLD,
});

export const getNotificationSettingsService = async (
  sellerId: string
): Promise<IServiceResponse<any>> => {
  try {
    const seller = await prisma.seller.findUnique({
      where: { id: sellerId },
      select: { id: true, notificationPrefs: true },
    });
    if (!seller) return { ok: false, message: "Seller not found" };

    return {
      ok: true,
      message: "Notification settings",
      data: notificationSettingsOf(seller.notificationPrefs),
    };
  } catch (error) {
    return { ok: false, message: "Error fetching notification settings" };
  }
};

export const updateNotificationSettingsService = async (
  sellerId: string,
  patch: NotificationSettingsInput
): Promise<IServiceResponse<any>> => {
  try {
    const seller = await prisma.seller.findUnique({
      where: { id: sellerId },
      select: { id: true, notificationPrefs: true },
    });
    if (!seller) return { ok: false, message: "Seller not found" };

    const merged = { ...normalizePrefs(seller.notificationPrefs), ...patch };
    const updated = await prisma.seller.update({
      where: { id: sellerId },
      data: { notificationPrefs: merged },
      select: { id: true, notificationPrefs: true },
    });

    return {
      ok: true,
      message: "Notification settings updated",
      data: notificationSettingsOf(updated.notificationPrefs),
    };
  } catch (error) {
    return { ok: false, message: "Error updating notification settings" };
  }
};
