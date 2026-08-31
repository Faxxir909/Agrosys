import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';

import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { processIncomingMessage, registerOnAlertAdded, hasTradeIntent, whatsappSettings } from './server_whatsapp_handler.ts';
import { getWhatsAppStatus, startWhatsAppConnection, resetWhatsAppConnection } from './whatsapp_connector.ts';
import { isDbSimulated, dbQuery, dbTransaction, initializeDatabase, simulatedDb } from './server_db.ts';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable('x-powered-by');

// ----------------------------------------------------
// Security Headers Middleware
// ----------------------------------------------------
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
  next();
});

// ----------------------------------------------------
// Rate Limiting (In-Memory IP Throttling)
// ----------------------------------------------------
interface RateLimitRecord {
  count: number;
  resetAt: number;
}
const rateLimitMap = new Map<string, RateLimitRecord>();

// Cleanup stale entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap.entries()) {
    if (val.resetAt <= now) {
      rateLimitMap.delete(key);
    }
  }
}, 600000);

function createRateLimiter(options: { windowMs: number; max: number; message: string }) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
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

const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Demasiados intentos de autenticación. Por seguridad, intente nuevamente en 15 minutos.'
});

const globalApiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 300,
  message: 'Límite de solicitudes alcanzado. Por favor aguarde unos segundos.'
});

app.use(cors());
app.use('/api/', globalApiRateLimiter);
app.use('/api/auth/login', authRateLimiter);
app.use('/api/auth/register', authRateLimiter);
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PATCH", "DELETE"]
  }
});

io.on('connection', (socket) => {
  socket.on('disconnect', () => {});
});

export function notifyClients(event: string, data: any = {}) {
  io.emit(event, data);
}

// Register Baileys incoming alert handler callback
registerOnAlertAdded(() => {
  notifyClients('whatsapp-alerts', {});
});

const JWT_SECRET = process.env.JWT_SECRET?.trim() || 'agrosys_jwt_secure_prod_key_default_99214_!$';

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `v2:${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  if (!stored) return false;
  const parts = stored.split(':');
  if (parts.length === 3 && parts[0] === 'v2') {
    const [, salt, hash] = parts;
    const checkHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return checkHash === hash;
  }
  if (parts.length === 2) {
    const [salt, hash] = parts;
    const checkHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return checkHash === hash;
  }
  return false;
}

export async function logActivity(userId: string, action: string, details?: string) {
  const id = crypto.randomUUID();
  const createdAt = new Date();
  if (isDbSimulated()) {
    simulatedDb.audit_logs.push({ id, userId, action, details, createdAt });
    notifyClients('audit-logs', {});
    return;
  }
  try {
    await dbQuery(
      'INSERT INTO audit_logs (id, user_id, action, details, created_at) VALUES ($1, $2, $3, $4, $5)',
      [id, userId, action, details || null, createdAt]
    );
    notifyClients('audit-logs', {});
  } catch (err) {
    console.error('[AUDIT ERROR] Failed to log activity:', err);
  }
}

const WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN?.trim() || '';
// ----------------------------------------------------
// Meta WhatsApp Webhook
// ----------------------------------------------------
app.get('/api/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/api/webhooks/whatsapp', async (req, res) => {
  // Always respond with 200 OK to Meta immediately
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          const value = change.value;
          if (value && value.messages && value.messages.length > 0) {
            for (const message of value.messages) {
              if (message.type === 'text') {
                const rawMessage = message.text.body;
                const senderPhone = message.from;
                // Process asynchronously
                processIncomingMessage(rawMessage, senderPhone).catch(console.error);
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Error processing webhook payload:', err);
  }
});

// Every API except login, registration, health and Meta's webhook requires a valid token.
app.use('/api', async (req, res, next) => {
  const publicPaths = ['/auth/login', '/auth/register', '/health', '/webhooks/whatsapp'];
  if (publicPaths.includes(req.path)) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Se requiere iniciar sesión.' });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (!decoded?.uid) throw new Error('Token sin usuario');
    return next();
  } catch {
    return res.status(401).json({ error: 'La sesión no es válida o ha vencido.' });
  }
});

// ----------------------------------------------------
// Personal WhatsApp Web (Baileys) Routes
// ----------------------------------------------------
app.get('/api/whatsapp/status', (req, res) => {
  res.json(getWhatsAppStatus());
});

app.post('/api/whatsapp/start', async (req, res) => {
  try {
    const status = getWhatsAppStatus();
    if (status.status !== 'connected' && status.status !== 'connecting') {
      startWhatsAppConnection().catch(console.error);
    }
    res.json({ success: true, status: 'connecting' });
  } catch (err) {
    console.error('Warning starting whatsapp', err);
    res.status(500).json({ error: 'failed to start' });
  }
});

app.post('/api/whatsapp/reset', async (req, res) => {
  try {
    await resetWhatsAppConnection();
    res.json({ success: true, status: 'disconnected' });
  } catch (err) {
    console.error('Error resetting WhatsApp', err);
    res.status(500).json({ error: 'failed to reset' });
  }
});

app.get('/api/whatsapp/settings', (req, res) => {
  res.json(whatsappSettings);
});

app.post('/api/whatsapp/settings', async (req, res) => {
  try {
    const { bypassHeuristic, matchTolerance } = req.body;
    if (bypassHeuristic !== undefined) whatsappSettings.bypassHeuristic = !!bypassHeuristic;
    if (matchTolerance !== undefined) {
      const tolerance = Number(matchTolerance);
      if (!isNaN(tolerance) && tolerance >= 0 && tolerance <= 1) {
        whatsappSettings.matchTolerance = tolerance;
      }
    }
    notifyClients('whatsapp-settings', whatsappSettings);
    res.json({ success: true, settings: whatsappSettings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// AI Parse Opportunity Endpoint
// ----------------------------------------------------
app.post('/api/parse-opportunity-text', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Falta el texto a analizar' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'El análisis de texto no está configurado. Defina GEMINI_API_KEY.' });
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY.trim(),
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
        
    const prompt = `Analiza el siguiente texto libre de un mensaje de compra/venta de granos en Argentina.
Identifica y extrae los datos del negocio, prestando especial atención al tipo de operación, las unidades de cantidad, moneda, ubicación y condiciones del negocio.

REGLAS CRÍTICAS DE FILTRADO (INTENT COMERCIAL):
- El mensaje DEBE expresar una intención comercial clara, activa y directa de comprar o vender grano.
- Si el mensaje es un saludo (ej. "buen día grupo", "hola"), una pregunta general (ej. "¿alguien sabe si llueve?", "¿cómo viene la cosecha?"), noticias del sector, comentarios sobre precios sin una oferta/demanda propia, o charla informal, DEBES clasificar tanto el "type" como el "crop" obligatoriamente como "desconocido".
- No asumas intención de compra/venta si no existen verbos de acción comercial explícitos (comprar, vender, ofrecer, buscar, necesitar, cupo para, entregar, pagar) referentes a granos.

Instrucciones de Tipo de Operación (type):
- Identifica si el mensaje es de VENTA (oferta) o de COMPRA (demanda).
- Clasifica como "oferta" si el emisor ofrece vender, tiene mercadería disponible, quiere liquidar o fijar venta. Palabras clave comunes: "vendo", "tengo", "ofrezco", "entrego", "fijo", "sale", "disponibles", "salieron", "vende", "liquidar", "oferta de venta".
- Clasifica como "demanda" si el emisor busca comprar, demanda o necesita mercadería. Palabras clave comunes: "compro", "busco", "necesito", "pago", "tomo", "compramos", "se busca", "requiere", "cupo para", "pagamos", "oferta de compra".
- Si no se especifica ni deduce claramente una intención transaccional directa de compra o venta, devuelve "desconocido".

Instrucciones de unidades y conversión (Prácticas del mercado argentino):
1. Unidad de Cantidad (quantityUnit):
   - Identifica si el mensaje especifica la unidad: "toneladas", "tn", "ton", "qq" (quintales) o "camiones".
   - Si no se especifica, por defecto asume "tn".
   - Normaliza la propiedad "quantity" a toneladas (tn) en base a las siguientes equivalencias:
     - Si la unidad es "qq" (quintales), divide la cantidad por 10 (ej: 100 qq = 10 tn).
     - Si la unidad es "camiones", multiplica la cantidad por 30 (ej: 2 camiones = 60 tn).
     - Si está en "tn"/"toneladas" o no se especifica, mantén el número tal cual.

2. Unidad de Precio / Moneda (priceUnit):
   - Identifica si el precio está cotizado en "USD" (dólares, u$s, usd), "ARS" (pesos, $, m/n) u otra.
   - Si no se especifica explícitamente (ej: "soja a 210"), por defecto en el mercado de granos argentino asume "USD" (dólares por tonelada).
   - Normaliza la propiedad "price" al valor numérico correspondiente.

3. Ubicación y Procedencia (location):
   - Extrae el puerto de entrega, la localidad o procedencia (ej. "Rosario", "Laboulaye", "Sinsacate", "San Lorenzo", "Timbúes", "Bahía Blanca", "Quequén"). Devuelve una cadena de texto o null si no se menciona.

4. Condiciones de Pago (paymentTerms):
   - Identifica plazos de pago y condiciones financieras mencionadas (ej. "72hs", "contractual", "contado", "fwd", "a fijar"). Devuelve una cadena de texto corta o null si no se menciona.

5. Calidad del Grano (grainQuality):
   - Identifica parámetros de calidad descritos (ej. "cámara", "grado 2", "g2", "ph 78", "proteína 11"). Devuelve una cadena de texto corta o null si no se menciona.

