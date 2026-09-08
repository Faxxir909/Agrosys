import { Router } from 'express';
import * as tasks from '../controllers/tasks.controller.ts';

const router = Router();

router.get('/', tasks.list);
router.post('/', tasks.create);
router.patch('/:id', tasks.update);
router.delete('/:id', tasks.remove);

export default router;
