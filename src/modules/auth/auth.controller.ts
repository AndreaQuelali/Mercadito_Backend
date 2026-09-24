import e, { Request, Response } from "express";
import {
  registerService,
  loginService,
  forgotPasswordService,
  resetPasswordService,
  refreshService,
  logoutService,
} from "./auth.service";
import { RefreshSchema } from "./schemas/refresh.schema";
import { LoginSchema } from "./schemas/login.schema";
import { RegisterSchema } from "./schemas/register.schema";
import { ForgotPasswordSchema } from "./schemas/forgotPassword.schema";
import { ResetPasswordSchema } from "./schemas/resetPassword.schema";
import { ENV } from "../../config/env.config";
import { UserRole as PrismaUserRole } from "@prisma/client";

export const register = async (req: Request, res: Response) => {
  try {
    const { success, data, error } = RegisterSchema.safeParse(req.body);

    if (error && !success) {
      res.status(400).send({
        message: ENV.NODE_ENV === "development" ? error.issues : "Bad request",
        status: 400,
        ok: false,
      });
      return;
    }

    const payload = {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      password: data.password,
      phoneNumber: data.phoneNumber ?? "",
      phoneCountryCode: data.phoneCountryCode ?? "",
      country: data.country ?? "",
      city: data.city ?? "",
      role: PrismaUserRole.user,
    };

    const result = await registerService(payload);
    res
      .status(result.ok ? 201 : 400)
      .send({ ...result, status: result.ok ? 201 : 400 });
  } catch (error) {
    res
      .status(500)
      .send({ message: "Internal server error", status: 500, ok: false });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { success, data, error } = LoginSchema.safeParse(req.body);

    if (error && !success) {
      res.status(400).send({
        message: ENV.NODE_ENV === "development" ? error.issues : "Bad request",
        status: 400,
        ok: false,
      });
      return;
    }

    const result = await loginService(data);

    res.status(result.ok ? 200 : 401).send({
      ...result,
      status: result.ok ? 200 : 401,
    });
  } catch (error) {
    res
      .status(500)
      .send({ message: "Internal server error", status: 500, ok: false });
  }
};

export const refresh = async (req: Request, res: Response) => {
  try {
    const { success, data, error } = RefreshSchema.safeParse(req.body);
    if (!success) {
      res.status(400).send({
        message: ENV.NODE_ENV === "development" ? error.issues : "Bad request",
        status: 400,
        ok: false,
      });
      return;
    }

    const result = await refreshService(data.refreshToken);
    const status = result.status ?? (result.ok ? 200 : 401);
    res.status(status).send({ ...result, status });
  } catch (error) {
    res
      .status(500)
      .send({ message: "Internal server error", status: 500, ok: false });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const { success, data, error } = RefreshSchema.safeParse(req.body);
    if (!success) {
      res.status(400).send({
        message: ENV.NODE_ENV === "development" ? error.issues : "Bad request",
        status: 400,
        ok: false,
      });
      return;
    }

    const result = await logoutService(data.refreshToken);
    res.status(200).send({ ...result, status: 200 });
  } catch (error) {
    res
      .status(500)
      .send({ message: "Internal server error", status: 500, ok: false });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { success, data, error } = ForgotPasswordSchema.safeParse(req.body);
    if (error && !success) {
      res.status(400).send({
        message: ENV.NODE_ENV === "development" ? error.issues : "Bad request",
        status: 400,
        ok: false,
      });
      return;
    }
    const result = await forgotPasswordService(data);
    res
      .status(result.ok ? 200 : 400)
      .send({ ...result, status: result.ok ? 200 : 400 });
  } catch (error) {
    res
      .status(500)
      .send({ message: "Internal server error", status: 500, ok: false });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { success, data, error } = ResetPasswordSchema.safeParse(req.body);
    if (error && !success) {
      res.status(400).send({
        message: ENV.NODE_ENV === "development" ? error.issues : "Bad request",
        status: 400,
        ok: false,
      });
      return;
    }
    const result = await resetPasswordService(data);
    res
      .status(result.ok ? 200 : 400)
      .send({ ...result, status: result.ok ? 200 : 400 });
  } catch (error) {
    res
      .status(500)
      .send({ message: "Internal server error", status: 500, ok: false });
  }
};
