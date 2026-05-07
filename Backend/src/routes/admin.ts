/**
 * Admin Routes - Complete Hierarchy Management
 */

import { Router, Request, Response, NextFunction } from 'express';
import * as adminController from '../controllers/adminController';
import { hierarchyService } from '../services/hierarchyService';

const router = Router();

// Invalidate hierarchy cache after any mutating call on hierarchy endpoints
const invalidateHierarchyCache = (_req: Request, res: Response, next: NextFunction) => {
  const orig = res.json.bind(res);
  res.json = (body: any) => {
    if (res.statusCode < 400) hierarchyService.invalidate();
    return orig(body);
  };
  next();
};
const mut = invalidateHierarchyCache;

// ═══════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════
router.get('/stats', adminController.getDashboardStats);

// ═══════════════════════════════════════════════════════
// ANALYTICS (EXPENSES & IMAGE USAGE)
// ═══════════════════════════════════════════════════════
router.get('/analytics/expenses', adminController.getExpenseAnalytics);
router.get('/analytics/expenses/detailed', adminController.getDetailedExpenses);
router.get('/analytics/image-usage', adminController.getImageUsageAnalytics);

// ═══════════════════════════════════════════════════════
// DEPARTMENTS
// ═══════════════════════════════════════════════════════
router.get('/departments', adminController.getAllDepartments);
router.get('/departments/:id', adminController.getDepartmentById);
router.post('/departments', mut, adminController.createDepartment);
router.put('/departments/:id', mut, adminController.updateDepartment);
router.delete('/departments/:id', mut, adminController.deleteDepartment);

// ═══════════════════════════════════════════════════════
// SUB-DEPARTMENTS
// ═══════════════════════════════════════════════════════
router.get('/sub-departments', adminController.getAllSubDepartments);
router.get('/sub-departments/:id', adminController.getSubDepartmentById);
router.post('/sub-departments', mut, adminController.createSubDepartment);
router.put('/sub-departments/:id', mut, adminController.updateSubDepartment);
router.delete('/sub-departments/:id', mut, adminController.deleteSubDepartment);

// ═══════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════
router.get('/categories', adminController.getAllCategories);
router.get('/categories/:id', adminController.getCategoryById);
router.get('/categories/:id/all-attributes', adminController.getCategoryWithAllAttributes); // Get with ALL 44 master attributes
router.get('/categories/:code/attributes', adminController.getCategoryByCode); // Get by code with attributes
router.post('/categories', mut, adminController.createCategory);
router.put('/categories/:id', mut, adminController.updateCategory);
router.delete('/categories/:id', mut, adminController.deleteCategory);
router.put('/categories/:id/attributes', mut, adminController.updateCategoryAttributes);
router.put('/categories/:categoryId/attributes/:attributeId', mut, adminController.updateCategoryAttributeMapping);
router.post('/categories/:categoryId/attributes', mut, adminController.addAttributeToCategory);
router.delete('/categories/:categoryId/attributes/:attributeId', mut, adminController.removeAttributeFromCategory);

// ═══════════════════════════════════════════════════════
// MASTER ATTRIBUTES
// ═══════════════════════════════════════════════════════
router.get('/attributes', adminController.getAllMasterAttributes);
router.get('/attributes/:id', adminController.getMasterAttributeById);
router.post('/attributes', mut, adminController.createMasterAttribute);
router.put('/attributes/:id', mut, adminController.updateMasterAttribute);
router.delete('/attributes/:id', mut, adminController.deleteMasterAttribute);
router.post('/attributes/:id/values', mut, adminController.addAllowedValue);
router.delete('/attributes/:id/values/:valueId', mut, adminController.deleteAllowedValue);

// ═══════════════════════════════════════════════════════
// HIERARCHY
// ═══════════════════════════════════════════════════════
router.get('/hierarchy/tree', adminController.getHierarchyTree);
router.get('/hierarchy/export', adminController.exportHierarchy);

// ═══════════════════════════════════════════════════════
// USERS (ADMIN ONLY)
// ═══════════════════════════════════════════════════════
router.get('/users', adminController.getAllUsers);
router.post('/users', adminController.createUser);
router.put('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deactivateUser);

// ═══════════════════════════════════════════════════════
// EXTRACTIONS (ADMIN ONLY)
// ═══════════════════════════════════════════════════════
router.get('/extractions', adminController.getAllExtractions);

// ═══════════════════════════════════════════════════════
// SRM SYNC (ADMIN)
// ═══════════════════════════════════════════════════════
router.get('/srm/status', adminController.getSrmSyncStatus);
router.post('/srm/sync', adminController.triggerSrmSync);
router.post('/srm/enrich', adminController.triggerSrmEnrichment);

export default router;
