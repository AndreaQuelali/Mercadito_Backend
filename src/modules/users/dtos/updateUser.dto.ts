import { UserRole } from "../interfaces/users.interfaces";

export interface IUpdateUserDto {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  phoneCountryCode?: string;
  country?: string;
  city?: string;
  email?: string;
  role?: UserRole;
}
