import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { ENV } from "../config/env.config";

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}
export const validateSesionUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { authorization } = req.headers;

    if (!authorization) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const [type, token] = authorization.split(" ");
    if (type !== "Bearer") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    jwt.verify(token, ENV.JWT_SECRET, async (error, decoded) => {
      if (error || !decoded) {
        console.error("Error validating the JWT", error);
        return res.status(401).send({
          message: "Unauthorized",
        });
      }

      req.user = decoded;
      next();
    });
  } catch (error) {
    console.error("Error validating the session", error);
  }
};
