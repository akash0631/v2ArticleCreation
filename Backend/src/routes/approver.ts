import { Router } from 'express';
import { ApproverController } from '../controllers/ApproverController';
import { authenticate, requireApprover, requireApprovalRights } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();
const h = asyncHandler; // shorthand — wraps every handler so unhandled errors become 500s

// Apply middleware to all routes
router.use(authenticate);
router.use(requireApprover);

// Get attributes for dropdowns
router.get('/attributes', h(ApproverController.getAttributes));

// Get items for dashboard
router.get('/items', h(ApproverController.getItems));

// Export ALL items matching current filters (capped at 10k rows)
router.get('/items/export-all', h(ApproverController.exportAll));

// Get / Update / Delete a specific item
// router.all used because Express 5 DELETE registration has a matching quirk in this setup
router.all('/items/:id', h(async (req, res, next) => {
  if (req.method === 'GET')    return ApproverController.getById(req, res);
  if (req.method === 'PUT')    return ApproverController.updateItem(req, res);
  if (req.method === 'DELETE') return ApproverController.deleteItem(req, res);
  next();
  return;
}));

// Approve selected items — requires ADMIN, CATEGORY_HEAD or SUB_DIVISION_HEAD
router.post('/approve', requireApprovalRights, h(ApproverController.approveItems));

// Reject selected items — requires ADMIN, CATEGORY_HEAD or SUB_DIVISION_HEAD
router.post('/reject', requireApprovalRights, h(ApproverController.rejectItems));

// Refresh image URL (fixes expired signed URLs)
router.get('/image/:id', h(ApproverController.getImageUrl));

// Variant routes
router.get('/items/:id/variants', h(ApproverController.getVariants));
router.post('/items/:id/add-color', h(ApproverController.addColor));
router.post('/items/:id/duplicate', h(ApproverController.duplicateItem));
router.post('/items/:id/sync-color', h(ApproverController.syncColorToVariants));
router.post('/items/:id/retry-variants', h(ApproverController.retryVariants));

// Vendor name search — returns up to 15 matching vendors from master_vendor_details
router.get('/vendor-search', h(ApproverController.vendorSearch));

// Sizes for a given major category (from ACTIVE SIZE.xlsx)
router.get('/sizes-for-majcat/:majCat', h(ApproverController.getSizesForMajCat));

// BOM grid Art # lookup — returns { attrName: { mvgrValue: sapCd } } for a major category
router.get('/bom-art-numbers/:majCat', h(ApproverController.getBomArtNumbers));

// Admin: backfill article descriptions for a date range
// POST /api/approver/backfill-descriptions?fromDate=2026-04-10&toDate=2026-04-16
router.post('/backfill-descriptions', h(ApproverController.backfillDescriptions));

export default router;