Devuelve un JSON estrictamente válido con el siguiente formato:
{
  "type": "oferta" | "demanda" | "desconocido",
  "crop": tipo de grano ("soja", "maiz", "trigo", "sorgo", "girasol", "desconocido"),
  "quantity": cantidad calculada/normalizada en toneladas (número),
  "quantityUnit": unidad original identificada (ej: "tn", "qq", "camiones", "toneladas") o "tn" por defecto,
  "originalQuantity": número original del texto sin convertir (número),
  "price": precio numérico (número),
  "priceUnit": moneda original identificada (ej: "USD", "ARS", "$") o "USD" por defecto,
  "originalPrice": número original de precio sin convertir (número o null),
  "location": localidad, puerto o destino (string o null),
  "paymentTerms": condición de pago (string o null),
  "grainQuality": calidad del grano (string o null)
}

Texto a analizar: "${text}"`;
        
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const parsedText = response.text || '';
    const match = parsedText.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      res.json(parsed);
    } else {
      res.status(502).json({ error: 'Gemini respondió sin datos estructurados válidos.' });
    }
  } catch (err) {
    console.error('Parse opportunity error:', err);
    res.status(502).json({ error: 'No se pudo analizar el texto con Gemini.' });
  }
});

// ----------------------------------------------------
// AI Parse Audio / Voice Notes Endpoint
// ----------------------------------------------------
app.post('/api/parse-audio', async (req, res) => {
  try {
    const { audio, mimeType } = req.body;
    if (!audio) {
      return res.status(400).json({ error: 'Falta la grabación de audio a analizar' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'La transcripción de audio no está configurada. Defina GEMINI_API_KEY.' });
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY.trim(),
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const prompt = `Analiza el siguiente audio que contiene un mensaje de voz informal de compra o venta de granos en Argentina.
Transcribe el mensaje y extrae los datos del negocio, prestando especial atención al tipo de operación, las unidades de cantidad, moneda, ubicación y condiciones del negocio.

REGLAS CRÍTICAS DE FILTRADO (INTENT COMERCIAL):
- El audio DEBE expresar una intención comercial clara, activa y directa de comprar o vender grano.
- Si el audio es un saludo (ej. "buen día grupo", "hola"), una pregunta general (ej. "¿alguien sabe el precio?"), comentarios informales, o charlas generales del clima sin transaccionar, DEBES clasificar tanto el "type" como el "crop" obligatoriamente como "desconocido".
- No asumas intención de compra/venta si no existen verbos de acción comercial explícitos (comprar, vender, ofrecer, buscar, necesitar, entregar, pagar) referentes a granos.

Instrucciones de Tipo de Operación (type):
- Identifica si el mensaje es de VENTA (oferta) o de COMPRA (demanda).
- Clasifica como "oferta" si el emisor ofrece vender o tiene mercadería. Palabras clave comunes: "vendo", "tengo", "ofrezco", "entrego", "sale", "vende", "liquidar".
- Clasifica como "demanda" si el emisor busca comprar o necesita. Palabras clave comunes: "compro", "busco", "necesito", "pago", "tomo", "pagamos".
- Si no está claro o no hay intención transaccional explícita, devuelve "desconocido".

Instrucciones de unidades y conversión (Prácticas del mercado argentino):
1. Unidad de Cantidad (quantityUnit):
   - Identifica si se especifica "toneladas", "tn", "qq" (quintales) o "camiones".
   - Si no se especifica, por defecto asume "tn".
   - Normaliza a toneladas (tn): qq dividir por 10, camiones multiplicar por 30.
2. Unidad de Precio (priceUnit):
   - Identifica si es "USD" o "ARS". Por defecto asume "USD" (dólares por tonelada).

3. Ubicación y Procedencia (location):
   - Extrae el puerto de entrega, la localidad o procedencia (ej. "Rosario", "Laboulaye", "Sinsacate", "San Lorenzo", "Timbúes", "Bahía Blanca", "Quequén"). Devuelve una cadena de texto o null si no se menciona.

4. Condiciones de Pago (paymentTerms):
   - Identifica plazos de pago y condiciones financieras mencionadas (ej. "72hs", "contractual", "contado", "fwd", "a fijar"). Devuelve una cadena de texto corta o null si no se menciona.

5. Calidad del Grano (grainQuality):
   - Identifica parámetros de calidad descritos (ej. "cámara", "grado 2", "g2", "ph 78", "proteína 11"). Devuelve una cadena de texto corta o null si no se menciona.

Devuelve un JSON estrictamente válido con el siguiente formato:
{
  "transcription": "transcripción literal completa del audio en español",
  "type": "oferta" | "demanda" | "desconocido",
  "crop": tipo de grano ("soja", "maiz", "trigo", "sorgo", "girasol", "desconocido"),
  "quantity": cantidad calculada/normalizada en toneladas (número),
  "quantityUnit": unidad original identificada (ej: "tn", "qq", "camiones") o "tn" por defecto,
  "originalQuantity": número original del texto sin convertir (número),
  "price": precio numérico (número),
  "priceUnit": moneda original identificada ("USD" o "ARS") o "USD" por defecto,
  "originalPrice": número original de precio sin convertir (número o null),
  "location": localidad, puerto o destino (string o null),
  "paymentTerms": condición de pago (string o null),
  "grainQuality": calidad del grano (string o null)
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            data: audio,
            mimeType: mimeType || 'audio/webm'
          }
        },
        prompt
      ],
      config: {
        responseMimeType: 'application/json'
      }
    });

    const parsedText = response.text || '';
    const match = parsedText.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      res.json(parsed);
    } else {
      res.status(500).json({ error: 'No se pudo extraer información estructurada del audio' });
    }
  } catch (err) {
    console.error('Parse audio error:', err);
    res.status(500).json({ error: 'Error al transcribir y analizar audio con Gemini' });
  }
});

