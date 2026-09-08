import type { Request, Response } from 'express';
import crypto from 'crypto';
import { dbQuery, isDbSimulated, simulatedDb } from '../../server_db.ts';
import { getUserId } from '../services/jwt.ts';
import { canAccessOwnedRecord, sharedOwnerId } from '../services/owner.ts';
import { notifyClients } from '../services/realtime.ts';
import { logActivity } from '../services/activity.ts';

const DEAL_PATCH_COLUMNS: Record<string, string> = {
  cropType: 'crop_type',
  sellerId: 'seller_id',
  buyerId: 'buyer_id',
  sellerName: 'seller_name',
  buyerName: 'buyer_name',
  totalCommission: 'total_commission',
  quantity_tn: 'quantity_tn',
  price_seller: 'price_seller',
  price_buyer: 'price_buyer',
  location: 'location',
  payment_terms: 'payment_terms',
  grain_quality: 'grain_quality',
  estimated_freight: 'estimated_freight',
  logistics_status: 'logistics_status',
  logistics_cupo: 'logistics_cupo',
  logistics_cpe: 'logistics_cpe',
  logistics_driver: 'logistics_driver',
  logistics_plate: 'logistics_plate',
  delivery_status: 'delivery_status',
  delivery_moisture: 'delivery_moisture',
  delivery_weight_net: 'delivery_weight_net',
  delivery_ticket: 'delivery_ticket',
  delivery_certificate: 'delivery_certificate',
  liq_status: 'liq_status',
  liq_lpg_number: 'liq_lpg_number',
  liq_drying_cost: 'liq_drying_cost',
  liq_cleaning_cost: 'liq_cleaning_cost',
  liq_freight_cost: 'liq_freight_cost',
  liq_tax_withheld: 'liq_tax_withheld',
  liq_net_payout: 'liq_net_payout',
  liq_invoice_number: 'liq_invoice_number',
  operation_status: 'operation_status'
};

export async function list(req: Request, res: Response) {
  try {
    const userId = await getUserId(req);
    if (isDbSimulated()) {
      const data = simulatedDb.deals.filter(d => canAccessOwnedRecord(d.ownerId, userId));
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
      [userId, sharedOwnerId(userId)]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function create(req: Request, res: Response) {
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
      notifyClients('deals', {}, userId);
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
    notifyClients('deals', {}, userId);
    logActivity(userId, 'Creó Negocio', `${cropType} (${quantity_tn} tn)`);
    res.status(201).json(dealData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function update(req: Request, res: Response) {
  try {
    const userId = await getUserId(req);
    const { id } = req.params;
    const updates = req.body && typeof req.body === 'object' ? req.body : {};
    
    if (isDbSimulated()) {
      const idx = simulatedDb.deals.findIndex(d => d.id === id && canAccessOwnedRecord(d.ownerId, userId));
      if (idx !== -1) {
        const safeUpdates: Record<string, unknown> = {};
        for (const key of Object.keys(updates)) {
          if (DEAL_PATCH_COLUMNS[key]) safeUpdates[key] = updates[key];
        }
        simulatedDb.deals[idx] = { ...simulatedDb.deals[idx], ...safeUpdates };
        notifyClients('deals', {}, userId);
        logActivity(userId, 'Actualizó Operación', `Boleto #${id.substring(0, 6)}`);
        return res.json(simulatedDb.deals[idx]);
      }
      return res.status(404).json({ error: 'Operación no encontrada' });
    }
    
    const keys = Object.keys(updates).filter(key => DEAL_PATCH_COLUMNS[key]);
    if (keys.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }
    
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    for (const key of keys) {
      setClauses.push(`${DEAL_PATCH_COLUMNS[key]} = $${paramIndex}`);
      values.push(updates[key]);
      paramIndex++;
    }
    
    values.push(id, userId, sharedOwnerId(userId));
    const query = `UPDATE deals SET ${setClauses.join(', ')} WHERE id = $${paramIndex} AND (owner_id = $${paramIndex + 1} OR owner_id = $${paramIndex + 2}) RETURNING *`;
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
    
    notifyClients('deals', {}, userId);
    logActivity(userId, 'Actualizó Operación', `Boleto #${id.substring(0, 6)}`);
    res.json(clientRow);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
