import { IRegisterDto } from "./dtos/register.dto";
import { ILoginDto } from "./dtos/login.dto";
import { IForgotPasswordDto } from "./dtos/forgotPassword.dto";
import { IResetPasswordDto } from "./dtos/resetPassword.dto";
import { IAuthResponse } from "./interfaces/auth.interfaces";
import { securePass, validatePassHash } from "../../tools/crypto.tool";
import { generateAccessToken } from "../../tools/jwt.tool";
import prisma from "../../config/prisma";
import { enqueueMail } from "../../tools/mailQueue.tool";
import { buildPasswordResetEmail } from "../../tools/mailTemplates.tool";
import { createResetToken, deleteResetToken, getUserIdByResetToken } from "../../tools/passwordReset.tool";
import { ENV } from "../../config/env.config";
import { UserRole } from "@prisma/client";
import {
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
} from "../../tools/refreshToken.tool";

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
      include: { seller: { select: { id: true } } },
    });
    if (!user) {
      return { ok: false, message: "Invalid credentials" };
    }

    const isValid = await validatePassHash(payload.password, user.password);
    if (!isValid) {
      return { ok: false, message: "Invalid credentials" };
    }

    const token = signAccessToken(user);
    const refreshToken = await issueRefreshToken(user.id);

    return {
      ok: true,
      message: "Login successful",
      data: { id: user.id, email: user.email, token, refreshToken },
    };
  } catch (error) {
    return { ok: false, message: "Error logging in" };
  }
};

const INVALID_REFRESH = "Invalid or expired refresh token";

/** Exchanges a refresh token for a new access token and a rotated refresh token. */
export const refreshService = async (
  refreshToken: string
): Promise<IAuthResponse> => {
  try {
    const rotated = await rotateRefreshToken(refreshToken);
    if (!rotated.ok) {
      if (rotated.reason === "reused") {
        console.warn("[auth] Refresh token reuse detected: session revoked");
      }
      return { ok: false, status: 401, message: INVALID_REFRESH };
    }

    // Claims (role, sellerId) are rebuilt from the database, so changes apply on refresh
    const user = await prisma.user.findUnique({
      where: { id: rotated.userId },
      include: { seller: { select: { id: true } } },
    });
    if (!user) {
      await revokeRefreshToken(rotated.token);
      return { ok: false, status: 401, message: INVALID_REFRESH };
    }

    return {
      ok: true,
      message: "Token refreshed",
      data: {
        id: user.id,
        email: user.email,
        token: signAccessToken(user),
        refreshToken: rotated.token,
      },
    };
  } catch (error) {
    // Not a 401: a transient failure must not make clients drop a valid session
    return { ok: false, status: 500, message: "Error refreshing session" };
  }
};

/** Ends the session. Idempotent: it never fails for the client. */
export const logoutService = async (
  refreshToken: string
): Promise<IAuthResponse> => {
  try {
    await revokeRefreshToken(refreshToken);
  } catch (error) {
    console.error("[auth] Could not revoke refresh token", error);
  }
  return { ok: true, message: "Logged out" };
};

function signAccessToken(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  seller?: { id: string } | null;
}) {
  return generateAccessToken({
    email: user.email,
    name: `${user.firstName} ${user.lastName}`,
    sub: user.id,
    role: user.role,
    sellerId: user.seller?.id ?? null,
  });
}

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
    const resetUrl = `${ENV.APP_URL}/reset-password?token=${token}`;
    const mail = buildPasswordResetEmail(resetUrl);

    await enqueueMail({
      to: user.email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
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
