import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

export interface JwtUser {
  uid: string;
  email?: string;
}

const resolvedJwtSecret = process.env.JWT_SECRET?.trim();
if (!resolvedJwtSecret || resolvedJwtSecret.length < 32) {
  throw new Error('JWT_SECRET es obligatorio y debe tener al menos 32 caracteres. Defínalo en el entorno.');
}
export const JWT_SECRET = resolvedJwtSecret;

export function verifyJwtToken(token: string): JwtUser {
  const decoded = jwt.verify(token, JWT_SECRET) as JwtUser;
  if (!decoded?.uid) {
    throw new Error('Token sin usuario');
  }
  return decoded;
}

export function signUserToken(uid: string, email: string): string {
  return jwt.sign({ uid, email }, JWT_SECRET, { expiresIn: '7d' });
}

export async function getUserId(req: Request): Promise<string> {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      return verifyJwtToken(authHeader.substring(7)).uid;
    } catch {
      throw new Error('La sesión no es válida o ha vencido.');
    }
  }
  throw new Error('No se pudo identificar al usuario autenticado.');
}
