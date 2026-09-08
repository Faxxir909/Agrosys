import { Router } from 'express';
import * as opportunities from '../controllers/opportunities.controller.ts';

const router = Router();

router.get('/', opportunities.list);
router.get('/matches', opportunities.matches);
router.post('/', opportunities.create);
router.patch('/:id', opportunities.update);
router.delete('/:id', opportunities.remove);

export default router;
