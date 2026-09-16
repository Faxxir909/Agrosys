import { Router } from 'express';
import * as marketController from '../controllers/market.controller.ts';

const router = Router();

// Cotizaciones oficiales actuales de Rosario
router.get('/rosario', marketController.getCurrentRosarioPrices);

// Histórico de cotizaciones de Rosario con filtros
router.get('/rosario/history', marketController.getRosarioHistory);

// Disparador manual de sincronización BCR GIX
router.post('/rosario/sync', marketController.syncRosarioPrices);

// Estado de integración con la API oficial BCR GIX
router.get('/rosario/status', marketController.getIntegrationStatus);

// Comparador de oportunidades comerciales vs Pizarra Rosario
router.get('/compare', marketController.compareOpportunity);

export default router;
