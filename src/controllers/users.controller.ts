import type { Request, Response } from 'express';
import { dbQuery, isDbSimulated, simulatedDb } from '../../server_db.ts';
import { getUserId } from '../services/jwt.ts';

export async function me(req: Request, res: Response) {
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
}

export async function updateMe(req: Request, res: Response) {
  try {
    const userId = await getUserId(req);
    const { name } = req.body;
    if (isDbSimulated()) {
      const user = simulatedDb.users.find(u => u.id === userId);
      if (user) {
        if (name !== undefined) user.name = name;
        return res.json(user);
      }
      return res.status(404).json({ error: 'User not found' });
    }
    
    await dbQuery('UPDATE users SET name = COALESCE($1, name) WHERE id = $2', [name, userId]);
    const result = await dbQuery('SELECT id, email, role, name, created_at as "createdAt" FROM users WHERE id = $1', [userId]);
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
