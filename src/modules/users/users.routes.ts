import { Router } from "express";
import {
  getUsers,
  updateUserPartial,
  getUserById,
  deleteUser,
  getUserProfile,
} from "./users.controller";
import { validateSesionUser } from "../../middleware/userSesion.middleware";
import { userRoleValidation } from "../../middleware/userRole.middleware";
import { UserRole } from "@prisma/client";

const userRouter = Router();

userRouter.get("/profile", validateSesionUser, getUserProfile);
userRouter.get("/", getUsers);
userRouter.get(
  "/:id",
  validateSesionUser,
  userRoleValidation(UserRole.admin, UserRole.seller),
  getUserById
);
userRouter.patch("/:id", updateUserPartial);
userRouter.delete("/:id", deleteUser);

export default userRouter;
