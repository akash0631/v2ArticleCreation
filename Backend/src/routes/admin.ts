/**
 * Admin Routes - Complete Hierarchy Management
 */

import { Router, Request, Response, NextFunction } from 'express';
import * as adminController from '../controllers/adminController';
import { hierarchyService } from '../services/hierarchyService';
import { asyncHandler } from '../middleware/asyncHandler';

const h = asyncHandler;

const router = Router();

// Invalidate hierarchy cache after any mutating call on hierarchy endpoints
const invalidateHierarchyCache = (_req: Request, res: Response, next: NextFunction) => {
  const orig = res.json.bind(res);
  res.json = (body: any) => {
    if (res.statusCode < 400) {
      hierarchyService.invalidate();
      adminController.clearAllHierarchyCaches();
    }
    return orig(body);
  };
  next();
};
const mut = invalidateHierarchyCache;

// ═══════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════
router.get('/stats', h(adminController.getDashboardStats));

// ═══════════════════════════════════════════════════════
// ANALYTICS (EXPENSES & IMAGE USAGE)
// ═══════════════════════════════════════════════════════
router.get('/analytics/expenses', h(adminController.getExpenseAnalytics));
router.get('/analytics/expenses/detailed', h(adminController.getDetailedExpenses));
router.get('/analytics/image-usage', h(adminController.getImageUsageAnalytics));

// ═══════════════════════════════════════════════════════
// DEPARTMENTS
// ═══════════════════════════════════════════════════════
router.get('/departments', h(adminController.getAllDepartments));
router.get('/departments/:id', h(adminController.getDepartmentById));
router.post('/departments', mut, h(adminController.createDepartment));
router.put('/departments/:id', mut, h(adminController.updateDepartment));
router.delete('/departments/:id', mut, h(adminController.deleteDepartment));

// ═══════════════════════════════════════════════════════
// SUB-DEPARTMENTS
// ═══════════════════════════════════════════════════════
router.get('/sub-departments', h(adminController.getAllSubDepartments));
router.get('/sub-departments/:id', h(adminController.getSubDepartmentById));
router.post('/sub-departments', mut, h(adminController.createSubDepartment));
router.put('/sub-departments/:id', mut, h(adminController.updateSubDepartment));
router.delete('/sub-departments/:id', mut, h(adminController.deleteSubDepartment));

// ═══════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════
router.get('/categories', h(adminController.getAllCategories));
router.get('/categories/:id', h(adminController.getCategoryById));
router.get('/categories/:id/all-attributes', h(adminController.getCategoryWithAllAttributes));
router.get('/categories/:code/attributes', h(adminController.getCategoryByCode));
router.post('/categories', mut, h(adminController.createCategory));
router.put('/categories/:id', mut, h(adminController.updateCategory));
router.delete('/categories/:id', mut, h(adminController.deleteCategory));
router.put('/categories/:id/attributes', mut, h(adminController.updateCategoryAttributes));
router.put('/categories/:categoryId/attributes/:attributeId', mut, h(adminController.updateCategoryAttributeMapping));
router.post('/categories/:categoryId/attributes', mut, h(adminController.addAttributeToCategory));
router.delete('/categories/:categoryId/attributes/:attributeId', mut, h(adminController.removeAttributeFromCategory));

// ═══════════════════════════════════════════════════════
// MASTER ATTRIBUTES
// ═══════════════════════════════════════════════════════
router.get('/attributes', h(adminController.getAllMasterAttributes));
router.get('/attributes/:id', h(adminController.getMasterAttributeById));
router.post('/attributes', mut, h(adminController.createMasterAttribute));
router.put('/attributes/:id', mut, h(adminController.updateMasterAttribute));
router.delete('/attributes/:id', mut, h(adminController.deleteMasterAttribute));
router.post('/attributes/:id/values', mut, h(adminController.addAllowedValue));
router.delete('/attributes/:id/values/:valueId', mut, h(adminController.deleteAllowedValue));

// ═══════════════════════════════════════════════════════
// HIERARCHY
// ═══════════════════════════════════════════════════════
router.get('/hierarchy/tree', h(adminController.getHierarchyTree));
router.get('/hierarchy/tree/lightweight', h(adminController.getHierarchyTreeLightweight));
router.post('/hierarchy/tree/cache/clear', h(adminController.invalidateHierarchyCache));
router.get('/hierarchy/export', h(adminController.exportHierarchy));

// ═══════════════════════════════════════════════════════
// USERS (ADMIN ONLY)
// ═══════════════════════════════════════════════════════
router.get('/users', h(adminController.getAllUsers));
router.post('/users', h(adminController.createUser));
router.put('/users/:id', h(adminController.updateUser));
router.delete('/users/:id', h(adminController.deactivateUser));

// ═══════════════════════════════════════════════════════
// EXTRACTIONS (ADMIN ONLY)
// ═══════════════════════════════════════════════════════
router.get('/extractions', h(adminController.getAllExtractions));

// ═══════════════════════════════════════════════════════
// SRM SYNC (ADMIN)
// ═══════════════════════════════════════════════════════
router.get('/srm/status', h(adminController.getSrmSyncStatus));
router.post('/srm/sync', h(adminController.triggerSrmSync));
router.post('/srm/enrich', h(adminController.triggerSrmEnrichment));

// ═══════════════════════════════════════════════════════
// VENDOR MASTER SYNC (ADMIN)
// ═══════════════════════════════════════════════════════
router.get('/vendor-master/status', h(adminController.getVendorMasterSyncStatus));
router.post('/vendor-master/sync', h(adminController.triggerVendorMasterSync));

export default router;