// ----------------------------------------------------
// Pizarra Prices History Endpoint
// ----------------------------------------------------
app.get('/api/pizarra-history', async (req, res) => {
  try {
    if (isDbSimulated()) {
      const history = [...simulatedDb.pizarra_prices]
        .sort((a, b) => new Date(a.createdAt || a.created_at).getTime() - new Date(b.createdAt || b.created_at).getTime())
        .slice(-30);
      return res.json(history);
    }
    const result = await dbQuery(
      `SELECT id, soja, maiz, trigo, sorgo, girasol, source, created_at as "createdAt"
       FROM pizarra_prices ORDER BY created_at ASC LIMIT 30`
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// Double-Sided WhatsApp Match Notification Endpoint
// ----------------------------------------------------
app.post('/api/whatsapp/notify-match', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const {
      sellerId, buyerId, offerId, demandId, cropType, overlapQuantity,
      price, sellerPrice, buyerPrice, commissionPct = 2
    } = req.body;
    const proposedSellerPrice = Number(sellerPrice ?? price);
    const proposedBuyerPrice = Number(buyerPrice ?? price);
    const quantity = Number(overlapQuantity);
    const commission = Number(commissionPct);
    
    if (!sellerId || !buyerId || !offerId || !demandId || !cropType || quantity <= 0 || proposedSellerPrice <= 0 || proposedBuyerPrice <= 0) {
      return res.status(400).json({ error: 'Faltan parámetros del cruce a notificar.' });
    }

    let sellerName = 'Vendedor';
    let sellerPhone = '';
    let buyerName = 'Comprador';
    let buyerPhone = '';

    if (isDbSimulated()) {
      const seller = simulatedDb.clients.find(c => c.id === sellerId);
      if (seller) {
        sellerName = seller.name;
        sellerPhone = seller.phone;
      }
      const buyer = simulatedDb.clients.find(c => c.id === buyerId);
      if (buyer) {
        buyerName = buyer.name;
        buyerPhone = buyer.phone;
      }
    } else {
      const sellerResult = await dbQuery('SELECT name, phone FROM clients WHERE id = $1', [sellerId]);
      if (sellerResult.rows.length > 0) {
        sellerName = sellerResult.rows[0].name;
        sellerPhone = sellerResult.rows[0].phone;
      }
      const buyerResult = await dbQuery('SELECT name, phone FROM clients WHERE id = $1', [buyerId]);
      if (buyerResult.rows.length > 0) {
        buyerName = buyerResult.rows[0].name;
        buyerPhone = buyerResult.rows[0].phone;
      }
    }

    const { sendWhatsAppMessage } = await import('./whatsapp_connector.ts');
    let sellerNotified = false;
    let buyerNotified = false;

    const formattedQty = new Intl.NumberFormat('es-AR').format(quantity);
    const formattedSellerPrice = new Intl.NumberFormat('es-AR').format(proposedSellerPrice);
    const formattedBuyerPrice = new Intl.NumberFormat('es-AR').format(proposedBuyerPrice);

    if (sellerPhone) {
      const sellerMsg = `📢 *Propuesta AgroSys*\n\nHola *${sellerName}*. Tenemos una compra compatible para su oferta de *${cropType.toUpperCase()}*.\n\n🌾 *Volumen:* ${formattedQty} TN\n💵 *Precio vendedor:* ${formattedSellerPrice} USD/tn\n\nResponda *ACEPTO* para autorizar o *RECHAZO* para solicitar una revisión.`;
      sellerNotified = await sendWhatsAppMessage(sellerPhone.trim(), sellerMsg);
    }

    if (buyerPhone) {
      const buyerMsg = `📢 *Propuesta AgroSys*\n\nHola *${buyerName}*. Tenemos una venta compatible para su demanda de *${cropType.toUpperCase()}*.\n\n🌾 *Volumen:* ${formattedQty} TN\n💵 *Precio comprador:* ${formattedBuyerPrice} USD/tn\n\nResponda *ACEPTO* para autorizar o *RECHAZO* para solicitar una revisión.`;
      buyerNotified = await sendWhatsAppMessage(buyerPhone.trim(), buyerMsg);
    }

    const negotiationId = crypto.randomUUID();
    if (!isDbSimulated() && (sellerNotified || buyerNotified)) {
      await dbTransaction(async query => {
        await query(
          `INSERT INTO match_negotiations (
             id, offer_id, demand_id, quantity_tn, seller_price, buyer_price,
             commission_pct, seller_response, buyer_response, status, owner_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pendiente', 'pendiente', 'esperando_confirmacion', $8)
           ON CONFLICT (offer_id, demand_id) DO UPDATE SET
             quantity_tn = EXCLUDED.quantity_tn,
             seller_price = EXCLUDED.seller_price,
             buyer_price = EXCLUDED.buyer_price,
             commission_pct = EXCLUDED.commission_pct,
             seller_response = 'pendiente',
             buyer_response = 'pendiente',
             status = 'esperando_confirmacion',
             updated_at = NOW()`,
          [negotiationId, offerId, demandId, quantity, proposedSellerPrice, proposedBuyerPrice, commission, userId]
        );
        await query(
          `UPDATE opportunities
           SET status = 'esperando_confirmacion',
               next_action = 'Esperar confirmación por WhatsApp',
               updated_at = NOW()
           WHERE id IN ($1, $2) AND (owner_id = $3 OR owner_id = 'GLOBAL')`,
          [offerId, demandId, userId]
        );
      });
      notifyClients('opportunities', {});
    }

    logActivity(
      userId, 
      'Notificó Cruce', 
      `Cruce de ${cropType.toUpperCase()} (${formattedQty} tn) entre ${sellerName} y ${buyerName}`
    );

    const success = sellerNotified || buyerNotified;
    res.status(success ? 200 : 503).json({
      success,
      sellerName,
      sellerNotified,
      buyerName,
      buyerNotified,
      negotiation: sellerNotified || buyerNotified ? {
        id: negotiationId,
        status: 'esperando_confirmacion',
        sellerResponse: 'pendiente',
        buyerResponse: 'pendiente'
      } : null,
      ...(!success ? { error: 'WhatsApp no confirmó el envío a ninguno de los participantes.' } : {})
    });
  } catch (err: any) {
    console.error('Error sending match notifications:', err);
    res.status(500).json({ error: err.message || 'Error al enviar notificaciones de cruce.' });
  }
});

async function triggerPriceAlerts(currentPrices: any) {
  // Read all clients
  let clients: any[] = [];
  if (isDbSimulated()) {
    clients = simulatedDb.clients;
  } else {
    try {
      const result = await dbQuery('SELECT id, name, phone, metadata FROM clients');
      clients = result.rows;
    } catch (e) {
      console.error('[ALERTS] Failed to query clients for price triggers:', e);
      return;
    }
  }

  const { sendWhatsAppMessage } = await import('./whatsapp_connector.ts');

  for (const client of clients) {
    if (!client.phone) continue;
    
    // Parse metadata
    let metadata: any = {};
    if (typeof client.metadata === 'string') {
      try { metadata = JSON.parse(client.metadata); } catch(e){}
    } else if (client.metadata && typeof client.metadata === 'object') {
      metadata = client.metadata;
    } else {
      // If it is in-memory simulated DB, any extra fields are in client object directly or metadata
      metadata = client;
    }

    const grains = ['soja', 'maiz', 'trigo', 'sorgo', 'girasol'];
    for (const grain of grains) {
      const targetPriceKey = `precio_objetivo_${grain}`;
      const targetPriceVal = metadata[targetPriceKey] || client[targetPriceKey];
      
      if (targetPriceVal) {
        const targetPrice = Number(targetPriceVal);
        const currentPrice = Number(currentPrices[grain]);

        if (currentPrice >= targetPrice && currentPrice > 0) {
          const formattedPhone = client.phone.trim();
          const messageText = `📢 *Alerta de Precio AgroSys* 📢\n\nEstimado/a *${client.name}*, le notificamos que el grano *${grain.toUpperCase()}* ha alcanzado su precio objetivo de *${targetPrice} USD/tn* en el mercado de Rosario.\n\n📈 *Precio actual:* *${currentPrice} USD/tn*\n\nContacte a su corredor de AgroSys para cerrar boletos de venta en este valor.`;
          
          console.log(`[ALERT TRIGGER] Target met for client ${client.name} on ${grain}: Current ${currentPrice} >= Target ${targetPrice}. Sending WhatsApp message...`);
          try {
            await sendWhatsAppMessage(formattedPhone, messageText);
            // Update client metadata to clear the alert to prevent spamming
            if (isDbSimulated()) {
              client[targetPriceKey] = null;
              if (client.metadata) client.metadata[targetPriceKey] = null;
            } else {
              const updatedMetadata = { ...metadata, [targetPriceKey]: null };
              await dbQuery('UPDATE clients SET metadata = $1 WHERE id = $2', [JSON.stringify(updatedMetadata), client.id]);
            }
            console.log(`[ALERT SENT] WhatsApp notification sent to ${client.name}. Target reset.`);
          } catch (waErr) {
            console.error(`[ALERT ERROR] Failed to send WhatsApp price alert to ${client.name}:`, waErr);
          }
        }
      }
    }
  }
}

// ----------------------------------------------------
// Real Blackboard/Pizarra Prices (Gemini Search Grounding)
// ----------------------------------------------------
app.get('/api/real-pizarra-prices', async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'Las cotizaciones reales no están configuradas. Defina GEMINI_API_KEY.' });
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY.trim(),
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const googleSearchPrompt = `Busca los valores más recientes de precios de pizarra de la Cámara Arbitral de Cereales de la Bolsa de Comercio de Rosario (Argentina) o precios de referencia de MATba Rofex para los siguientes granos: Soja, Maíz, Trigo, Sorgo y Girasol.
Si los precios están expresados en pesos argentinos (ARS), conviértelos a dólares (USD) al tipo de cambio oficial vigente en Banco Nación o estimación de plaza para reportar valores homogéneos de USD por tonelada, o consíguelos directamente en USD (precios FOB o de pizarra de referencia en Argentina).

Devuelve un objeto JSON estrictamente válido con los campos:
{
  "soja": número decimal o entero (precio en USD/tn),
  "maiz": número decimal o entero (precio en USD/tn),
  "trigo": número decimal o entero (precio en USD/tn),
  "sorgo": número decimal o entero (precio en USD/tn),
  "girasol": número decimal o entero (precio en USD/tn),
  "source": string que describa la fuente y conversión rápida (ej: "Cámara Arbitral de Rosario / MATba - USD de referencia oficial"),
  "date": string con fecha del reporte (ej: "2026-05-20" o la actual más alta disponible)
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: googleSearchPrompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    const parsedText = response.text || '';
    const match = parsedText.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      triggerPriceAlerts(parsed).catch(err => {
        console.error('[ALERTS] Error in triggerPriceAlerts:', err);
      });

      // Save price history
      try {
        const id = crypto.randomUUID();
        const createdAt = new Date();
        if (isDbSimulated()) {
          simulatedDb.pizarra_prices.push({
            id,
            soja: Number(parsed.soja),
            maiz: Number(parsed.maiz),
            trigo: Number(parsed.trigo),
            sorgo: Number(parsed.sorgo),
            girasol: Number(parsed.girasol),
            source: parsed.source || 'Cámara Arbitral de Rosario / MATba - USD de referencia oficial',
            createdAt
          });
        } else {
          await dbQuery(
            `INSERT INTO pizarra_prices (id, soja, maiz, trigo, sorgo, girasol, source, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              id,
              Number(parsed.soja),
              Number(parsed.maiz),
              Number(parsed.trigo),
              Number(parsed.sorgo),
              Number(parsed.girasol),
              parsed.source || 'Cámara Arbitral de Rosario / MATba - USD de referencia oficial',
              createdAt
            ]
          );
        }
      } catch (saveErr) {
        console.error('[HISTORY] Failed to save pizarra price history:', saveErr);
      }

      res.json(parsed);
    } else {
      res.status(500).json({ error: 'No se pudieron estructurar los precios en formato JSON' });
    }
  } catch (err) {
    console.error('Error fetching real pizarra prices with search grounding:', err);
    res.status(500).json({ error: 'Fallo al buscar los precios reales actuales' });
  }
});

// Helper to get authenticated user ID
async function getUserId(req: express.Request): Promise<string> {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      if (decoded && decoded.uid) {
        return decoded.uid;
      }
    } catch (e: any) {
      throw new Error('La sesión no es válida o ha vencido.');
    }
  }
  throw new Error('No se pudo identificar al usuario autenticado.');
}

