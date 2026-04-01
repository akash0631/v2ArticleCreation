import { Router } from 'express';
import { ApproverController } from '../controllers/ApproverController';
import { authenticate, requireApprover } from '../middleware/auth';

const router = Router();

// Apply middleware to all routes
router.use(authenticate);
router.use(requireApprover);

// Get attributes for dropdowns
router.get('/attributes', ApproverController.getAttributes);

// Get items for dashboard
router.get('/items', ApproverController.getItems);

// Update specific item (edit extracted data)
router.put('/items/:id', ApproverController.updateItem);

// Approve selected items
router.post('/approve', ApproverController.approveItems);

// Reject selected items
router.post('/reject', ApproverController.rejectItems);

// Refresh image URL (fixes expired signed URLs)
router.get('/image/:id', ApproverController.getImageUrl);

export default router;
