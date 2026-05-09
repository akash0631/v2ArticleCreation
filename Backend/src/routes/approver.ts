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

// Update specific item (edit extracted data)
router.put('/items/:id', h(ApproverController.updateItem));

// Approve selected items — requires ADMIN, CATEGORY_HEAD or SUB_DIVISION_HEAD
router.post('/approve', requireApprovalRights, h(ApproverController.approveItems));

// Reject selected items — requires ADMIN, CATEGORY_HEAD or SUB_DIVISION_HEAD
router.post('/reject', requireApprovalRights, h(ApproverController.rejectItems));

// Refresh image URL (fixes expired signed URLs)
router.get('/image/:id', h(ApproverController.getImageUrl));

// Variant routes
router.get('/items/:id/variants', h(ApproverController.getVariants));
router.post('/items/:id/add-color', h(ApproverController.addColor));
router.post('/items/:id/sync-color', h(ApproverController.syncColorToVariants));

// BOM grid Art # lookup — returns { attrName: { mvgrValue: sapCd } } for a major category
router.get('/bom-art-numbers/:majCat', h(ApproverController.getBomArtNumbers));

// Admin: backfill article descriptions for a date range
// POST /api/approver/backfill-descriptions?fromDate=2026-04-10&toDate=2026-04-16
router.post('/backfill-descriptions', h(ApproverController.backfillDescriptions));

export default router;
