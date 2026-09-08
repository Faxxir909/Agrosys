import type { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import { verifyJwtToken } from '../services/jwt.ts';

export interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

export function captureWhatsAppRawBody(req: { url?: string }, _res: unknown, buf: Buffer) {
  const url = req.url || '';
  if (url.startsWith('/api/webhooks/whatsapp')) {
    (req as RequestWithRawBody).rawBody = buf;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const publicPaths = ['/auth/login', '/auth/register', '/health', '/webhooks/whatsapp'];
  if (publicPaths.includes(req.path)) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Se requiere iniciar sesión.' });
  }

  try {
    verifyJwtToken(authHeader.substring(7));
    return next();
  } catch {
    return res.status(401).json({ error: 'La sesión no es válida o ha vencido.' });
  }
}

export function verifyMetaWebhookSignature(req: Request, res: Response, next: NextFunction) {
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  const header = req.headers['x-hub-signature-256'];
  const rawBody = (req as RequestWithRawBody).rawBody;

  if (!appSecret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[WEBHOOK] WHATSAPP_APP_SECRET no definido. Se rechaza el POST.');
      return res.sendStatus(403);
    }
    console.warn('[WEBHOOK] WHATSAPP_APP_SECRET no definido. HMAC omitido en development.');
    return next();
  }

  if (typeof header !== 'string' || !header.startsWith('sha256=') || !rawBody) {
    return res.sendStatus(403);
  }

  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const provided = Buffer.from(header);
  const computed = Buffer.from(expected);
  if (provided.length !== computed.length || !crypto.timingSafeEqual(provided, computed)) {
    return res.sendStatus(403);
  }

  return next();
}
