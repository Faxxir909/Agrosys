import crypto from 'crypto';
import { dbQuery, isDbSimulated, simulatedDb } from '../../server_db.ts';
import { notifyClients } from './realtime.ts';

export async function logActivity(userId: string, action: string, details?: string) {
  const id = crypto.randomUUID();
  const createdAt = new Date();
  if (isDbSimulated()) {
    simulatedDb.audit_logs.push({ id, userId, action, details, createdAt });
    notifyClients('audit-logs', {}, userId);
    return;
  }
  try {
    await dbQuery(
      'INSERT INTO audit_logs (id, user_id, action, details, created_at) VALUES ($1, $2, $3, $4, $5)',
      [id, userId, action, details || null, createdAt]
    );
    notifyClients('audit-logs', {}, userId);
  } catch (err) {
    console.error('[AUDIT ERROR] Failed to log activity:', err);
  }
}
