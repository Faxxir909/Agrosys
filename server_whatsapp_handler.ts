import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';
import { isDbSimulated, dbQuery, simulatedDb } from './server_db.ts';
import crypto from 'crypto';

// Lazy initialization of Firebase Admin
let db: FirebaseFirestore.Firestore | null = null;
export function getDb() {
  if (!db) {
    const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    console.log("Service Account JSON var length:", serviceAccountVar?.length);
    if (!serviceAccountVar) {
      console.warn("FIREBASE_SERVICE_ACCOUNT_JSON env var missing, simulating database connection.");
      return null;
    }
    
    let serviceAccount;
    try {
       if (serviceAccountVar.trim().startsWith('{')) {
           serviceAccount = JSON.parse(serviceAccountVar);
       } else {
           serviceAccount = JSON.parse(Buffer.from(serviceAccountVar, 'base64').toString('utf-8'));
       }
    } catch(e: any) {
       console.error("Parse error details:", e);
       console.warn("Could not parse FIREBASE_SERVICE_ACCOUNT_JSON, simulating database connection.");
       return null;
    }
    
    if (getApps().length === 0) {
      initializeApp({ credential: cert(serviceAccount) });
    }
    db = getFirestore();
  }
  return db;
}

// In-memory fallback
export const fallbackMessages: any[] = [];

// WhatsApp Settings
export const whatsappSettings = {
  bypassHeuristic: false,
  matchTolerance: 0.15
};

// Layer 1 Heuristic Filter to filter out general messages before running LLM
export function hasTradeIntent(text: string): boolean {
  if (!text) return false;
  const cleanText = text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // strip accents (e.g. maíz -> maiz)

  const grainKeywords = [
    'soja', 'sj', 'soj', 'sja', 'poroto',
    'maiz', 'mz', 'miz', 'maices',
    'trigo', 'tg', 'tgo',
    'sorgo', 'sg', 'srg',
    'girasol', 'gir', 'gso', 'sol'
  ];

  const tradeKeywords = [
    'vendo', 'tengo', 'sale', 'ofrezco', 'dispo', 'oferta', 'fijo', 'fijar', 'liquidar',
    'compro', 'busco', 'necesito', 'pago', 'tomo', 'requiero', 'cupo', 'pagamos', 'compramos', 'buscamos',
    'venta', 'compra', 'disponible', 'disp', 'forward', 'fwd', 'contrato', 'contractual',
    'usd', 'u$s', 'ars', 'toneladas', 'tn', 'ton', 'camion', 'camiones', 'qq', 'quintal', 'quintales',
    'cámara', 'camara', 'grado', 'ph'
  ];

  // Split word tokens by non-alphanumeric chars
  const words = cleanText.split(/[^a-z0-9]/).filter(Boolean);

  const hasGrain = grainKeywords.some(g => words.includes(g));
  if (!hasGrain) return false;

  const hasTradeKeyword = tradeKeywords.some(t => words.includes(t));
  const hasNumbers = /\b\d+\b/.test(cleanText);

  return hasTradeKeyword || hasNumbers;
}

