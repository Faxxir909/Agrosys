import { Router } from 'express';
import * as deals from '../controllers/deals.controller.ts';

const router = Router();

router.get('/', deals.list);
router.post('/', deals.create);
router.patch('/:id', deals.update);

export default router;
