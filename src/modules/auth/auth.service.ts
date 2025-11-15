import { IRegisterDto } from "./dtos/register.dto";
import { ILoginDto } from "./dtos/login.dto";
import { IForgotPasswordDto } from "./dtos/forgotPassword.dto";
import { IResetPasswordDto } from "./dtos/resetPassword.dto";
import { IAuthResponse } from "./interfaces/auth.interfaces";
import { UserRole as PrismaUserRole } from "@prisma/client";
import { securePass, validatePassHash } from "../../tools/crypto.tool";
import { generateAccessToken } from "../../tools/jwt.tool";
import prisma from "../../config/prisma";
import { enqueueMail } from "../../tools/mailQueue.tool";
import { createResetToken, deleteResetToken, getUserIdByResetToken } from "../../tools/passwordReset.tool";

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
    const user = await prisma.user.findUnique({ where: { email: _payload.email } });
    if (!user) {
      // Do not leak existence; respond ok with generic message
      return { ok: true, message: "If the email exists, a reset link was sent" };
    }

    const token = await createResetToken(user.id);
    const resetUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/reset-password?token=${token}`;

    await enqueueMail({
      to: user.email,
      subject: "Restablecer contraseña",
      text: `Usa este enlace para restablecer tu contraseña: ${resetUrl} (válido por 15 minutos)`,
    });

    return { ok: true, message: "If the email exists, a reset link was sent" };
  } catch (error) {
    return { ok: false, message: "Error processing password recovery" };
  }
};

export const resetPasswordService = async (
  _payload: IResetPasswordDto
): Promise<IAuthResponse> => {
  try {
    const userId = await getUserIdByResetToken(_payload.token);
    if (!userId) {
      return { ok: false, message: "Invalid or expired token" };
    }

    const passHash = await securePass(_payload.newPassword);
    if (passHash === undefined) {
      throw new Error("Error hashing password");
    }

    await prisma.user.update({ where: { id: userId }, data: { password: passHash } });
    await deleteResetToken(_payload.token);

    return { ok: true, message: "Password updated successfully" };
  } catch (error) {
    return { ok: false, message: "Error resetting password" };
  }
};
