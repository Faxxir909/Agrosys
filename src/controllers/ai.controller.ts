import type { Request, Response } from 'express';
import { marketService } from '../services/market/marketService.ts';
import { GoogleGenAI } from '@google/genai';


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

// Compatibility endpoints: never return legacy Gemini-generated price history.
export async function pizarraHistory(_req: Request, res: Response) {
  try {
    const grains = ['soja', 'maiz', 'trigo', 'sorgo', 'girasol'] as const;
    const series = await Promise.all(grains.map(grain => marketService.getRosarioHistory({ grain, days: 30 })));
    const byDate = new Map<string, Record<string, unknown>>();
    for (const prices of series) for (const p of prices) {
      const row = byDate.get(p.priceDate) || {
        createdAt: `${p.priceDate}T12:00:00-03:00`, source: 'CAC-BCR — USD informativo',
        soja: null, maiz: null, trigo: null, sorgo: null, girasol: null,
      };
      row[p.grain] = p.isEstimated ? null : p.priceUsd;
      byDate.set(p.priceDate, row);
    }
    res.json([...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, row]) => row));
  } catch {
    res.status(503).json({ error: 'Histórico oficial temporalmente no disponible.' });
  }
}

export async function realPizarraPrices(_req: Request, res: Response) {
  try {
    const data = await marketService.getRosarioCurrentPrices();
    if (!data.success) return res.status(503).json({ error: data.message });
    res.json({
      ...Object.fromEntries(data.products.map(p => [p.grain, p.isEstimated ? null : p.priceUsd])),
      source: 'Cámara Arbitral de Cereales de Rosario — USD informativo',
      sourceUrl: data.sourceUrl, date: data.priceDate, stale: data.stale,
      products: data.products,
    });
  } catch {
    res.status(503).json({ error: 'No se pudo consultar la publicación oficial de BCR.' });
  }
}