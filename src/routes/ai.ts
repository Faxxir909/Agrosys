import { Router } from 'express';
import * as ai from '../controllers/ai.controller.ts';

const router = Router();

router.post('/parse-opportunity-text', ai.parseOpportunityText);
router.post('/parse-audio', ai.parseAudio);
router.get('/pizarra-history', ai.pizarraHistory);
router.get('/real-pizarra-prices', ai.realPizarraPrices);

export default router;
