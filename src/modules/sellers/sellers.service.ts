import prisma from "../../config/prisma";
import { IServiceResponse } from "../../types";
import {
  ICreateSellerDto,
  IUpdateSellerDto,
  IUpdateSellerStatusDto,
} from "./dtos/seller.dto";
import { SellerStatus, UserRole } from "@prisma/client";

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
