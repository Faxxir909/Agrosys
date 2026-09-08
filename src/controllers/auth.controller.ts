import type { Request, Response } from 'express';
import crypto from 'crypto';
import { dbQuery, isDbSimulated, simulatedDb } from '../../server_db.ts';
import { getUserId, signUserToken } from '../services/jwt.ts';
import { hashPassword, verifyPassword } from '../services/passwords.ts';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function register(req: Request, res: Response) {
  try {
    const { email, name, password } = req.body;
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
    const cleanRole = 'broker';
    const passwordHash = hashPassword(password);
    const id = crypto.randomUUID();

    if (isDbSimulated()) {
      const exists = simulatedDb.users.some(u => u.email.toLowerCase() === emailLower);
      if (exists) {
        return res.status(400).json({ error: 'El email ya se encuentra registrado' });
      }
      const user = { id, email: emailLower, name: cleanName, role: cleanRole, passwordHash, createdAt: new Date() };
      simulatedDb.users.push(user);
      const token = signUserToken(id, emailLower);
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

    const token = signUserToken(id, emailLower);
    res.status(201).json({ token, user: { id, email: emailLower, name: cleanName, role: cleanRole } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function login(req: Request, res: Response) {
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
      const token = signUserToken(user.id, user.email);
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

    const token = signUserToken(user.id, user.email);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function listAuditLogs(req: Request, res: Response) {
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
}
