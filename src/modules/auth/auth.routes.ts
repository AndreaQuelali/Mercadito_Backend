import { Router } from "express";
import {
  register,
  login,
  forgotPassword,
  resetPassword,
} from "./auth.controller";

const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/password/forgot", forgotPassword);
authRouter.post("/password/reset", resetPassword);

export default authRouter;
