import { IUser } from "../../users/interfaces/users.interfaces";

export type IRegisterDto = Omit<IUser, "id">;
