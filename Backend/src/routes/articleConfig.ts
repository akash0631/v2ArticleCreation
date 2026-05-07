import { Router } from 'express';
import { getFieldConfigs, getAttributeValues, getCategoryAttributeConfig } from '../controllers/articleConfigController';

const router = Router();

router.get('/fields', getFieldConfigs);
router.get('/values', getAttributeValues);
router.get('/category-attributes/:code', getCategoryAttributeConfig);

export default router;
