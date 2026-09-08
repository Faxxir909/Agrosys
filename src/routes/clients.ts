import { Router } from 'express';
import * as clients from '../controllers/clients.controller.ts';

const router = Router();

router.get('/', clients.list);
router.post('/', clients.create);
router.patch('/:id', clients.update);
router.delete('/:id', clients.remove);
router.get('/:clientId/interactions', clients.listInteractions);
router.post('/:clientId/interactions', clients.createInteraction);
router.delete('/:clientId/interactions/:id', clients.deleteInteraction);
router.get('/:clientId/planted-areas', clients.listPlantedAreas);
router.post('/:clientId/planted-areas', clients.createPlantedArea);
router.delete('/:clientId/planted-areas/:areaId', clients.deletePlantedArea);

export default router;