// Local Regex Parser to fallback to if Gemini API key is missing or calls fail
export function fallbackRegexParse(text: string) {
  const cleanText = text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // strip accents

  let type: 'oferta' | 'demanda' | 'desconocido' = 'desconocido';
  if (/\b(vendo|venta|tengo|ofrezco|sale|dispo|disponible|disponibles|oferta|liquidar|entrego|fijo|fijar)\b/i.test(cleanText)) {
    type = 'oferta';
  } else if (/\b(compro|compra|busco|buscamos|necesito|necesitamos|pago|pagamos|tomo|cupo|demanda|compramos|requiero)\b/i.test(cleanText)) {
    type = 'demanda';
  }

  let crop = 'desconocido';
  if (/\b(soja|sj|soj|sja|poroto)\b/i.test(cleanText)) {
    crop = 'soja';
  } else if (/\b(maiz|mz|miz|maices)\b/i.test(cleanText)) {
    crop = 'maiz';
  } else if (/\b(trigo|tg|tgo)\b/i.test(cleanText)) {
    crop = 'trigo';
  } else if (/\b(sorgo|sg|srg)\b/i.test(cleanText)) {
    crop = 'sorgo';
  } else if (/\b(girasol|gir|gso|sol)\b/i.test(cleanText)) {
    crop = 'girasol';
  }

  // Extract quantity (e.g. "100 tn", "100tn", "2 camiones", "1000 qq")
  let quantity = 0;
  let quantityUnit = 'tn';
  let originalQuantity: number | null = null;

  const qtyMatch = cleanText.match(/(\d+)\s*(tn|ton|toneladas|qq|quintales|camion|camiones)\b/i);
  if (qtyMatch) {
    const num = Number(qtyMatch[1]);
    const unit = qtyMatch[2].toLowerCase();
    originalQuantity = num;
    quantityUnit = unit;

    if (unit.startsWith('qq')) {
      quantity = num / 10;
    } else if (unit.startsWith('camion')) {
      quantity = num * 30;
    } else {
      quantity = num;
    }
  } else {
    // Try generic number matching (first number found)
    const numberMatch = cleanText.match(/\b\d+\b/);
    if (numberMatch) {
      quantity = Number(numberMatch[0]);
    }
  }

  // Extract price (e.g. "a 170", "usd 170", "$ 170", "u$s170")
  let price: number | null = null;
  let priceUnit = 'USD';
  let originalPrice: number | null = null;

  const priceMatch = cleanText.match(/(?:usd|u\$s|\$|\ba\b)\s*(\d+)\b/i) || cleanText.match(/\b(\d+)\s*(?:usd|u\$s|\$|dls)\b/i);
  if (priceMatch) {
    price = Number(priceMatch[1]);
    originalPrice = price;
  }

  // Extract common ports/localities
  let location: string | null = null;
  const ports = ['rosario', 'san lorenzo', 'timbues', 'necochea', 'bahia blanca', 'quequen', 'sinsacate', 'laboulaye'];
  for (const port of ports) {
    if (cleanText.includes(port)) {
      location = port.charAt(0).toUpperCase() + port.slice(1);
      break;
    }
  }

  // Extract payment conditions
  let paymentTerms: string | null = null;
  if (cleanText.includes('contractual')) paymentTerms = 'contractual';
  else if (cleanText.includes('72hs') || cleanText.includes('72 hs')) paymentTerms = '72hs';
  else if (cleanText.includes('contado')) paymentTerms = 'contado';
  else if (cleanText.includes('disponible') || cleanText.includes('disp')) paymentTerms = 'disponible';

  // Extract quality
  let grainQuality: string | null = null;
  if (cleanText.includes('camara')) grainQuality = 'cámara';
  else if (cleanText.includes('grado 2') || cleanText.includes('g2')) grainQuality = 'grado 2';
  else if (cleanText.includes('grado 1') || cleanText.includes('g1')) grainQuality = 'grado 1';

  return {
    type,
    crop,
    quantity,
    quantityUnit,
    originalQuantity,
    price,
    priceUnit,
    originalPrice,
    location,
    paymentTerms,
    grainQuality
  };
}

