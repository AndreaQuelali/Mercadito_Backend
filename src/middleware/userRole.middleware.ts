import { NextFunction, Request, Response } from "express";
import { UserRole } from "../modules/users/interfaces/users.interfaces";
import prisma from "../config/prisma";

export const userRoleValidation = (...roles: UserRole[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { sub: userId } = req.user;

    if (!userId) {
      return res.status(401).send({
        message: "Unauthorized",
        ok: false,
        status: 401,
      });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return res.status(401).send({
        message: "Unauthorized",
        ok: false,
        status: 401,
      });
    }

    if (!roles.includes(user.role)) {
      return res.status(401).send({
        message: "Unauthorized",
        ok: false,
        status: 401,
      });
    }

    // Attach role to req.user so controllers can use it without extra DB queries
    req.user.role = user.role;
    next();
  };
};

async function loadSellerForRequest(req: Request) {
  const userId = req.user?.sub as string | undefined;
  if (!userId) return { error: "unauthorized" as const };

  const sellerIdFromToken = req.user?.sellerId as string | null | undefined;
  const seller = sellerIdFromToken
    ? await prisma.seller.findUnique({ where: { id: sellerIdFromToken } })
    : await prisma.seller.findUnique({ where: { userId } });

  if (!seller || seller.userId !== userId) {
    return { error: "forbidden" as const };
  }

  req.user.sellerId = seller.id;
  req.user.sellerStatus = seller.status;
  return { seller };
}

/** Requires any Seller profile (active or suspended). */
export const requiresSeller = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await loadSellerForRequest(req);
    if ("error" in result && result.error === "unauthorized") {
      return res.status(401).send({
        message: "Unauthorized",
        ok: false,
        status: 401,
      });
    }
    if ("error" in result) {
      return res.status(403).send({
        message: "Seller profile required",
        ok: false,
        status: 403,
      });
    }
    next();
  } catch (error) {
    return res.status(500).send({
      message: "Error validating seller profile",
      ok: false,
      status: 500,
    });
  }
};

/** Requires an active Seller profile (capability check, not a UserRole). */
export const requiresActiveSeller = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await loadSellerForRequest(req);
    if ("error" in result && result.error === "unauthorized") {
      return res.status(401).send({
        message: "Unauthorized",
        ok: false,
        status: 401,
      });
    }
    if ("error" in result || result.seller.status !== "active") {
      return res.status(403).send({
        message: "Active seller profile required",
        ok: false,
        status: 403,
      });
    }
    next();
  } catch (error) {
    return res.status(500).send({
      message: "Error validating seller profile",
      ok: false,
      status: 500,
    });
  }
};

/** Admin role OR active Seller profile. */
export const requireAdminOrActiveSeller = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.sub as string | undefined;
    if (!userId) {
      return res.status(401).send({
        message: "Unauthorized",
        ok: false,
        status: 401,
      });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(401).send({
        message: "Unauthorized",
        ok: false,
        status: 401,
      });
    }

    req.user.role = user.role;

    if (user.role === "admin") {
      return next();
    }

    return requiresActiveSeller(req, res, next);
  } catch (error) {
    return res.status(500).send({
      message: "Error validating permissions",
      ok: false,
      status: 500,
    });
  }
};
