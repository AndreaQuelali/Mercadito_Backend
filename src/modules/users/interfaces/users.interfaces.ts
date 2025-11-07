import { UserRole as PrismaUserRole } from "@prisma/client";
export type UserRole = PrismaUserRole;

export interface IUser {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  phoneCountryCode: string;
  country: string;
  city: string;
  email: string;
  role: UserRole;
  password: string;
}

export interface IUserFilter {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: UserRole;
  country?: string;
  city?: string;
}
