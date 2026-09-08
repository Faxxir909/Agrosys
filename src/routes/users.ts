import { Router } from 'express';
import * as users from '../controllers/users.controller.ts';

const router = Router();

router.get('/me', users.me);
router.patch('/me', users.updateMe);

export default router;
