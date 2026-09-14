import * as z from "zod";

const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
/** ≥8, 1 uppercase, 1 digit, 1 non-alphanumeric — aligned with frontend SPEC 04 */
const passwordPolicyRegex =
  /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,150}$/;

export const RegisterSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().regex(emailRegex),
  password: z
    .string()
    .min(8)
    .max(150)
    .regex(passwordPolicyRegex),
  phoneNumber: z.string().min(6).max(20).optional(),
  phoneCountryCode: z.string().max(6).optional(),
  country: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  role: z.any().optional(),
});
