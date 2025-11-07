import { Request, Response } from "express";
import {
  createUserService,
  deleteUserService,
  getUserByIdService,
  getUsersService,
  updateUserService,
  getUserProfileService,
} from "./users.service";
import { IUserFilter } from "./interfaces/users.interfaces";
import { UserRole } from "@prisma/client";

export const getUserProfile = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const result = await getUserProfileService(user.sub);
    if (!result.ok) {
      res.status(400).send({
        message: result.message,
        status: 400,
        ok: false,
      });
      return;
    }

    res.status(200).send({
      message: result.message,
      status: 200,
      ok: true,
      data: result.data,
    });
  } catch (error) {
    res.status(500).send({
      message: "Internal server error",
      status: 500,
      ok: false,
    });
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const data = req.body;
    if (!data.firstName || !data.lastName || !data.email || !data.phoneNumber) {
      res.status(400).send({
        message:
          "Missing required fields: firstName, lastName, email, phoneNumber",
        status: 400,
        ok: false,
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      res.status(400).send({
        message: "Invalid email format",
        status: 400,
        ok: false,
      });
      return;
    }

    if (data.role && !Object.values(UserRole).includes(data.role)) {
      res.status(400).send({
        message: `Invalid role. Allowed: ${Object.values(UserRole).join(", ")}`,
        status: 400,
        ok: false,
      });
      return;
    }

    const result = await createUserService(data);

    if (!result.ok) {
      res.status(400).send({
        message: result.message,
        status: 400,
        ok: false,
      });
      return;
    }

    res.status(201).send({
      message: result.message,
      status: 201,
      ok: true,
      data: result.data,
    });
  } catch (error) {
    res.status(500).send({
      message: "Internal server error",
      status: 500,
      ok: false,
    });
  }
};

export const getUsers = async (req: Request, res: Response) => {
  try {
    const query = req.query;
    const filter: IUserFilter = {};

    if (query.firstName && typeof query.firstName === "string") {
      const sanitizedName = query.firstName.trim();
      if (sanitizedName.length > 0 && sanitizedName.length <= 50) {
        filter.firstName = sanitizedName;
      }
    }

    if (query.lastName && typeof query.lastName === "string") {
      const sanitizedLast = query.lastName.trim();
      if (sanitizedLast.length > 0 && sanitizedLast.length <= 50) {
        filter.lastName = sanitizedLast;
      }
    }

    if (query.email && typeof query.email === "string") {
      const sanitizedEmail = query.email.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (
        sanitizedEmail.length > 0 &&
        sanitizedEmail.length <= 100 &&
        emailRegex.test(sanitizedEmail)
      ) {
        filter.email = sanitizedEmail;
      }
    }

    if (query.role && typeof query.role === "string") {
      if (Object.values(UserRole).includes(query.role as UserRole)) {
        filter.role = query.role as UserRole;
      }
    }

    if (query.country && typeof query.country === "string") {
      const sanitizedCountry = query.country.trim();
      if (sanitizedCountry.length > 0 && sanitizedCountry.length <= 50) {
        filter.country = sanitizedCountry;
      }
    }

    if (query.city && typeof query.city === "string") {
      const sanitizedCity = query.city.trim();
      if (sanitizedCity.length > 0 && sanitizedCity.length <= 50) {
        filter.city = sanitizedCity;
      }
    }

    const result = await getUsersService(filter);

    if (!result.ok) {
      res.status(400).send({
        message: result.message,
        status: 400,
        ok: false,
      });
      return;
    }

    res.status(200).send({
      message: result.message,
      status: 200,
      ok: true,
      data: result.data,
    });
  } catch (error) {
    res.status(500).send({
      message: "Internal server error",
      status: 500,
      ok: false,
    });
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;

    const numericId = id;

    const result = await getUserByIdService(numericId);

    if (!result.ok) {
      res.status(404).send({
        message: result.message,
        status: 404,
        ok: false,
      });
      return;
    }

    res.status(200).send({
      message: result.message,
      status: 200,
      ok: true,
      data: result.data,
    });
  } catch (error) {
    res.status(500).send({
      message: "Internal server error",
      status: 500,
      ok: false,
    });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const id = data.id;

    const result = await updateUserService(id, data);

    if (!result.ok) {
      res.status(400).send({
        message: result.message,
        status: 400,
        ok: false,
      });
      return;
    }

    res.status(200).send({
      message: result.message,
      status: 200,
      ok: true,
      data: result.data,
    });
  } catch (error) {
    res.status(500).send({
      message: "Internal server error",
      status: 500,
      ok: false,
    });
  }
};

export const updateUserPartial = async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const id = req.params.id;
    const result = await updateUserService(id, data);

    if (!result.ok) {
      res.status(400).send({
        message: result.message,
        status: 400,
        ok: false,
      });
      return;
    }

    res.status(200).send({
      message: result.message,
      status: 200,
      ok: true,
      data: result.data,
    });
  } catch (error) {
    res.status(500).send({
      message: "Internal server error",
      status: 500,
      ok: false,
    });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const result = await deleteUserService(id);

    if (!result.ok) {
      res.status(404).send({
        message: result.message,
        status: 404,
        ok: false,
      });
      return;
    }

    res.status(200).send({
      message: result.message,
      status: 200,
      ok: true,
      data: result.data,
    });
  } catch (error) {
    res.status(500).send({
      message: "Internal server error",
      status: 500,
      ok: false,
    });
  }
};
