import type { Request, Response } from 'express';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { dbQuery, isDbSimulated, simulatedDb } from '../../server_db.ts';

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

  const { sendWhatsAppMessage } = await import('../../whatsapp_connector.ts');

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

export async function parseOpportunityText(req: Request, res: Response) {
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
      model: 'gemini-3.5-flash',
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
}

export async function parseAudio(req: Request, res: Response) {
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
      model: 'gemini-3.5-flash',
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
}

export async function pizarraHistory(req: Request, res: Response) {
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
}

export async function realPizarraPrices(req: Request, res: Response) {
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
      model: 'gemini-3.5-flash',
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
}
