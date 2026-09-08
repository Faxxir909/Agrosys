import type { Request, Response } from 'express';
import crypto from 'crypto';
import { dbQuery, dbTransaction, isDbSimulated, simulatedDb } from '../../server_db.ts';
import { getUserId } from '../services/jwt.ts';
import { canAccessOwnedRecord, sharedOwnerId } from '../services/owner.ts';
import { notifyClients } from '../services/realtime.ts';
import { logActivity } from '../services/activity.ts';
import { whatsappSettings, processIncomingMessage } from '../../server_whatsapp_handler.ts';
import { getWhatsAppStatus, startWhatsAppConnection, resetWhatsAppConnection } from '../../whatsapp_connector.ts';

const WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN?.trim() || '';

export async function verifyWebhook(req: Request, res: Response) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && WEBHOOK_VERIFY_TOKEN && token === WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
}

export async function receiveWebhook(req: Request, res: Response) {
  // Always respond with 200 OK to Meta immediately after HMAC check
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
}

export async function status(req: Request, res: Response) {
  res.json(getWhatsAppStatus());
}

export async function start(req: Request, res: Response) {
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
}

export async function reset(req: Request, res: Response) {
  try {
    await resetWhatsAppConnection();
    res.json({ success: true, status: 'disconnected' });
  } catch (err) {
    console.error('Error resetting WhatsApp', err);
    res.status(500).json({ error: 'failed to reset' });
  }
}

export async function getSettings(req: Request, res: Response) {
  res.json(whatsappSettings);
}

export async function updateSettings(req: Request, res: Response) {
  try {
    const userId = await getUserId(req);
    const { bypassHeuristic, matchTolerance } = req.body;
    if (bypassHeuristic !== undefined) whatsappSettings.bypassHeuristic = !!bypassHeuristic;
    if (matchTolerance !== undefined) {
      const tolerance = Number(matchTolerance);
      if (!isNaN(tolerance) && tolerance >= 0 && tolerance <= 1) {
        whatsappSettings.matchTolerance = tolerance;
      }
    }
    notifyClients('whatsapp-settings', whatsappSettings, userId);
    res.json({ success: true, settings: whatsappSettings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function notifyMatch(req: Request, res: Response) {
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

    const { sendWhatsAppMessage } = await import('../../whatsapp_connector.ts');
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
           WHERE id IN ($1, $2) AND (owner_id = $3 OR owner_id = $4)`,
          [offerId, demandId, userId, sharedOwnerId(userId)]
        );
      });
      notifyClients('opportunities', {}, userId);
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
}

export async function sendMessage(req: Request, res: Response) {
  try {
    const userId = await getUserId(req);
    const { phone, message, clientId } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: 'Destinatario y cuerpo del mensaje son obligatorios' });
    }

    const { sendWhatsAppMessage } = await import('../../whatsapp_connector.ts');
    
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
}

export async function listTemplates(req: Request, res: Response) {
  try {
    const userId = await getUserId(req);
    if (isDbSimulated()) {
      const templates = simulatedDb.whatsapp_templates.filter(t => canAccessOwnedRecord(t.ownerId, userId));
      return res.json(templates);
    }
    const result = await dbQuery(
      `SELECT id, name, content, owner_id as "ownerId", created_at as "createdAt"
       FROM whatsapp_templates WHERE owner_id = $1 OR owner_id = $2 ORDER BY created_at DESC`,
      [userId, sharedOwnerId(userId)]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function createTemplate(req: Request, res: Response) {
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
      notifyClients('whatsapp-templates', {}, userId);
      return res.status(201).json(templateData);
    }

    await dbQuery(
      'INSERT INTO whatsapp_templates (id, name, content, owner_id, created_at) VALUES ($1, $2, $3, $4, $5)',
      [id, name, content, userId, createdAt]
    );
    notifyClients('whatsapp-templates', {}, userId);
    res.status(201).json(templateData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function deleteTemplate(req: Request, res: Response) {
  try {
    const userId = await getUserId(req);
    const { id } = req.params;

    if (isDbSimulated()) {
      const idx = simulatedDb.whatsapp_templates.findIndex(t => t.id === id && t.ownerId === userId);
      if (idx !== -1) {
        simulatedDb.whatsapp_templates.splice(idx, 1);
        notifyClients('whatsapp-templates', {}, userId);
        return res.json({ success: true });
      }
      return res.status(404).json({ error: 'Template not found or unauthorized' });
    }

    await dbQuery(
      'DELETE FROM whatsapp_templates WHERE id = $1 AND owner_id = $2',
      [id, userId]
    );
    notifyClients('whatsapp-templates', {}, userId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function listAlerts(req: Request, res: Response) {
  try {
    const userId = await getUserId(req);
    if (isDbSimulated()) {
      const data = simulatedDb.whatsapp_alerts.filter(a => canAccessOwnedRecord(a.ownerId, userId));
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
      [userId, sharedOwnerId(userId)]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function createAlert(req: Request, res: Response) {
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
      notifyClients('whatsapp-alerts', {}, userId);
      return res.status(201).json(alertData);
    }

    await dbQuery(
      `INSERT INTO whatsapp_alerts (id, raw_message, source_group, sender_phone, suggested_type, suggested_crop_type, suggested_quantity, status, owner_id, created_at, client_id, es_prospecto, location, payment_terms, grain_quality)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [id, rawMessage, sourceGroup, senderPhone, alertData.suggestedType, alertData.suggestedCropType, alertData.suggestedQuantity, alertData.status, userId, createdAt, clientId, esProspecto, alertData.location, alertData.paymentTerms, alertData.grainQuality]
    );
    notifyClients('whatsapp-alerts', {}, userId);
    res.status(201).json(alertData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateAlert(req: Request, res: Response) {
  try {
    const userId = await getUserId(req);
    const { id } = req.params;
    const { status } = req.body;

    if (isDbSimulated()) {
      const alert = simulatedDb.whatsapp_alerts.find(a => a.id === id && canAccessOwnedRecord(a.ownerId, userId));
      if (alert) {
        if (status !== undefined) alert.status = status;
        notifyClients('whatsapp-alerts', {}, userId);
        return res.json(alert);
      }
      return res.status(404).json({ error: 'Alert not found' });
    }

    await dbQuery(
      'UPDATE whatsapp_alerts SET status = COALESCE($1, status) WHERE id = $2 AND (owner_id = $3 OR owner_id = $4)',
      [status, id, userId, sharedOwnerId(userId)]
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
    notifyClients('whatsapp-alerts', {}, userId);
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function deleteAlert(req: Request, res: Response) {
  try {
    const userId = await getUserId(req);
    const { id } = req.params;
    if (isDbSimulated()) {
      const idx = simulatedDb.whatsapp_alerts.findIndex(a => a.id === id && canAccessOwnedRecord(a.ownerId, userId));
      if (idx !== -1) {
        simulatedDb.whatsapp_alerts.splice(idx, 1);
        notifyClients('whatsapp-alerts', {}, userId);
        return res.json({ success: true });
      }
      return res.status(404).json({ error: 'Alert not found' });
    }

    await dbQuery('DELETE FROM whatsapp_alerts WHERE id = $1 AND (owner_id = $2 OR owner_id = $3)', [id, userId, sharedOwnerId(userId)]);
    notifyClients('whatsapp-alerts', {}, userId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
