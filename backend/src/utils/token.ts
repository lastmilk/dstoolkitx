import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

export interface JwtPayload {
  sub: number
  username: string
  role: string
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload as object, env.jwtSecret, {
    expiresIn: env.jwtExpires as any,
  } as jwt.SignOptions)
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwtSecret) as unknown as JwtPayload
}
