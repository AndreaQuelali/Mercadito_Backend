import prisma from "../../config/prisma";
import { UserRole } from "@prisma/client";
import { IServiceResponse } from "../../types";
import { ICreateUserDto } from "./dtos/createUser.dto";
import { IUpdateUserDto } from "./dtos/updateUser.dto";
import { IUserFilter, ISafeUser } from "./interfaces/users.interfaces";

/** Prisma select that excludes password from user responses */
const userSafeSelect = {
  id: true,
  firstName: true,
  lastName: true,
  phoneNumber: true,
  phoneCountryCode: true,
  country: true,
  city: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const createUserService = async (
  payload: ICreateUserDto
): Promise<IServiceResponse<ISafeUser>> => {
  try {
    const existing = await prisma.user.findUnique({
      where: { email: payload.email },
    });

    if (existing) {
      return { message: "Email is already in use", ok: false };
    }

    const user = await prisma.user.create({
      data: {
        ...payload,
        role: (payload.role as any) ?? UserRole.client,
      },
      select: userSafeSelect,
    });

    return { message: "User created successfully", ok: true, data: user as unknown as ISafeUser };
  } catch (error) {
    return { message: "Error creating user", ok: false };
  }
};

export const getUserProfileService = async (
  id: string
): Promise<IServiceResponse<ISafeUser | null>> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: userSafeSelect,
    });
    if (!user) return { message: "No user", ok: false };
    return { message: "User profile", ok: true, data: user as unknown as ISafeUser };
  } catch (error) {
    return { message: "Error getting user profile", ok: false };
  }
};

export const getUsersService = async (
  filter: IUserFilter
): Promise<IServiceResponse<ISafeUser[]>> => {
  try {
    const where: any = {};

    if (filter.firstName) {
      where.firstName = { contains: filter.firstName, mode: "insensitive" };
    }
    if (filter.lastName) {
      where.lastName = { contains: filter.lastName, mode: "insensitive" };
    }
    if (filter.email) {
      where.email = { contains: filter.email, mode: "insensitive" };
    }
    if (filter.role) {
      where.role = filter.role;
    }
    if (filter.country) {
      where.country = { contains: filter.country, mode: "insensitive" };
    }
    if (filter.city) {
      where.city = { contains: filter.city, mode: "insensitive" };
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      select: userSafeSelect,
    });

    if (users.length === 0) {
      return { message: "Users not found", ok: false };
    }

    return { message: "Users fetched successfully", ok: true, data: users as unknown as ISafeUser[] };
  } catch (error) {
    return { message: "Error fetching users", ok: false };
  }
};

export const getUserByIdService = async (
  id: string
): Promise<IServiceResponse<ISafeUser>> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: userSafeSelect,
    });
    if (!user) return { message: "User not found", ok: false };
    return { message: "User fetched successfully", ok: true, data: user as unknown as ISafeUser };
  } catch (error) {
    return { message: "Error fetching user", ok: false };
  }
};

export const updateUserService = async (
  id: string,
  payload: IUpdateUserDto
): Promise<IServiceResponse<ISafeUser>> => {
  try {
    if (payload.email) {
      const exists = await prisma.user.findFirst({
        where: { email: payload.email, NOT: { id } },
      });
      if (exists) {
        return { message: "Email is already used by another user", ok: false };
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: payload,
      select: userSafeSelect,
    });

    return { message: "User updated successfully", ok: true, data: updated as unknown as ISafeUser };
  } catch (error) {
    if ((error as any)?.code === "P2025") {
      return { message: "User not found", ok: false };
    }
    return { message: "Error updating user", ok: false };
  }
};

export const deleteUserService = async (
  id: string
): Promise<IServiceResponse<ISafeUser>> => {
  try {
    const deleted = await prisma.user.delete({
      where: { id },
      select: userSafeSelect,
    });
    return { message: "User deleted successfully", ok: true, data: deleted as unknown as ISafeUser };
  } catch (error) {
    if ((error as any)?.code === "P2025") {
      return { message: "User not found", ok: false };
    }
    return { message: "Error deleting user", ok: false };
  }
};