// ----------------------------------------------------
// Authentication Routes (Local JWT)
// ----------------------------------------------------
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, name, role, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
    }

    const emailLower = email.toLowerCase().trim();
    if (!EMAIL_REGEX.test(emailLower)) {
      return res.status(400).json({ error: 'El formato del correo electrónico no es válido' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const cleanName = (name || 'Usuario').toString().trim().slice(0, 100);
    const cleanRole = (role === 'admin' ? 'admin' : 'broker');
    const passwordHash = hashPassword(password);
    const id = crypto.randomUUID();

    if (isDbSimulated()) {
      const exists = simulatedDb.users.some(u => u.email.toLowerCase() === emailLower);
      if (exists) {
        return res.status(400).json({ error: 'El email ya se encuentra registrado' });
      }
      const user = { id, email: emailLower, name: cleanName, role: cleanRole, passwordHash, createdAt: new Date() };
      simulatedDb.users.push(user);
      const token = jwt.sign({ uid: id, email: emailLower }, JWT_SECRET, { expiresIn: '7d' });
      return res.status(201).json({ token, user: { id, email: emailLower, name: user.name, role: user.role } });
    }

    const existsResult = await dbQuery('SELECT id FROM users WHERE LOWER(email) = $1', [emailLower]);
    if (existsResult.rows.length > 0) {
      return res.status(400).json({ error: 'El email ya se encuentra registrado' });
    }

    await dbQuery(
      'INSERT INTO users (id, email, name, role, password_hash) VALUES ($1, $2, $3, $4, $5)',
      [id, emailLower, cleanName, cleanRole, passwordHash]
    );

    const token = jwt.sign({ uid: id, email: emailLower }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id, email: emailLower, name: cleanName, role: cleanRole } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
    }

    const emailLower = email.toLowerCase().trim();
    if (!EMAIL_REGEX.test(emailLower)) {
      return res.status(400).json({ error: 'Credenciales inválidas' });
    }

    if (isDbSimulated()) {
      const user = simulatedDb.users.find(u => u.email.toLowerCase() === emailLower);
      if (!user || !user.passwordHash) {
        return res.status(400).json({ error: 'Credenciales inválidas' });
      }
      const verified = verifyPassword(password, user.passwordHash);
      if (!verified) {
        return res.status(400).json({ error: 'Credenciales inválidas' });
      }
      const token = jwt.sign({ uid: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    }

    const result = await dbQuery('SELECT id, email, name, role, password_hash as "passwordHash" FROM users WHERE LOWER(email) = $1', [emailLower]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Credenciales inválidas' });
    }

    const user = result.rows[0];
    if (!user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      return res.status(400).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign({ uid: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/api/audit-logs', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (isDbSimulated()) {
      const logs = [...simulatedDb.audit_logs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 100);
      return res.json(logs);
    }
    const result = await dbQuery(
      `SELECT id, user_id as "userId", action, details, created_at as "createdAt"
       FROM audit_logs ORDER BY created_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// WhatsApp Templates CRUD
app.get('/api/whatsapp-templates', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (isDbSimulated()) {
      const templates = simulatedDb.whatsapp_templates.filter(t => t.ownerId === userId || t.ownerId === 'GLOBAL');
      return res.json(templates);
    }
    const result = await dbQuery(
      `SELECT id, name, content, owner_id as "ownerId", created_at as "createdAt"
       FROM whatsapp_templates WHERE owner_id = $1 OR owner_id = 'GLOBAL' ORDER BY created_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/whatsapp-templates', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { name, content } = req.body;
    if (!name || !content) {
      return res.status(400).json({ error: 'Nombre y contenido de plantilla son obligatorios' });
    }
    const id = crypto.randomUUID();
    const createdAt = new Date();
    const templateData = { id, name, content, ownerId: userId, createdAt };

    if (isDbSimulated()) {
      simulatedDb.whatsapp_templates.push(templateData);
      notifyClients('whatsapp-templates', {});
      return res.status(201).json(templateData);
    }

    await dbQuery(
      'INSERT INTO whatsapp_templates (id, name, content, owner_id, created_at) VALUES ($1, $2, $3, $4, $5)',
      [id, name, content, userId, createdAt]
    );
    notifyClients('whatsapp-templates', {});
    res.status(201).json(templateData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/whatsapp-templates/:id', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { id } = req.params;

    if (isDbSimulated()) {
      const idx = simulatedDb.whatsapp_templates.findIndex(t => t.id === id && t.ownerId === userId);
      if (idx !== -1) {
        simulatedDb.whatsapp_templates.splice(idx, 1);
        notifyClients('whatsapp-templates', {});
        return res.json({ success: true });
      }
      return res.status(404).json({ error: 'Template not found or unauthorized' });
    }

    await dbQuery(
      'DELETE FROM whatsapp_templates WHERE id = $1 AND owner_id = $2',
      [id, userId]
    );
    notifyClients('whatsapp-templates', {});
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Manual WhatsApp Dispatch
app.post('/api/whatsapp/send-message', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { phone, message, clientId } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: 'Destinatario y cuerpo del mensaje son obligatorios' });
    }

    const { sendWhatsAppMessage } = await import('./whatsapp_connector.ts');
    
    // Resolve client name if clientId is provided
    let clientName = phone;
    if (clientId) {
      if (isDbSimulated()) {
        const client = simulatedDb.clients.find(c => c.id === clientId);
        if (client) clientName = client.name;
      } else {
        const clientResult = await dbQuery('SELECT name FROM clients WHERE id = $1', [clientId]);
        if (clientResult.rows.length > 0) {
          clientName = clientResult.rows[0].name;
        }
      }
    }

    console.log(`[MANUAL WA] Sending message to ${clientName} (${phone}): ${message.substring(0, 50)}...`);
    const sent = await sendWhatsAppMessage(phone.trim(), message);
    if (!sent) {
      return res.status(503).json({ error: 'WhatsApp no está conectado o no confirmó el envío.' });
    }
    
    logActivity(userId, 'Envió WhatsApp', `Mensaje manual a: ${clientName}`);
    
    res.json({ success: true });
  } catch (err: any) {
    console.error('[MANUAL WA ERROR] Failed to send message:', err);
    res.status(500).json({ error: err.message || 'Error al enviar mensaje de WhatsApp. Verifique si el servicio QR está conectado.' });
  }
});

// ----------------------------------------------------
// Postgres REST API CRUD Routes
// ----------------------------------------------------

// Users
app.get('/api/users/me', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (isDbSimulated()) {
      let user = simulatedDb.users.find(u => u.id === userId);
      if (!user) {
        user = { id: userId, email: 'user@example.com', role: 'broker', name: 'Broker', createdAt: new Date() };
        simulatedDb.users.push(user);
      }
      return res.json(user);
    }
    
    let result = await dbQuery('SELECT id, email, role, name, created_at as "createdAt" FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      await dbQuery('INSERT INTO users (id, email, role, name) VALUES ($1, $2, $3, $4)', [userId, 'user@example.com', 'broker', 'Broker']);
      result = await dbQuery('SELECT id, email, role, name, created_at as "createdAt" FROM users WHERE id = $1', [userId]);
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/users/me', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { name, role } = req.body;
    if (isDbSimulated()) {
      const user = simulatedDb.users.find(u => u.id === userId);
      if (user) {
        if (name !== undefined) user.name = name;
        if (role !== undefined) user.role = role;
        return res.json(user);
      }
      return res.status(404).json({ error: 'User not found' });
    }
    
    await dbQuery('UPDATE users SET name = COALESCE($1, name), role = COALESCE($2, role) WHERE id = $3', [name, role, userId]);
    const result = await dbQuery('SELECT id, email, role, name, created_at as "createdAt" FROM users WHERE id = $1', [userId]);
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Clients
app.get('/api/clients', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (isDbSimulated()) {
      const data = simulatedDb.clients.filter(c => c.ownerId === userId || c.ownerId === 'GLOBAL');
      return res.json(data);
    }
    const result = await dbQuery(
      `SELECT id, name, type, phone, email, cuit, status, notes, location, 
              next_contact_date as "nextContactDate", last_contact_date as "lastContactDate", 
              metadata, owner_id as "ownerId", created_at as "createdAt" 
       FROM clients WHERE owner_id = $1 OR owner_id = $2`,
      [userId, 'GLOBAL']
    );
    const clients = result.rows.map(row => {
      const { metadata, ...core } = row;
      return {
        ...core,
        ...(metadata || {})
      };
    });
    res.json(clients);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
// Clients
app.post('/api/clients', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { name, type, phone, email, cuit, status, notes, location, nextContactDate, lastContactDate, ...extra } = req.body;
    const id = crypto.randomUUID();
    const createdAt = new Date();
    
    const clientData = {
      id, name, type, phone, email, cuit, status, notes,
      location: location || null,
      nextContactDate: nextContactDate ? new Date(nextContactDate) : null,
      lastContactDate: lastContactDate ? new Date(lastContactDate) : null,
      ownerId: userId,
      createdAt,
      ...extra
    };

    if (isDbSimulated()) {
      simulatedDb.clients.push(clientData);
      notifyClients('clients', {});
      logActivity(userId, 'Creó Cliente', name);
      return res.status(201).json(clientData);
    }

    await dbQuery(
      `INSERT INTO clients (id, name, type, phone, email, cuit, status, notes, location, next_contact_date, last_contact_date, metadata, owner_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [id, name, type, phone, email, cuit, status, notes, JSON.stringify(location || null), clientData.nextContactDate, clientData.lastContactDate, JSON.stringify(extra), userId, createdAt]
    );
    notifyClients('clients', {});
    logActivity(userId, 'Creó Cliente', name);
    res.status(201).json(clientData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/clients/:id', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { id } = req.params;
    const { name, type, phone, email, cuit, status, notes, location, nextContactDate, lastContactDate, ...extra } = req.body;

    if (isDbSimulated()) {
      const idx = simulatedDb.clients.findIndex(c => c.id === id && (c.ownerId === userId || c.ownerId === 'GLOBAL'));
      if (idx !== -1) {
        const item = simulatedDb.clients[idx];
        if (name !== undefined) item.name = name;
        if (type !== undefined) item.type = type;
        if (phone !== undefined) item.phone = phone;
        if (email !== undefined) item.email = email;
        if (cuit !== undefined) item.cuit = cuit;
        if (status !== undefined) item.status = status;
        if (notes !== undefined) item.notes = notes;
        if (location !== undefined) item.location = location;
        if (nextContactDate !== undefined) item.nextContactDate = nextContactDate ? new Date(nextContactDate) : null;
        if (lastContactDate !== undefined) item.lastContactDate = lastContactDate ? new Date(lastContactDate) : null;
        // merge extra properties
        Object.keys(extra).forEach(key => {
          item[key] = extra[key];
        });
        notifyClients('clients', {});
        logActivity(userId, 'Modificó Cliente', name || id);
        return res.json(item);
      }
      return res.status(404).json({ error: 'Client not found' });
    }

    const existingResult = await dbQuery('SELECT metadata FROM clients WHERE id = $1', [id]);
    let mergedMetadata = {};
    if (existingResult.rows.length > 0) {
      mergedMetadata = existingResult.rows[0].metadata || {};
    }
    mergedMetadata = { ...mergedMetadata, ...extra };

    await dbQuery(
      `UPDATE clients SET 
        name = COALESCE($1, name), type = COALESCE($2, type), phone = COALESCE($3, phone),
        email = COALESCE($4, email), cuit = COALESCE($5, cuit), status = COALESCE($6, status),
        notes = COALESCE($7, notes), location = COALESCE($8, location),
        next_contact_date = COALESCE($9, next_contact_date), last_contact_date = COALESCE($10, last_contact_date),
        metadata = COALESCE($11, metadata)
       WHERE id = $12 AND (owner_id = $13 OR owner_id = 'GLOBAL')`,
      [
        name, type, phone, email, cuit, status, notes, 
        location ? JSON.stringify(location) : null,
        nextContactDate ? new Date(nextContactDate) : null,
        lastContactDate ? new Date(lastContactDate) : null,
        JSON.stringify(mergedMetadata),
        id, userId
      ]
    );

    const result = await dbQuery(
      `SELECT id, name, type, phone, email, cuit, status, notes, location, 
              next_contact_date as "nextContactDate", last_contact_date as "lastContactDate", 
              metadata, owner_id as "ownerId", created_at as "createdAt" 
       FROM clients WHERE id = $1`, [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    const { metadata, ...core } = result.rows[0];
    notifyClients('clients', {});
    logActivity(userId, 'Modificó Cliente', name || id);
    res.json({
      ...core,
      ...(metadata || {})
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/clients/:id', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { id } = req.params;
    if (isDbSimulated()) {
      const idx = simulatedDb.clients.findIndex(c => c.id === id && c.ownerId === userId);
      if (idx !== -1) {
        simulatedDb.clients.splice(idx, 1);
        simulatedDb.planted_areas = simulatedDb.planted_areas.filter(a => a.clientId !== id);
        simulatedDb.client_interactions = simulatedDb.client_interactions.filter(i => i.clientId !== id);
        notifyClients('clients', {});
        logActivity(userId, 'Eliminó Cliente', id);
        return res.json({ success: true });
      }
      return res.status(404).json({ error: 'Client not found' });
    }

    await dbQuery('DELETE FROM clients WHERE id = $1 AND owner_id = $2', [id, userId]);
    notifyClients('clients', {});
    logActivity(userId, 'Eliminó Cliente', id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Client Interactions
app.get('/api/clients/:clientId/interactions', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { clientId } = req.params;
    if (isDbSimulated()) {
      const data = simulatedDb.client_interactions.filter(i => i.clientId === clientId && i.ownerId === userId);
      return res.json(data);
    }
    const result = await dbQuery(
      `SELECT id, client_id as "clientId", client_name as "clientName", type, note, date, owner_id as "ownerId", created_at as "createdAt"
       FROM client_interactions WHERE client_id = $1 AND owner_id = $2`,
      [clientId, userId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/clients/:clientId/interactions', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { clientId } = req.params;
    const { clientName, type, note, date } = req.body;
    const id = crypto.randomUUID();
    const createdAt = new Date();
    const interactionData = { id, clientId, clientName, type, note, date, ownerId: userId, createdAt };

    if (isDbSimulated()) {
      simulatedDb.client_interactions.push(interactionData);
      notifyClients('interactions', {});
      logActivity(userId, 'Agregó Nota CRM', type);
      return res.status(201).json(interactionData);
    }

    await dbQuery(
      `INSERT INTO client_interactions (id, client_id, client_name, type, note, date, owner_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, clientId, clientName, type, note, date, userId, createdAt]
    );
    notifyClients('interactions', {});
    logActivity(userId, 'Agregó Nota CRM', type);
    res.status(201).json(interactionData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/clients/:clientId/interactions/:id', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { id } = req.params;
    if (isDbSimulated()) {
      const idx = simulatedDb.client_interactions.findIndex(i => i.id === id && i.ownerId === userId);
      if (idx !== -1) {
        simulatedDb.client_interactions.splice(idx, 1);
        notifyClients('interactions', {});
        logActivity(userId, 'Eliminó Nota CRM', id);
        return res.json({ success: true });
      }
      return res.status(404).json({ error: 'Interaction not found' });
    }

    await dbQuery('DELETE FROM client_interactions WHERE id = $1 AND owner_id = $2', [id, userId]);
    notifyClients('interactions', {});
    logActivity(userId, 'Eliminó Nota CRM', id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Planted Areas
app.get('/api/clients/:clientId/planted-areas', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { clientId } = req.params;
    if (isDbSimulated()) {
      const data = simulatedDb.planted_areas.filter(a => a.clientId === clientId && a.ownerId === userId);
      return res.json(data);
    }
    const result = await dbQuery(
      'SELECT id, client_id as "clientId", crop_type as "cropType", campaign, area_ha as "area_ha", owner_id as "ownerId" FROM planted_areas WHERE client_id = $1 AND owner_id = $2',
      [clientId, userId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});



app.post('/api/clients/:clientId/planted-areas', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { clientId } = req.params;
    const { cropType, campaign, area_ha } = req.body;
    const id = crypto.randomUUID();
    const areaData = { id, clientId, cropType, campaign, area_ha: Number(area_ha), ownerId: userId };
    
    if (isDbSimulated()) {
      simulatedDb.planted_areas.push(areaData);
      notifyClients('planted-areas', {});
      logActivity(userId, 'Agregó Hectáreas', `${cropType} (${area_ha} ha)`);
      return res.status(201).json(areaData);
    }

    await dbQuery(
      'INSERT INTO planted_areas (id, client_id, crop_type, campaign, area_ha, owner_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, clientId, cropType, campaign, Number(area_ha), userId]
    );
    notifyClients('planted-areas', {});
    logActivity(userId, 'Agregó Hectáreas', `${cropType} (${area_ha} ha)`);
    res.status(201).json(areaData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/clients/:clientId/planted-areas/:areaId', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { areaId } = req.params;
    if (isDbSimulated()) {
      const idx = simulatedDb.planted_areas.findIndex(a => a.id === areaId && a.ownerId === userId);
      if (idx !== -1) {
        simulatedDb.planted_areas.splice(idx, 1);
        notifyClients('planted-areas', {});
        logActivity(userId, 'Eliminó Hectáreas', areaId);
        return res.json({ success: true });
      }
      return res.status(404).json({ error: 'Planted area not found' });
    }

    await dbQuery('DELETE FROM planted_areas WHERE id = $1 AND owner_id = $2', [areaId, userId]);
    notifyClients('planted-areas', {});
    logActivity(userId, 'Eliminó Hectáreas', areaId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Opportunities
const OPPORTUNITY_STATUSES = new Set([
  'abierta',
  'negociacion',
  'esperando_confirmacion',
  'ganada',
  'perdida',
  'vencida'
]);

const OPPORTUNITY_SELECT = `
  id, type, client_id as "clientId", crop_type as "cropType",
  quantity_tn as "quantity_tn", price_usd as "price_usd", location, status,
  delivery_date as "deliveryDate", expires_at as "expiresAt",
  payment_terms as "paymentTerms", grain_quality as "grainQuality",
  price_mode as "priceMode", next_action as "nextAction",
  lost_reason as "lostReason", source_alert_id as "sourceAlertId",
  owner_id as "ownerId", created_at as "createdAt", updated_at as "updatedAt"
`;

function validDateOrNull(value: unknown, endOfDay = false): Date | null {
  if (!value) return null;
  const raw = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T${endOfDay ? '23:59:59' : '12:00:00'}`)
    : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

app.get('/api/opportunities', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (isDbSimulated()) {
      const data = simulatedDb.opportunities.filter(o => o.ownerId === userId || o.ownerId === 'GLOBAL');
      return res.json(data);
    }
    await dbQuery(
      `UPDATE opportunities
       SET status = 'vencida', updated_at = NOW()
       WHERE expires_at < NOW()
         AND status IN ('abierta', 'negociacion')
         AND (owner_id = $1 OR owner_id = $2)`,
      [userId, 'GLOBAL']
    );
    const result = await dbQuery(
      `SELECT ${OPPORTUNITY_SELECT}
       FROM opportunities WHERE owner_id = $1 OR owner_id = $2
       ORDER BY created_at DESC`,
      [userId, 'GLOBAL']
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to calculate matches dynamically on the backend
async function getMatches(userId: string) {
  let activeOpps: any[] = [];
  
  if (isDbSimulated()) {
    activeOpps = simulatedDb.opportunities.filter(o => ['abierta', 'negociacion', 'esperando_confirmacion'].includes(o.status)).map(o => {
      const client = simulatedDb.clients.find(c => c.id === o.clientId);
      return {
        ...o,
        clientName: client ? client.name : 'Desconocido'
      };
    });
  } else {
    try {
      const result = await dbQuery(
        `SELECT o.id, o.type, o.client_id as "clientId", o.crop_type as "cropType", 
                o.quantity_tn as "quantity_tn", o.price_usd as "price_usd", o.location, o.status,
                o.delivery_date as "deliveryDate", o.expires_at as "expiresAt",
                o.price_mode as "priceMode", o.payment_terms as "paymentTerms",
                o.grain_quality as "grainQuality", o.next_action as "nextAction",
                o.owner_id as "ownerId", o.created_at as "createdAt", c.name as "clientName"
         FROM opportunities o
         LEFT JOIN clients c ON o.client_id = c.id
         WHERE o.status IN ('abierta', 'negociacion', 'esperando_confirmacion')
           AND (o.owner_id = $1 OR o.owner_id = 'GLOBAL')`,
        [userId]
      );
      activeOpps = result.rows;
    } catch (err) {
      console.error('[MATCH ENGINE] Error querying opportunities:', err);
    }
  }

  const openOffers = activeOpps.filter(o => o.type === 'oferta');
  const openDemands = activeOpps.filter(o => o.type === 'demanda');

  const matchesList: any[] = [];

  openOffers.forEach(o => {
    openDemands.forEach(d => {
      if (o.cropType === d.cropType && o.clientId !== d.clientId) {
        const oQty = Number(o.quantity_tn);
        const dQty = Number(d.quantity_tn);
        const oPrice = Number(o.price_usd);
        const dPrice = Number(d.price_usd);

        const overlapQuantity = Math.min(oQty, dQty);
        const priceSpread = dPrice - oPrice;
        
        // Show matches that are either profitable or close to it (within matchTolerance)
        const percentDiff = Math.abs(priceSpread) / oPrice;
        
        if (oPrice > 0 && dPrice > 0 && (priceSpread >= 0 || percentDiff <= whatsappSettings.matchTolerance)) {
          const midpointPrice = (oPrice + dPrice) / 2;
          const totalCommission = overlapQuantity * midpointPrice * 0.02;
          const explanations = [
            `Mismo grano: ${o.cropType.toUpperCase()}`,
            `Volumen cruzable: ${overlapQuantity} TN`,
            priceSpread >= 0
              ? `Margen disponible: USD ${priceSpread}/tn`
              : `Diferencia negociable: USD ${Math.abs(priceSpread)}/tn`
          ];

          if (o.location && d.location) {
            const offerRegion = String(o.location).split(',').pop()?.trim().toLowerCase();
            const demandRegion = String(d.location).split(',').pop()?.trim().toLowerCase();
            explanations.push(offerRegion === demandRegion
              ? 'Origen y destino en la misma zona'
              : `Logística a revisar: ${o.location} → ${d.location}`);
          }

          if (o.deliveryDate || d.deliveryDate) {
            explanations.push('Hay fechas de entrega registradas para coordinar');
          }

          matchesList.push({
            id: `${o.id}-${d.id}`,
            offer: {
              ...o,
              quantity_tn: oQty,
              price_usd: oPrice
            },
            demand: {
              ...d,
              quantity_tn: dQty,
              price_usd: dPrice
            },
            overlapQuantity,
            priceSpread,
            midpointPrice,
            totalCommission,
            cropType: o.cropType,
            explanations
          });
        }
      }
    });
  });

  if (!isDbSimulated() && matchesList.length > 0) {
    const negotiationResult = await dbQuery(
      `SELECT id, offer_id as "offerId", demand_id as "demandId",
              quantity_tn as "quantity_tn", seller_price as "sellerPrice",
              buyer_price as "buyerPrice", commission_pct as "commissionPct",
              seller_response as "sellerResponse", buyer_response as "buyerResponse",
              status, updated_at as "updatedAt"
       FROM match_negotiations
       WHERE owner_id = $1 OR owner_id = 'GLOBAL'`,
      [userId]
    );
    const negotiations = new Map(
      negotiationResult.rows.map((item: any) => [`${item.offerId}-${item.demandId}`, item])
    );
    matchesList.forEach(match => {
      match.negotiation = negotiations.get(match.id) || null;
    });
  }

  return matchesList;
}

app.get('/api/opportunities/matches', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const matches = await getMatches(userId);
    res.json(matches);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/opportunities', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const {
      type, clientId, cropType, quantity_tn, price_usd, location,
      deliveryDate, expiresAt, paymentTerms, grainQuality,
      priceMode = 'fijo', nextAction, sourceAlertId
    } = req.body;
    const quantity = Number(quantity_tn);
    const price = Number(price_usd);
    const parsedDeliveryDate = validDateOrNull(deliveryDate);
    const parsedExpiresAt = validDateOrNull(expiresAt, true) || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    if (!['oferta', 'demanda'].includes(type)) {
      return res.status(400).json({ error: 'El tipo debe ser oferta o demanda.' });
    }
    if (!clientId || !cropType) {
      return res.status(400).json({ error: 'Cliente y grano son obligatorios.' });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'La cantidad debe ser mayor a 0 TN.' });
    }
    if (!['fijo', 'a_negociar'].includes(priceMode)) {
      return res.status(400).json({ error: 'La modalidad de precio no es válida.' });
    }
    if (priceMode === 'fijo' && (!Number.isFinite(price) || price <= 0)) {
      return res.status(400).json({ error: 'Ingrese un precio válido o marque A negociar.' });
    }
    if (parsedExpiresAt.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'El vencimiento debe ser posterior a hoy.' });
    }

    const clientResult = await dbQuery(
      `SELECT id FROM clients WHERE id = $1 AND (owner_id = $2 OR owner_id = 'GLOBAL')`,
      [clientId, userId]
    );
    if (clientResult.rows.length === 0) {
      return res.status(400).json({ error: 'El cliente seleccionado no existe.' });
    }

    const id = crypto.randomUUID();
    const createdAt = new Date();
    const oppData = {
      id, type, clientId, cropType,
      quantity_tn: quantity,
      price_usd: priceMode === 'a_negociar' ? 0 : price,
      location: location || 'A convenir',
      status: 'abierta',
      deliveryDate: parsedDeliveryDate,
      expiresAt: parsedExpiresAt,
      paymentTerms: paymentTerms || null,
      grainQuality: grainQuality || null,
      priceMode,
      nextAction: nextAction || 'Contactar y validar condiciones',
      lostReason: null,
      sourceAlertId: sourceAlertId || null,
      ownerId: userId,
      createdAt,
      updatedAt: createdAt
    };

    if (isDbSimulated()) {
      simulatedDb.opportunities.push(oppData);
      notifyClients('opportunities', {});
      logActivity(userId, 'Creó Oportunidad', `${cropType} (${quantity_tn} tn)`);
      return res.status(201).json(oppData);
    }

    await dbTransaction(async query => {
      await query(
        `INSERT INTO opportunities (
           id, type, client_id, crop_type, quantity_tn, price_usd, location, status,
           delivery_date, expires_at, payment_terms, grain_quality, price_mode,
           next_action, source_alert_id, owner_id, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8,
           $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
         )`,
        [
          id, type, clientId, cropType, oppData.quantity_tn, oppData.price_usd,
          oppData.location, 'abierta', parsedDeliveryDate, parsedExpiresAt,
          oppData.paymentTerms, oppData.grainQuality, priceMode, oppData.nextAction,
          oppData.sourceAlertId, userId, createdAt, createdAt
        ]
      );

      if (sourceAlertId) {
        const alertResult = await query(
          `UPDATE whatsapp_alerts SET status = 'procesada'
           WHERE id = $1 AND (owner_id = $2 OR owner_id = 'GLOBAL')
           RETURNING id`,
          [sourceAlertId, userId]
        );
        if (alertResult.rows.length === 0) {
          throw new Error('La alerta de WhatsApp ya no está disponible.');
        }
      }
    });
    notifyClients('opportunities', {});
    if (sourceAlertId) notifyClients('whatsapp-alerts', {});
    logActivity(userId, 'Creó Oportunidad', `${cropType} (${quantity_tn} tn)`);
    res.status(201).json(oppData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/opportunities/:id', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { id } = req.params;
    const {
      quantity_tn, price_usd, status, location, deliveryDate, expiresAt,
      paymentTerms, grainQuality, priceMode, nextAction, lostReason
    } = req.body;

    if (status !== undefined && !OPPORTUNITY_STATUSES.has(status)) {
      return res.status(400).json({ error: 'El estado indicado no es válido.' });
    }
    if (status === 'perdida' && !String(lostReason || '').trim()) {
      return res.status(400).json({ error: 'Indique el motivo de pérdida.' });
    }
    if (quantity_tn !== undefined && (!Number.isFinite(Number(quantity_tn)) || Number(quantity_tn) <= 0)) {
      return res.status(400).json({ error: 'La cantidad debe ser mayor a 0 TN.' });
    }
    if (price_usd !== undefined && Number(price_usd) < 0) {
      return res.status(400).json({ error: 'El precio no puede ser negativo.' });
    }

    if (isDbSimulated()) {
      const opp = simulatedDb.opportunities.find(o => o.id === id && (o.ownerId === userId || o.ownerId === 'GLOBAL'));
      if (opp) {
        if (quantity_tn !== undefined) opp.quantity_tn = Number(quantity_tn);
        if (price_usd !== undefined) opp.price_usd = Number(price_usd);
        if (status !== undefined) opp.status = status;
        if (location !== undefined) opp.location = location;
        if (deliveryDate !== undefined) opp.deliveryDate = deliveryDate;
        if (expiresAt !== undefined) opp.expiresAt = expiresAt;
        if (paymentTerms !== undefined) opp.paymentTerms = paymentTerms;
        if (grainQuality !== undefined) opp.grainQuality = grainQuality;
        if (priceMode !== undefined) opp.priceMode = priceMode;
        if (nextAction !== undefined) opp.nextAction = nextAction;
        if (lostReason !== undefined) opp.lostReason = lostReason;
        notifyClients('opportunities', {});
        logActivity(userId, 'Modificó Oportunidad', id);
        return res.json(opp);
      }
      return res.status(404).json({ error: 'Opportunity not found' });
    }

    await dbQuery(
      `UPDATE opportunities SET 
        quantity_tn = COALESCE($1, quantity_tn), price_usd = COALESCE($2, price_usd),
        status = COALESCE($3, status), location = COALESCE($4, location),
        delivery_date = COALESCE($5, delivery_date), expires_at = COALESCE($6, expires_at),
        payment_terms = COALESCE($7, payment_terms), grain_quality = COALESCE($8, grain_quality),
        price_mode = COALESCE($9, price_mode), next_action = COALESCE($10, next_action),
        lost_reason = CASE
          WHEN $3 IS NOT NULL AND $3 <> 'perdida' THEN NULL
          ELSE COALESCE($11, lost_reason)
        END,
        updated_at = NOW()
       WHERE id = $12 AND (owner_id = $13 OR owner_id = 'GLOBAL')`,
      [
        quantity_tn !== undefined ? Number(quantity_tn) : null,
        price_usd !== undefined ? Number(price_usd) : null,
        status, location,
        deliveryDate !== undefined ? validDateOrNull(deliveryDate) : null,
        expiresAt !== undefined ? validDateOrNull(expiresAt, true) : null,
        paymentTerms, grainQuality, priceMode, nextAction,
        lostReason ? String(lostReason).trim() : null,
        id, userId
      ]
    );

    const result = await dbQuery(
      `SELECT ${OPPORTUNITY_SELECT}
       FROM opportunities WHERE id = $1`, [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }
    notifyClients('opportunities', {});
    logActivity(userId, 'Modificó Oportunidad', id);
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/opportunities/:id', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { id } = req.params;
    if (isDbSimulated()) {
      const idx = simulatedDb.opportunities.findIndex(o => o.id === id && o.ownerId === userId);
      if (idx !== -1) {
        simulatedDb.opportunities.splice(idx, 1);
        notifyClients('opportunities', {});
        logActivity(userId, 'Eliminó Oportunidad', id);
        return res.json({ success: true });
      }
      return res.status(404).json({ error: 'Opportunity not found' });
    }

    await dbQuery('DELETE FROM opportunities WHERE id = $1 AND owner_id = $2', [id, userId]);
    notifyClients('opportunities', {});
    logActivity(userId, 'Eliminó Oportunidad', id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// WhatsApp Alerts
app.get('/api/whatsapp-alerts', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (isDbSimulated()) {
      const data = simulatedDb.whatsapp_alerts.filter(a => a.ownerId === userId || a.ownerId === 'GLOBAL');
      return res.json(data);
    }
    const result = await dbQuery(
      `SELECT id, raw_message as "rawMessage", source_group as "sourceGroup", sender_phone as "senderPhone",
              suggested_type as "suggestedType", suggested_crop_type as "suggestedCropType",
              suggested_quantity as "suggestedQuantity", suggested_price as "suggestedPrice",
              suggested_quantity_unit as "suggestedQuantityUnit", suggested_price_unit as "suggestedPriceUnit",
              original_quantity as "originalQuantity", original_price as "originalPrice",
              location, status, owner_id as "ownerId", created_at as "createdAt",
              client_id as "clientId", es_prospecto as "esProspecto",
              payment_terms as "paymentTerms", grain_quality as "grainQuality"
       FROM whatsapp_alerts WHERE owner_id = $1 OR owner_id = $2`,
      [userId, 'GLOBAL']
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/whatsapp-alerts', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { rawMessage, sourceGroup, senderPhone, suggestedType, suggestedCropType, suggestedQuantity, status, location, paymentTerms, grainQuality } = req.body;
    const type = suggestedType || 'desconocido';
    const crop = suggestedCropType || 'desconocido';

    if (type === 'desconocido' || crop === 'desconocido') {
      return res.status(200).json({ success: false, ignored: true, message: 'Message discarded: not a valid offer or demand.' });
    }

    const id = crypto.randomUUID();
    const createdAt = new Date();

    // Match client by phone number
    let clientId: string | null = null;
    let esProspecto = true;
    const cleanSenderDigits = senderPhone ? senderPhone.replace(/\D/g, '') : '';

    if (isDbSimulated()) {
      if (cleanSenderDigits) {
        const matched = simulatedDb.clients.find(c => {
          if (!c.phone) return false;
          const cleanClientDigits = c.phone.replace(/\D/g, '');
          if (cleanSenderDigits.length >= 8 && cleanClientDigits.length >= 8) {
            return cleanSenderDigits.slice(-8) === cleanClientDigits.slice(-8);
          }
          return cleanSenderDigits.includes(cleanClientDigits) || cleanClientDigits.includes(cleanSenderDigits);
        });
        if (matched) {
          clientId = matched.id;
          esProspecto = false;
        }
      }
    } else {
      try {
        if (cleanSenderDigits) {
          if (cleanSenderDigits.length >= 8) {
            const last8 = cleanSenderDigits.slice(-8);
            const result = await dbQuery("SELECT id FROM clients WHERE regexp_replace(phone, '\\D', '', 'g') LIKE $1", [`%${last8}`]);
            if (result.rows.length > 0) {
              clientId = result.rows[0].id;
              esProspecto = false;
            }
          } else {
            const result = await dbQuery("SELECT id FROM clients WHERE regexp_replace(phone, '\\D', '', 'g') = $1", [cleanSenderDigits]);
            if (result.rows.length > 0) {
              clientId = result.rows[0].id;
              esProspecto = false;
            }
          }
        }
      } catch (e) {
        console.error('[API ALERTS] Error matching client by phone:', e);
      }
    }

    const alertData = {
      id, rawMessage, sourceGroup, senderPhone, 
      suggestedType: type, 
      suggestedCropType: crop, 
      suggestedQuantity: Number(suggestedQuantity) || 0,
      status: status || 'nueva',
      ownerId: userId,
      createdAt,
      clientId,
      esProspecto,
      location: location || null,
      paymentTerms: paymentTerms || null,
      grainQuality: grainQuality || null
    };

    if (isDbSimulated()) {
      simulatedDb.whatsapp_alerts.push(alertData);
      notifyClients('whatsapp-alerts', {});
      return res.status(201).json(alertData);
    }

    await dbQuery(
      `INSERT INTO whatsapp_alerts (id, raw_message, source_group, sender_phone, suggested_type, suggested_crop_type, suggested_quantity, status, owner_id, created_at, client_id, es_prospecto, location, payment_terms, grain_quality)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [id, rawMessage, sourceGroup, senderPhone, alertData.suggestedType, alertData.suggestedCropType, alertData.suggestedQuantity, alertData.status, userId, createdAt, clientId, esProspecto, alertData.location, alertData.paymentTerms, alertData.grainQuality]
    );
    notifyClients('whatsapp-alerts', {});
    res.status(201).json(alertData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/whatsapp-alerts/:id', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { id } = req.params;
    const { status } = req.body;

    if (isDbSimulated()) {
      const alert = simulatedDb.whatsapp_alerts.find(a => a.id === id && (a.ownerId === userId || a.ownerId === 'GLOBAL'));
      if (alert) {
        if (status !== undefined) alert.status = status;
        notifyClients('whatsapp-alerts', {});
        return res.json(alert);
      }
      return res.status(404).json({ error: 'Alert not found' });
    }

    await dbQuery(
      'UPDATE whatsapp_alerts SET status = COALESCE($1, status) WHERE id = $2 AND (owner_id = $3 OR owner_id = \'GLOBAL\')',
      [status, id, userId]
    );
    
    const result = await dbQuery(
      `SELECT id, raw_message as "rawMessage", source_group as "sourceGroup", sender_phone as "senderPhone",
              suggested_type as "suggestedType", suggested_crop_type as "suggestedCropType",
              suggested_quantity as "suggestedQuantity", suggested_price as "suggestedPrice",
              suggested_quantity_unit as "suggestedQuantityUnit", suggested_price_unit as "suggestedPriceUnit",
              original_quantity as "originalQuantity", original_price as "originalPrice",
              location, status, owner_id as "ownerId", created_at as "createdAt",
              client_id as "clientId", es_prospecto as "esProspecto",
              payment_terms as "paymentTerms", grain_quality as "grainQuality"
       FROM whatsapp_alerts WHERE id = $1`, [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    notifyClients('whatsapp-alerts', {});
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/whatsapp-alerts/:id', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { id } = req.params;
    if (isDbSimulated()) {
      const idx = simulatedDb.whatsapp_alerts.findIndex(a => a.id === id && (a.ownerId === userId || a.ownerId === 'GLOBAL'));
      if (idx !== -1) {
        simulatedDb.whatsapp_alerts.splice(idx, 1);
        notifyClients('whatsapp-alerts', {});
        return res.json({ success: true });
      }
      return res.status(404).json({ error: 'Alert not found' });
    }

    await dbQuery('DELETE FROM whatsapp_alerts WHERE id = $1 AND (owner_id = $2 OR owner_id = \'GLOBAL\')', [id, userId]);
    notifyClients('whatsapp-alerts', {});
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Deals
app.get('/api/deals', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (isDbSimulated()) {
      const data = simulatedDb.deals.filter(d => d.ownerId === userId || d.ownerId === 'GLOBAL');
      return res.json(data);
    }
    const result = await dbQuery(
      `SELECT id, crop_type as "cropType", seller_id as "sellerId", buyer_id as "buyerId",
              seller_name as "sellerName", buyer_name as "buyerName", quantity_tn as "quantity_tn",
              price_seller as "price_seller", price_buyer as "price_buyer", total_commission as "totalCommission",
              location, owner_id as "ownerId", created_at as "createdAt",
              payment_terms as "payment_terms", grain_quality as "grain_quality", estimated_freight as "estimated_freight",
              logistics_status as "logistics_status", logistics_cupo as "logistics_cupo", logistics_cpe as "logistics_cpe",
              logistics_driver as "logistics_driver", logistics_plate as "logistics_plate",
              delivery_status as "delivery_status", delivery_moisture as "delivery_moisture", delivery_weight_net as "delivery_weight_net",
              delivery_ticket as "delivery_ticket", delivery_certificate as "delivery_certificate",
              liq_status as "liq_status", liq_lpg_number as "liq_lpg_number",
              liq_drying_cost as "liq_drying_cost", liq_cleaning_cost as "liq_cleaning_cost",
              liq_freight_cost as "liq_freight_cost", liq_tax_withheld as "liq_tax_withheld",
              liq_net_payout as "liq_net_payout", liq_invoice_number as "liq_invoice_number",
              operation_status as "operation_status"
       FROM deals WHERE owner_id = $1 OR owner_id = $2`,
      [userId, 'GLOBAL']
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/deals', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { cropType, sellerId, buyerId, sellerName, buyerName, quantity_tn, price_seller, price_buyer, totalCommission, location, payment_terms, grain_quality, estimated_freight } = req.body;
    const id = crypto.randomUUID();
    const createdAt = new Date();
    const dealData = {
      id, cropType, sellerId, buyerId, sellerName, buyerName,
      quantity_tn: Number(quantity_tn),
      price_seller: Number(price_seller),
      price_buyer: Number(price_buyer),
      totalCommission: Number(totalCommission),
      location: location || 'A convenir',
      payment_terms: payment_terms || '72 hs',
      grain_quality: grain_quality || 'Cámara',
      estimated_freight: estimated_freight ? Number(estimated_freight) : 0,
      logistics_status: 'pendiente',
      delivery_status: 'pendiente',
      liq_status: 'pendiente',
      operation_status: 'abierta',
      ownerId: userId,
      createdAt
    };

    if (isDbSimulated()) {
      simulatedDb.deals.push(dealData);
      notifyClients('deals', {});
      logActivity(userId, 'Creó Negocio', `${cropType} (${quantity_tn} tn)`);
      return res.status(201).json(dealData);
    }

    await dbQuery(
      `INSERT INTO deals (
        id, crop_type, seller_id, buyer_id, seller_name, buyer_name, quantity_tn, price_seller, price_buyer, total_commission, location,
        payment_terms, grain_quality, estimated_freight, logistics_status, delivery_status, liq_status, operation_status, owner_id, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
      [
        id, cropType, sellerId, buyerId, sellerName, buyerName, Number(quantity_tn), Number(price_seller), Number(price_buyer), Number(totalCommission), dealData.location,
        dealData.payment_terms, dealData.grain_quality, Number(dealData.estimated_freight), dealData.logistics_status, dealData.delivery_status, dealData.liq_status, dealData.operation_status, userId, createdAt
      ]
    );
    notifyClients('deals', {});
    logActivity(userId, 'Creó Negocio', `${cropType} (${quantity_tn} tn)`);
    res.status(201).json(dealData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/deals/:id', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { id } = req.params;
    const updates = req.body;
    
    if (isDbSimulated()) {
      const idx = simulatedDb.deals.findIndex(d => d.id === id);
      if (idx !== -1) {
        simulatedDb.deals[idx] = { ...simulatedDb.deals[idx], ...updates };
        notifyClients('deals', {});
        logActivity(userId, 'Actualizó Operación', `Boleto #${id.substring(0, 6)}`);
        return res.json(simulatedDb.deals[idx]);
      }
      return res.status(404).json({ error: 'Operación no encontrada' });
    }
    
    const keys = Object.keys(updates);
    if (keys.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }
    
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    for (const key of keys) {
      let col = key;
      if (key === 'cropType') col = 'crop_type';
      else if (key === 'sellerId') col = 'seller_id';
      else if (key === 'buyerId') col = 'buyer_id';
      else if (key === 'sellerName') col = 'seller_name';
      else if (key === 'buyerName') col = 'buyer_name';
      else if (key === 'totalCommission') col = 'total_commission';
      
      setClauses.push(`${col} = $${paramIndex}`);
      values.push(updates[key]);
      paramIndex++;
    }
    
    values.push(id);
    const query = `UPDATE deals SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
    const result = await dbQuery(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Operación no encontrada' });
    }
    
    // Convert DB keys back to camelCase/snakeCase mapping for client
    const updatedRow = result.rows[0];
    const clientRow = {
      id: updatedRow.id,
      cropType: updatedRow.crop_type,
      sellerId: updatedRow.seller_id,
      buyerId: updatedRow.buyer_id,
      sellerName: updatedRow.seller_name,
      buyerName: updatedRow.buyer_name,
      payment_terms: updatedRow.payment_terms,
      grain_quality: updatedRow.grain_quality,
      logistics_cupo: updatedRow.logistics_cupo,
      logistics_cpe: updatedRow.logistics_cpe,
      logistics_driver: updatedRow.logistics_driver,
      logistics_plate: updatedRow.logistics_plate,
      delivery_status: updatedRow.delivery_status,
      delivery_moisture: Number(updatedRow.delivery_moisture || 0),
      delivery_weight_net: Number(updatedRow.delivery_weight_net || 0),
      delivery_ticket: updatedRow.delivery_ticket,
      delivery_certificate: updatedRow.delivery_certificate,
      liq_status: updatedRow.liq_status,
      liq_lpg_number: updatedRow.liq_lpg_number,
      liq_drying_cost: Number(updatedRow.liq_drying_cost || 0),
      liq_cleaning_cost: Number(updatedRow.liq_cleaning_cost || 0),
      liq_freight_cost: Number(updatedRow.liq_freight_cost || 0),
      liq_tax_withheld: Number(updatedRow.liq_tax_withheld || 0),
      liq_net_payout: Number(updatedRow.liq_net_payout || 0),
      liq_invoice_number: updatedRow.liq_invoice_number,
      operation_status: updatedRow.operation_status,
      ownerId: updatedRow.owner_id,
      createdAt: updatedRow.created_at
    };
    
    notifyClients('deals', {});
    logActivity(userId, 'Actualizó Operación', `Boleto #${id.substring(0, 6)}`);
    res.json(clientRow);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Tasks
app.get('/api/tasks', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (isDbSimulated()) {
      const data = simulatedDb.tasks.filter(t => t.ownerId === userId);
      return res.json(data);
    }
    const result = await dbQuery(
      `SELECT id, task_title as "taskTitle", client_id as "clientId", client_name as "clientName",
              due_date as "dueDate", crop_type as "cropType", category, status, owner_id as "ownerId", created_at as "createdAt"
       FROM tasks WHERE owner_id = $1`, [userId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { taskTitle, clientId, clientName, dueDate, cropType, category } = req.body;
    const id = crypto.randomUUID();
    const createdAt = new Date();
    const taskData = {
      id, taskTitle, clientId, clientName, dueDate, cropType, category,
      status: 'pendiente',
      ownerId: userId,
      createdAt
    };

    if (isDbSimulated()) {
      simulatedDb.tasks.push(taskData);
      notifyClients('tasks', {});
      logActivity(userId, 'Creó Tarea', taskTitle);
      return res.status(201).json(taskData);
    }

    await dbQuery(
      `INSERT INTO tasks (id, task_title, client_id, client_name, due_date, crop_type, category, status, owner_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, taskTitle, clientId, clientName, dueDate, cropType, category, 'pendiente', userId, createdAt]
    );
    notifyClients('tasks', {});
    logActivity(userId, 'Creó Tarea', taskTitle);
    res.status(201).json(taskData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/tasks/:id', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { id } = req.params;
    const { status } = req.body;

    if (isDbSimulated()) {
      const task = simulatedDb.tasks.find(t => t.id === id && t.ownerId === userId);
      if (task) {
        if (status !== undefined) task.status = status;
        notifyClients('tasks', {});
        logActivity(userId, 'Actualizó Tarea', `${task.taskTitle} -> ${status}`);
        return res.json(task);
      }
      return res.status(404).json({ error: 'Task not found' });
    }

    await dbQuery(
      'UPDATE tasks SET status = COALESCE($1, status) WHERE id = $2 AND owner_id = $3',
      [status, id, userId]
    );

    const result = await dbQuery(
      `SELECT id, task_title as "taskTitle", client_id as "clientId", client_name as "clientName",
              due_date as "dueDate", crop_type as "cropType", category, status, owner_id as "ownerId", created_at as "createdAt"
       FROM tasks WHERE id = $1`, [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    notifyClients('tasks', {});
    logActivity(userId, 'Actualizó Tarea', `${result.rows[0].taskTitle} -> ${status}`);
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const { id } = req.params;
    if (isDbSimulated()) {
      const idx = simulatedDb.tasks.findIndex(t => t.id === id && t.ownerId === userId);
      if (idx !== -1) {
        const deletedTask = simulatedDb.tasks.splice(idx, 1)[0];
        notifyClients('tasks', {});
        logActivity(userId, 'Eliminó Tarea', deletedTask.taskTitle);
        return res.json({ success: true });
      }
      return res.status(404).json({ error: 'Task not found' });
    }

    const getTask = await dbQuery('SELECT task_title as "taskTitle" FROM tasks WHERE id = $1 AND owner_id = $2', [id, userId]);
    const taskTitle = getTask.rows[0]?.taskTitle || id;

    await dbQuery('DELETE FROM tasks WHERE id = $1 AND owner_id = $2', [id, userId]);
    notifyClients('tasks', {});
    logActivity(userId, 'Eliminó Tarea', taskTitle);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET es obligatorio y debe tener al menos 32 caracteres.');
  }
  if (!WEBHOOK_VERIFY_TOKEN) {
    console.warn('[WARN] WHATSAPP_VERIFY_TOKEN no definido. El webhook de Meta no funcionará.');
  }
  
  await initializeDatabase();

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      db: 'postgres',
      gemini: process.env.GEMINI_API_KEY ? 'configured' : 'missing',
      whatsapp: getWhatsAppStatus().status
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  function tryListen(port: number) {
    httpServer.listen(port, "0.0.0.0", () => {
      console.log(`\n======================================================`);
      console.log(`🌾  AgroSys está corriendo exitosamente`);
      console.log(`👉  Abre en tu navegador: http://localhost:${port}`);
      console.log(`======================================================\n`);
      startWhatsAppConnection().catch(err => {
        console.warn('[WA] WhatsApp auto-start info:', err?.message || err);
      });
    });
  }

  tryListen(PORT);
}

startServer().catch(console.error);
