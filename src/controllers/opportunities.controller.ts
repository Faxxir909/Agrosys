import type { Request, Response } from 'express';
import crypto from 'crypto';
import { dbQuery, dbTransaction, isDbSimulated, simulatedDb } from '../../server_db.ts';
import { getUserId } from '../services/jwt.ts';
import { canAccessOwnedRecord, sharedOwnerId } from '../services/owner.ts';
import { notifyClients } from '../services/realtime.ts';
import { logActivity } from '../services/activity.ts';
import { whatsappSettings } from '../../server_whatsapp_handler.ts';

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
           AND (o.owner_id = $1 OR o.owner_id = $2)`,
        [userId, sharedOwnerId(userId)]
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
       WHERE owner_id = $1 OR owner_id = $2`,
      [userId, sharedOwnerId(userId)]
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

export async function list(req: Request, res: Response) {
  try {
    const userId = await getUserId(req);
    if (isDbSimulated()) {
      const data = simulatedDb.opportunities.filter(o => canAccessOwnedRecord(o.ownerId, userId));
      return res.json(data);
    }
    await dbQuery(
      `UPDATE opportunities
       SET status = 'vencida', updated_at = NOW()
       WHERE expires_at < NOW()
         AND status IN ('abierta', 'negociacion')
         AND (owner_id = $1 OR owner_id = $2)`,
      [userId, sharedOwnerId(userId)]
    );
    const result = await dbQuery(
      `SELECT ${OPPORTUNITY_SELECT}
       FROM opportunities WHERE owner_id = $1 OR owner_id = $2
       ORDER BY created_at DESC`,
      [userId, sharedOwnerId(userId)]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function matches(req: Request, res: Response) {
  try {
    const userId = await getUserId(req);
    const matches = await getMatches(userId);
    res.json(matches);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function create(req: Request, res: Response) {
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
      `SELECT id FROM clients WHERE id = $1 AND (owner_id = $2 OR owner_id = $3)`,
      [clientId, userId, sharedOwnerId(userId)]
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
      notifyClients('opportunities', {}, userId);
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
           WHERE id = $1 AND (owner_id = $2 OR owner_id = $3)
           RETURNING id`,
          [sourceAlertId, userId, sharedOwnerId(userId)]
        );
        if (alertResult.rows.length === 0) {
          throw new Error('La alerta de WhatsApp ya no está disponible.');
        }
      }
    });
    notifyClients('opportunities', {}, userId);
    if (sourceAlertId) notifyClients('whatsapp-alerts', {}, userId);
    logActivity(userId, 'Creó Oportunidad', `${cropType} (${quantity_tn} tn)`);
    res.status(201).json(oppData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function update(req: Request, res: Response) {
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
      const opp = simulatedDb.opportunities.find(o => o.id === id && canAccessOwnedRecord(o.ownerId, userId));
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
        notifyClients('opportunities', {}, userId);
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
       WHERE id = $12 AND (owner_id = $13 OR owner_id = $14)`,
      [
        quantity_tn !== undefined ? Number(quantity_tn) : null,
        price_usd !== undefined ? Number(price_usd) : null,
        status, location,
        deliveryDate !== undefined ? validDateOrNull(deliveryDate) : null,
        expiresAt !== undefined ? validDateOrNull(expiresAt, true) : null,
        paymentTerms, grainQuality, priceMode, nextAction,
        lostReason ? String(lostReason).trim() : null,
        id, userId, sharedOwnerId(userId)
      ]
    );

    const result = await dbQuery(
      `SELECT ${OPPORTUNITY_SELECT}
       FROM opportunities WHERE id = $1`, [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }
    notifyClients('opportunities', {}, userId);
    logActivity(userId, 'Modificó Oportunidad', id);
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const userId = await getUserId(req);
    const { id } = req.params;
    if (isDbSimulated()) {
      const idx = simulatedDb.opportunities.findIndex(o => o.id === id && o.ownerId === userId);
      if (idx !== -1) {
        simulatedDb.opportunities.splice(idx, 1);
        notifyClients('opportunities', {}, userId);
        logActivity(userId, 'Eliminó Oportunidad', id);
        return res.json({ success: true });
      }
      return res.status(404).json({ error: 'Opportunity not found' });
    }

    await dbQuery('DELETE FROM opportunities WHERE id = $1 AND owner_id = $2', [id, userId]);
    notifyClients('opportunities', {}, userId);
    logActivity(userId, 'Eliminó Oportunidad', id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
