import type { NextFunction, Request, Response } from 'express';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap.entries()) {
    if (val.resetAt <= now) {
      rateLimitMap.delete(key);
    }
  }
}, 600000);

export function createRateLimiter(options: { windowMs: number; max: number; message: string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.headers['x-forwarded-for']?.toString() || req.socket.remoteAddress || '127.0.0.1';
    const key = `${req.path}:${ip}`;
    const now = Date.now();
    const record = rateLimitMap.get(key);

    if (!record || record.resetAt <= now) {
      rateLimitMap.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    if (record.count >= options.max) {
      const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      return res.status(429).json({ error: options.message });
    }

    record.count += 1;
    next();
  };
}

export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Demasiados intentos de autenticación. Por seguridad, intente nuevamente en 15 minutos.'
});

export const globalApiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 300,
  message: 'Límite de solicitudes alcanzado. Por favor aguarde unos segundos.'
});
