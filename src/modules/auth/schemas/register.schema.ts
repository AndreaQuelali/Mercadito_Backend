import * as z from "zod";

const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export const RegisterSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().regex(emailRegex),
  password: z.string().min(6).max(150),
  phoneNumber: z.string().min(6).max(20).optional(),
  phoneCountryCode: z.string().max(6).optional(),
  country: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  role: z.any().optional(),
});
