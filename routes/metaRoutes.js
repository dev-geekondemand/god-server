import express from 'express';
import { getFilterOptions } from '../controllers/metaController.js';

const router = express.Router();

router.get('/filters', getFilterOptions);

export default router;
