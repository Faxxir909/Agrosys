import type { Request, Response } from 'express';
import crypto from 'crypto';
import { dbQuery, isDbSimulated, simulatedDb } from '../../server_db.ts';
import { getUserId } from '../services/jwt.ts';
import { canAccessOwnedRecord, sharedOwnerId } from '../services/owner.ts';
import { notifyClients } from '../services/realtime.ts';
import { logActivity } from '../services/activity.ts';

export async function list(req: Request, res: Response) {
  try {
    const userId = await getUserId(req);
    if (isDbSimulated()) {
      const data = simulatedDb.clients.filter(c => canAccessOwnedRecord(c.ownerId, userId));
      return res.json(data);
    }
    const result = await dbQuery(
      `SELECT id, name, type, phone, email, cuit, status, notes, location, 
              next_contact_date as "nextContactDate", last_contact_date as "lastContactDate", 
              metadata, owner_id as "ownerId", created_at as "createdAt" 
       FROM clients WHERE owner_id = $1 OR owner_id = $2`,
      [userId, sharedOwnerId(userId)]
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
}

export async function create(req: Request, res: Response) {
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
      notifyClients('clients', {}, userId);
      logActivity(userId, 'Creó Cliente', name);
      return res.status(201).json(clientData);
    }

    await dbQuery(
      `INSERT INTO clients (id, name, type, phone, email, cuit, status, notes, location, next_contact_date, last_contact_date, metadata, owner_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [id, name, type, phone, email, cuit, status, notes, JSON.stringify(location || null), clientData.nextContactDate, clientData.lastContactDate, JSON.stringify(extra), userId, createdAt]
    );
    notifyClients('clients', {}, userId);
    logActivity(userId, 'Creó Cliente', name);
    res.status(201).json(clientData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function update(req: Request, res: Response) {
  try {
    const userId = await getUserId(req);
    const { id } = req.params;
    const { name, type, phone, email, cuit, status, notes, location, nextContactDate, lastContactDate, ...extra } = req.body;

    if (isDbSimulated()) {
      const idx = simulatedDb.clients.findIndex(c => c.id === id && canAccessOwnedRecord(c.ownerId, userId));
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
        notifyClients('clients', {}, userId);
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
       WHERE id = $12 AND (owner_id = $13 OR owner_id = $14)`,
      [
        name, type, phone, email, cuit, status, notes, 
        location ? JSON.stringify(location) : null,
        nextContactDate ? new Date(nextContactDate) : null,
        lastContactDate ? new Date(lastContactDate) : null,
        JSON.stringify(mergedMetadata),
        id, userId, sharedOwnerId(userId)
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
    notifyClients('clients', {}, userId);
    logActivity(userId, 'Modificó Cliente', name || id);
    res.json({
      ...core,
      ...(metadata || {})
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const userId = await getUserId(req);
    const { id } = req.params;
    if (isDbSimulated()) {
      const idx = simulatedDb.clients.findIndex(c => c.id === id && c.ownerId === userId);
      if (idx !== -1) {
        simulatedDb.clients.splice(idx, 1);
        simulatedDb.planted_areas = simulatedDb.planted_areas.filter(a => a.clientId !== id);
        simulatedDb.client_interactions = simulatedDb.client_interactions.filter(i => i.clientId !== id);
        notifyClients('clients', {}, userId);
        logActivity(userId, 'Eliminó Cliente', id);
        return res.json({ success: true });
      }
      return res.status(404).json({ error: 'Client not found' });
    }

    await dbQuery('DELETE FROM clients WHERE id = $1 AND owner_id = $2', [id, userId]);
    notifyClients('clients', {}, userId);
    logActivity(userId, 'Eliminó Cliente', id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function listInteractions(req: Request, res: Response) {
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
}

export async function createInteraction(req: Request, res: Response) {
  try {
    const userId = await getUserId(req);
    const { clientId } = req.params;
    const { clientName, type, note, date } = req.body;
    const id = crypto.randomUUID();
    const createdAt = new Date();
    const interactionData = { id, clientId, clientName, type, note, date, ownerId: userId, createdAt };

    if (isDbSimulated()) {
      simulatedDb.client_interactions.push(interactionData);
      notifyClients('interactions', {}, userId);
      logActivity(userId, 'Agregó Nota CRM', type);
      return res.status(201).json(interactionData);
    }

    await dbQuery(
      `INSERT INTO client_interactions (id, client_id, client_name, type, note, date, owner_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, clientId, clientName, type, note, date, userId, createdAt]
    );
    notifyClients('interactions', {}, userId);
    logActivity(userId, 'Agregó Nota CRM', type);
    res.status(201).json(interactionData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function deleteInteraction(req: Request, res: Response) {
  try {
    const userId = await getUserId(req);
    const { id } = req.params;
    if (isDbSimulated()) {
      const idx = simulatedDb.client_interactions.findIndex(i => i.id === id && i.ownerId === userId);
      if (idx !== -1) {
        simulatedDb.client_interactions.splice(idx, 1);
        notifyClients('interactions', {}, userId);
        logActivity(userId, 'Eliminó Nota CRM', id);
        return res.json({ success: true });
      }
      return res.status(404).json({ error: 'Interaction not found' });
    }

    await dbQuery('DELETE FROM client_interactions WHERE id = $1 AND owner_id = $2', [id, userId]);
    notifyClients('interactions', {}, userId);
    logActivity(userId, 'Eliminó Nota CRM', id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function listPlantedAreas(req: Request, res: Response) {
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
}

export async function createPlantedArea(req: Request, res: Response) {
  try {
    const userId = await getUserId(req);
    const { clientId } = req.params;
    const { cropType, campaign, area_ha } = req.body;
    const id = crypto.randomUUID();
    const areaData = { id, clientId, cropType, campaign, area_ha: Number(area_ha), ownerId: userId };
    
    if (isDbSimulated()) {
      simulatedDb.planted_areas.push(areaData);
      notifyClients('planted-areas', {}, userId);
      logActivity(userId, 'Agregó Hectáreas', `${cropType} (${area_ha} ha)`);
      return res.status(201).json(areaData);
    }

    await dbQuery(
      'INSERT INTO planted_areas (id, client_id, crop_type, campaign, area_ha, owner_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, clientId, cropType, campaign, Number(area_ha), userId]
    );
    notifyClients('planted-areas', {}, userId);
    logActivity(userId, 'Agregó Hectáreas', `${cropType} (${area_ha} ha)`);
    res.status(201).json(areaData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function deletePlantedArea(req: Request, res: Response) {
  try {
    const userId = await getUserId(req);
    const { areaId } = req.params;
    if (isDbSimulated()) {
      const idx = simulatedDb.planted_areas.findIndex(a => a.id === areaId && a.ownerId === userId);
      if (idx !== -1) {
        simulatedDb.planted_areas.splice(idx, 1);
        notifyClients('planted-areas', {}, userId);
        logActivity(userId, 'Eliminó Hectáreas', areaId);
        return res.json({ success: true });
      }
      return res.status(404).json({ error: 'Planted area not found' });
    }

    await dbQuery('DELETE FROM planted_areas WHERE id = $1 AND owner_id = $2', [areaId, userId]);
    notifyClients('planted-areas', {}, userId);
    logActivity(userId, 'Eliminó Hectáreas', areaId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
