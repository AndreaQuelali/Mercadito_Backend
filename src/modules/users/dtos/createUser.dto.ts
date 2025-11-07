import { IUser, UserRole } from "../interfaces/users.interfaces";

export type ICreateUserDto = Omit<IUser, "id">;
