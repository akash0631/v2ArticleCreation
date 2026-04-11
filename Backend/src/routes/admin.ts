/**
 * Admin Routes - Complete Hierarchy Management
 */

import { Router } from 'express';
import * as adminController from '../controllers/adminController';

const router = Router();

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
router.post('/departments', adminController.createDepartment);
router.put('/departments/:id', adminController.updateDepartment);
router.delete('/departments/:id', adminController.deleteDepartment);

// ═══════════════════════════════════════════════════════
// SUB-DEPARTMENTS
// ═══════════════════════════════════════════════════════
router.get('/sub-departments', adminController.getAllSubDepartments);
router.get('/sub-departments/:id', adminController.getSubDepartmentById);
router.post('/sub-departments', adminController.createSubDepartment);
router.put('/sub-departments/:id', adminController.updateSubDepartment);
router.delete('/sub-departments/:id', adminController.deleteSubDepartment);

// ═══════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════
router.get('/categories', adminController.getAllCategories);
router.get('/categories/:id', adminController.getCategoryById);
router.get('/categories/:id/all-attributes', adminController.getCategoryWithAllAttributes); // Get with ALL 44 master attributes
router.get('/categories/:code/attributes', adminController.getCategoryByCode); // Get by code with attributes
router.post('/categories', adminController.createCategory);
router.put('/categories/:id', adminController.updateCategory);
router.delete('/categories/:id', adminController.deleteCategory);
router.put('/categories/:id/attributes', adminController.updateCategoryAttributes);
router.put('/categories/:categoryId/attributes/:attributeId', adminController.updateCategoryAttributeMapping);
router.post('/categories/:categoryId/attributes', adminController.addAttributeToCategory);
router.delete('/categories/:categoryId/attributes/:attributeId', adminController.removeAttributeFromCategory);

// ═══════════════════════════════════════════════════════
// MASTER ATTRIBUTES
// ═══════════════════════════════════════════════════════
router.get('/attributes', adminController.getAllMasterAttributes);
router.get('/attributes/:id', adminController.getMasterAttributeById);
router.post('/attributes', adminController.createMasterAttribute);
router.put('/attributes/:id', adminController.updateMasterAttribute);
router.delete('/attributes/:id', adminController.deleteMasterAttribute);
router.post('/attributes/:id/values', adminController.addAllowedValue);
router.delete('/attributes/:id/values/:valueId', adminController.deleteAllowedValue);

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
// BACKFILLS (ADMIN ONLY)
// ═══════════════════════════════════════════════════════
router.post('/backfill-watcher-subdivisions', adminController.backfillWatcherSubDivisions);

export default router;
