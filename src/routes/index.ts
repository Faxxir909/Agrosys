import { Router } from 'express';
import { getWhatsAppStatus } from '../../whatsapp_connector.ts';
import * as auth from '../controllers/auth.controller.ts';
import authRoutes from './auth.ts';
import usersRoutes from './users.ts';
import clientsRoutes from './clients.ts';
import opportunitiesRoutes from './opportunities.ts';
import dealsRoutes from './deals.ts';
import tasksRoutes from './tasks.ts';
import whatsappRoutes from './whatsapp.ts';
import aiRoutes from './ai.ts';

const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    db: 'postgres',
    gemini: process.env.GEMINI_API_KEY ? 'configured' : 'missing',
    whatsapp: getWhatsAppStatus().status
  });
});

apiRouter.get('/audit-logs', auth.listAuditLogs);

apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', usersRoutes);
apiRouter.use('/clients', clientsRoutes);
apiRouter.use('/opportunities', opportunitiesRoutes);
apiRouter.use('/deals', dealsRoutes);
apiRouter.use('/tasks', tasksRoutes);
apiRouter.use(whatsappRoutes);
apiRouter.use(aiRoutes);

export default apiRouter;