export async function processIncomingMessage(rawMessage: string, senderPhone: string, sourceGroup: string = 'WhatsApp Baileys', messageId?: string) {
  const alertId = messageId || crypto.randomUUID();

  // Check for duplicates before executing any logic or calling Gemini model
  if (isDbSimulated()) {
    if (simulatedDb.whatsapp_alerts.some(a => a.id === alertId)) {
      console.log(`[WA HANDLER] Message ${alertId} already processed in memory. Skipping.`);
      return;
    }
  } else {
    try {
      const result = await dbQuery('SELECT id FROM whatsapp_alerts WHERE id = $1', [alertId]);
      if (result.rows.length > 0) {
        console.log(`[WA HANDLER] Message ${alertId} already processed in PostgreSQL. Skipping.`);
        return;
      }
    } catch (err) {
      console.error(`[WA HANDLER] Error checking duplicate on PostgreSQL for ${alertId}`, err);
    }
  }

  // 1. Perform Layer 1 heuristic filtering to avoid calling Gemini for non-trade chats
  if (!whatsappSettings.bypassHeuristic && !hasTradeIntent(rawMessage)) {
    console.log(`[WA HANDLER] Message ${alertId} filtered out by Layer 1 heuristic check. Not a grain trade offer/demand.`);
    return;
  }

  let suggestedType = 'desconocido';
  let suggestedCropType = 'desconocido';
  let suggestedQuantity = 0;
  let suggestedPrice = null;
  let suggestedQuantityUnit = 'tn';
  let suggestedPriceUnit = 'USD';
  let originalQuantity = null;
  let originalPrice = null;
  let location: string | null = null;
  let paymentTerms: string | null = null;
  let grainQuality: string | null = null;

  // 1. Analyze with Gemini
  let parsedByGemini = false;
  try {
     if (process.env.GEMINI_API_KEY) {
        console.log(`[WA HANDLER] Calling Gemini API for message ${alertId}...`);
        const ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY.trim(),
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            }
          }
        });
        
        const prompt = `Analiza el siguiente mensaje de un grupo de WhatsApp de compra/venta de granos agropecuarios en Argentina.
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
  "quantity": cantidad calculada/normalizada en toneladas (número, 0 si no se especifica),
  "quantityUnit": unidad original identificada (ej: "tn", "qq", "camiones", "toneladas") o "tn" por defecto,
  "originalQuantity": número original del texto sin convertir (número o null),
  "price": precio numérico (número o null),
  "priceUnit": moneda original identificada (ej: "USD", "ARS", "$") o "USD" por defecto,
  "originalPrice": número original de precio sin convertir (número o null),
  "location": localidad, puerto o procedencia (string o null),
  "paymentTerms": condición de pago (string o null),
  "grainQuality": calidad del grano (string o null)
}

Mensaje: "${rawMessage}"`;
        
        const response = await ai.models.generateContent({
           model: 'gemini-2.5-flash',
           contents: prompt,
           config: {
             responseMimeType: 'application/json'
           }
        });
        
        const text = response.text || '';
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          suggestedType = parsed.type === 'oferta' || parsed.type === 'demanda' ? parsed.type : 'desconocido';
          suggestedCropType = parsed.crop || 'desconocido';
          suggestedQuantity = Number(parsed.quantity) || 0;
          suggestedPrice = parsed.price !== undefined ? parsed.price : null;
          suggestedQuantityUnit = parsed.quantityUnit || 'tn';
          suggestedPriceUnit = parsed.priceUnit || 'USD';
          originalQuantity = parsed.originalQuantity !== undefined ? parsed.originalQuantity : null;
          originalPrice = parsed.originalPrice !== undefined ? parsed.originalPrice : null;
          location = parsed.location || null;
          paymentTerms = parsed.paymentTerms || null;
          grainQuality = parsed.grainQuality || null;
          parsedByGemini = true;
        }
     } else {
        console.warn(`[WA HANDLER] GEMINI_API_KEY is not defined in the environment. Skipping Gemini call for message ${alertId}.`);
     }
  } catch (e) {
     console.error('[WA HANDLER] Gemini extraction error, falling back to regex parser:', e);
  }

  // Fallback to local regex parser if Gemini is unconfigured or failed
  if (!parsedByGemini) {
     console.log(`[WA HANDLER] Running Local Regex Fallback Parser for message ${alertId}...`);
     const parsed = fallbackRegexParse(rawMessage);
     suggestedType = parsed.type;
     suggestedCropType = parsed.crop;
     suggestedQuantity = parsed.quantity;
     suggestedPrice = parsed.price;
     suggestedQuantityUnit = parsed.quantityUnit;
     suggestedPriceUnit = parsed.priceUnit;
     originalQuantity = parsed.originalQuantity;
     originalPrice = parsed.originalPrice;
     location = parsed.location;
     paymentTerms = parsed.paymentTerms;
     grainQuality = parsed.grainQuality;
  }

  // 2. Filter out non-trade messages (anything that isn't a valid grain offer or demand)
  if (suggestedType === 'desconocido' || suggestedCropType === 'desconocido') {
     console.log(`[WA HANDLER] Discarding message ${alertId} because it is not a valid grain trade offer or demand. (Type: ${suggestedType}, Crop: ${suggestedCropType})`);
     return;
  }

  // 3. Match client by phone number
  let clientId: string | null = null;
  let esProspecto = true;

  const cleanSenderDigits = senderPhone.replace(/\D/g, '');
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
      console.error('[WA HANDLER] Error matching client by phone:', e);
    }
  }

  // 4. Save to database
  try {
     const alertData = {
       id: alertId,
       rawMessage,
       sourceGroup,
       senderPhone,
       suggestedType,
       suggestedCropType,
       suggestedQuantity,
       suggestedPrice,
       suggestedQuantityUnit,
       suggestedPriceUnit,
       originalQuantity,
       originalPrice,
       location,
       paymentTerms,
       grainQuality,
       status: 'nueva',
       ownerId: 'GLOBAL',
       createdAt: new Date(),
       clientId,
       esProspecto
     };

     if (isDbSimulated()) {
         simulatedDb.whatsapp_alerts.push(alertData);
         console.log('Saved message to in-memory fallback (Postgres unconfigured):', alertData);
     } else {
         await dbQuery(
           `INSERT INTO whatsapp_alerts (
             id, raw_message, source_group, sender_phone, suggested_type, suggested_crop_type, 
             suggested_quantity, suggested_price, suggested_quantity_unit, suggested_price_unit, 
             original_quantity, original_price, location, status, owner_id, created_at, client_id, es_prospecto,
             payment_terms, grain_quality
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
           [
             alertId, rawMessage, sourceGroup, senderPhone, suggestedType, suggestedCropType,
             suggestedQuantity, suggestedPrice, suggestedQuantityUnit, suggestedPriceUnit,
             originalQuantity, originalPrice, alertData.location, 'nueva', 'GLOBAL', alertData.createdAt,
             clientId, esProspecto, paymentTerms, grainQuality
           ]
         );
         console.log(`Successfully saved WhatsApp alert ${alertId} to PostgreSQL`);
     }

      // Check for real-time matches against active CRM opportunities
      if (suggestedType !== 'desconocido' && suggestedCropType !== 'desconocido') {
        let matchingOpps: any[] = [];
        if (isDbSimulated()) {
          matchingOpps = simulatedDb.opportunities.filter(o => 
            o.status === 'abierta' && 
            o.cropType === suggestedCropType && 
            o.type !== suggestedType
          );
        } else {
          try {
            const oppositeType = suggestedType === 'oferta' ? 'demanda' : 'oferta';
            const result = await dbQuery(
              `SELECT id, client_id as "clientId", quantity_tn as "quantity_tn", price_usd as "price_usd", location 
               FROM opportunities 
               WHERE status = 'abierta' AND crop_type = $1 AND type = $2`,
              [suggestedCropType, oppositeType]
            );
            matchingOpps = result.rows;
          } catch (e) {
            console.error('[WA MATCH ENGINE] Error searching matching opportunities:', e);
          }
        }

        if (matchingOpps.length > 0) {
          console.log(`[WA MATCH ENGINE] ⚡ ALERTA COMPATIBLE: El mensaje entrante de ${suggestedType} de ${suggestedCropType} cruza con ${matchingOpps.length} oportunidades activas en el CRM!`);
        }
      }

      // Fire callback to notify Socket.io clients
      if (onAlertAddedCallback) {
        onAlertAddedCallback();
      }

      // Try sending a WhatsApp auto-reply confirmation
      if (suggestedCropType !== 'desconocido' && suggestedQuantity > 0) {
        let clientName: string | null = null;
        if (clientId) {
          if (isDbSimulated()) {
            const matched = simulatedDb.clients.find(c => c.id === clientId);
            if (matched) clientName = matched.name;
          } else {
            try {
              const result = await dbQuery("SELECT name FROM clients WHERE id = $1", [clientId]);
              if (result.rows.length > 0) {
                clientName = result.rows[0].name;
              }
            } catch (e) {
              console.error('[WA AUTO-REPLY] Error searching client name:', e);
            }
          }
        }

        const typeDescription = suggestedType === 'oferta' 
          ? 'oferta de VENTA 🛒' 
          : suggestedType === 'demanda' 
            ? 'demanda de COMPRA 🛍️' 
            : 'mensaje 📝';
        const confirmationText = `Hola${clientName ? ' ' + clientName : ''}! Registramos tu ${typeDescription} en el sistema:\n\n🌾 Grano: ${suggestedCropType.toUpperCase()}\n📐 Cantidad: ${suggestedQuantity} tn\n💰 Precio sugerido: ${suggestedPrice ? suggestedPrice + ' ' + suggestedPriceUnit : 'A convenir'}\n\n¡Muchas gracias por operar con Agrosys!`;

        import('./whatsapp_connector.ts').then(({ sendWhatsAppMessage }) => {
          sendWhatsAppMessage(senderPhone, confirmationText).catch(console.error);
        }).catch(console.error);
      }
  } catch (e) {
     console.error('Failed to save WhatsApp alert to database:', e);
  }
}

let onAlertAddedCallback: (() => void) | null = null;
export function registerOnAlertAdded(callback: () => void) {
  onAlertAddedCallback = callback;
}
