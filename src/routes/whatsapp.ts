import { Router } from 'express';
import { verifyMetaWebhookSignature } from '../middlewares/auth.ts';
import * as whatsapp from '../controllers/whatsapp.controller.ts';

const router = Router();

router.get('/webhooks/whatsapp', whatsapp.verifyWebhook);
router.post('/webhooks/whatsapp', verifyMetaWebhookSignature, whatsapp.receiveWebhook);

router.get('/whatsapp/status', whatsapp.status);
router.post('/whatsapp/start', whatsapp.start);
router.post('/whatsapp/reset', whatsapp.reset);
router.get('/whatsapp/settings', whatsapp.getSettings);
router.post('/whatsapp/settings', whatsapp.updateSettings);
router.post('/whatsapp/notify-match', whatsapp.notifyMatch);
router.post('/whatsapp/send-message', whatsapp.sendMessage);

router.get('/whatsapp-templates', whatsapp.listTemplates);
router.post('/whatsapp-templates', whatsapp.createTemplate);
router.delete('/whatsapp-templates/:id', whatsapp.deleteTemplate);

router.get('/whatsapp-alerts', whatsapp.listAlerts);
router.post('/whatsapp-alerts', whatsapp.createAlert);
router.patch('/whatsapp-alerts/:id', whatsapp.updateAlert);
router.delete('/whatsapp-alerts/:id', whatsapp.deleteAlert);

export default router;
