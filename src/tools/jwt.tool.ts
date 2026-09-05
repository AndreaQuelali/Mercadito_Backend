import jwt from 'jsonwebtoken'

import { ENV } from '../config/env.config'
import { UserRole } from '@prisma/client'

export interface IAuthPayload {
  name: string;
  email: string;
  sub: string; // userId
  role: UserRole;
  sellerId: string | null;
}

export function generateAccessToken (payload: IAuthPayload) {
  const token = jwt.sign(
    payload,
    ENV.JWT_SECRET,
    {
      expiresIn: '1d',
      algorithm: 'HS256'
    }
  )

  return token;
}
