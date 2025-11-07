import { IRegisterDto } from "./dtos/register.dto";
import { ILoginDto } from "./dtos/login.dto";
import { IForgotPasswordDto } from "./dtos/forgotPassword.dto";
import { IResetPasswordDto } from "./dtos/resetPassword.dto";
import { IAuthResponse } from "./interfaces/auth.interfaces";
import { UserRole as PrismaUserRole } from "@prisma/client";
import { securePass, validatePassHash } from "../../tools/crypto.tool";
import { generateAccessToken } from "../../tools/jwt.tool";
import prisma from "../../config/prisma";

export const registerService = async (
  payload: IRegisterDto
): Promise<IAuthResponse> => {
  try {
    const existing = await prisma.user.findUnique({
      where: { email: payload.email },
    });
    if (existing) {
      return { ok: false, message: "Email is already in use" };
    }

    const passHash = await securePass(payload.password);
    if (passHash === undefined) {
      throw new Error("Error hashing password");
    }

    const user = await prisma.user.create({
      data: {
        ...payload,
        role: PrismaUserRole.client,
        password: passHash,
      },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    return {
      ok: true,
      message: "Registered successfully",
      data: { id: user.id, email: user.email },
    };
  } catch (error) {
    return { ok: false, message: "Error registering user" };
  }
};

export const loginService = async (
  payload: ILoginDto
): Promise<IAuthResponse> => {
  try {
    const user = await prisma.user.findUnique({
      where: { email: payload.email },
    });
    if (!user) {
      return { ok: false, message: "Invalid credentials" };
    }

    const isValid = await validatePassHash(payload.password, user.password);
    if (!isValid) {
      return { ok: false, message: "Invalid credentials" };
    }

    const token = generateAccessToken({
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      sub: user.id,
    });

    return {
      ok: true,
      message: "Login successful",
      data: { id: user.id, email: user.email, token },
    };
  } catch (error) {
    return { ok: false, message: "Error logging in" };
  }
};

export const forgotPasswordService = async (
  _payload: IForgotPasswordDto
): Promise<IAuthResponse> => {
  try {
    // TODO: Generate token and send email
    return { ok: true, message: "Password recovery - pending implementation" };
  } catch (error) {
    return { ok: false, message: "Error processing password recovery" };
  }
};

export const resetPasswordService = async (
  _payload: IResetPasswordDto
): Promise<IAuthResponse> => {
  try {
    return { ok: true, message: "Password reset - pending implementation" };
  } catch (error) {
    return { ok: false, message: "Error resetting password" };
  }
};
