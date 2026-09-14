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

// Own profile — any authenticated user
userRouter.get("/profile", validateSesionUser, getUserProfile);

// List all users — admin only
userRouter.get(
  "/",
  validateSesionUser,
  userRoleValidation(UserRole.admin),
  getUsers
);

// Get user by id — authenticated users
userRouter.get("/:id", validateSesionUser, getUserById);

// Update user — admin only
userRouter.patch(
  "/:id",
  validateSesionUser,
  userRoleValidation(UserRole.admin),
  updateUserPartial
);

// Delete user — admin only
userRouter.delete(
  "/:id",
  validateSesionUser,
  userRoleValidation(UserRole.admin),
  deleteUser
);

export default userRouter;
