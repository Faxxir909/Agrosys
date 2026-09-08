import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import http from 'http';
import { JWT_SECRET } from './src/services/jwt.ts';
import { registerOnAlertAdded } from './server_whatsapp_handler.ts';
import { startWhatsAppConnection } from './whatsapp_connector.ts';
import { initializeDatabase } from './server_db.ts';
import { captureWhatsAppRawBody, requireAuth } from './src/middlewares/auth.ts';
import { authRateLimiter, globalApiRateLimiter } from './src/middlewares/rateLimit.ts';
import { securityHeaders } from './src/middlewares/securityHeaders.ts';
import { initRealtime, notifyClients } from './src/services/realtime.ts';
import apiRouter from './src/routes/index.ts';

dotenv.config();

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET es obligatorio y debe tener al menos 32 caracteres. Defínalo en el entorno.');
}

const app = express();
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(cors());
app.use('/api/', globalApiRateLimiter);
app.use('/api/auth/login', authRateLimiter);
app.use('/api/auth/register', authRateLimiter);
app.use(express.json({
  limit: '25mb',
  verify: captureWhatsAppRawBody
}));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

const httpServer = http.createServer(app);
initRealtime(httpServer);

registerOnAlertAdded((ownerId?: string) => {
  notifyClients('whatsapp-alerts', {}, ownerId);
});

app.use('/api', requireAuth);
app.use('/api', apiRouter);

async function startServer() {
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const webhookToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  if (!webhookToken) {
    console.warn('[WARN] WHATSAPP_VERIFY_TOKEN no definido. El webhook de Meta no funcionará.');
  }

  await initializeDatabase();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`AgroSys está corriendo exitosamente`);
    console.log(`Abre en tu navegador: http://localhost:${PORT}`);
    console.log(`======================================================\n`);
    startWhatsAppConnection().catch(err => {
      console.warn('[WA] WhatsApp auto-start info:', err?.message || err);
    });
  });
}

startServer().catch(console.error);
