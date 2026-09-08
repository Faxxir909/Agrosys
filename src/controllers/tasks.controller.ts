import type { Request, Response } from 'express';
import crypto from 'crypto';
import { dbQuery, isDbSimulated, simulatedDb } from '../../server_db.ts';
import { getUserId } from '../services/jwt.ts';
import { notifyClients } from '../services/realtime.ts';
import { logActivity } from '../services/activity.ts';

export async function list(req: Request, res: Response) {
  try {
    const userId = await getUserId(req);
    if (isDbSimulated()) {
      const data = simulatedDb.tasks.filter(t => t.ownerId === userId);
      return res.json(data);
    }
    const result = await dbQuery(
      `SELECT id, task_title as "taskTitle", client_id as "clientId", client_name as "clientName",
              due_date as "dueDate", crop_type as "cropType", category, status, owner_id as "ownerId", created_at as "createdAt"
       FROM tasks WHERE owner_id = $1`, [userId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function create(req: Request, res: Response) {
  try {
    const userId = await getUserId(req);
    const { taskTitle, clientId, clientName, dueDate, cropType, category } = req.body;
    const id = crypto.randomUUID();
    const createdAt = new Date();
    const taskData = {
      id, taskTitle, clientId, clientName, dueDate, cropType, category,
      status: 'pendiente',
      ownerId: userId,
      createdAt
    };

    if (isDbSimulated()) {
      simulatedDb.tasks.push(taskData);
      notifyClients('tasks', {}, userId);
      logActivity(userId, 'Creó Tarea', taskTitle);
      return res.status(201).json(taskData);
    }

    await dbQuery(
      `INSERT INTO tasks (id, task_title, client_id, client_name, due_date, crop_type, category, status, owner_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, taskTitle, clientId, clientName, dueDate, cropType, category, 'pendiente', userId, createdAt]
    );
    notifyClients('tasks', {}, userId);
    logActivity(userId, 'Creó Tarea', taskTitle);
    res.status(201).json(taskData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function update(req: Request, res: Response) {
  try {
    const userId = await getUserId(req);
    const { id } = req.params;
    const { status } = req.body;

    if (isDbSimulated()) {
      const task = simulatedDb.tasks.find(t => t.id === id && t.ownerId === userId);
      if (task) {
        if (status !== undefined) task.status = status;
        notifyClients('tasks', {}, userId);
        logActivity(userId, 'Actualizó Tarea', `${task.taskTitle} -> ${status}`);
        return res.json(task);
      }
      return res.status(404).json({ error: 'Task not found' });
    }

    await dbQuery(
      'UPDATE tasks SET status = COALESCE($1, status) WHERE id = $2 AND owner_id = $3',
      [status, id, userId]
    );

    const result = await dbQuery(
      `SELECT id, task_title as "taskTitle", client_id as "clientId", client_name as "clientName",
              due_date as "dueDate", crop_type as "cropType", category, status, owner_id as "ownerId", created_at as "createdAt"
       FROM tasks WHERE id = $1`, [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    notifyClients('tasks', {}, userId);
    logActivity(userId, 'Actualizó Tarea', `${result.rows[0].taskTitle} -> ${status}`);
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
      const idx = simulatedDb.tasks.findIndex(t => t.id === id && t.ownerId === userId);
      if (idx !== -1) {
        const deletedTask = simulatedDb.tasks.splice(idx, 1)[0];
        notifyClients('tasks', {}, userId);
        logActivity(userId, 'Eliminó Tarea', deletedTask.taskTitle);
        return res.json({ success: true });
      }
      return res.status(404).json({ error: 'Task not found' });
    }

    const getTask = await dbQuery('SELECT task_title as "taskTitle" FROM tasks WHERE id = $1 AND owner_id = $2', [id, userId]);
    const taskTitle = getTask.rows[0]?.taskTitle || id;

    await dbQuery('DELETE FROM tasks WHERE id = $1 AND owner_id = $2', [id, userId]);
    notifyClients('tasks', {}, userId);
    logActivity(userId, 'Eliminó Tarea', taskTitle);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
