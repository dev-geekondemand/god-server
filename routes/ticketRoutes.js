const express = require('express');
const { authenticateJWT, protectAdmin } = require('../middlewares/authMiddleware.js');
const { azureUploader, uploadLimiter } = require('../middlewares/azureUploads.js');
const ticketCtrl = require('../controllers/ticketController.js');

const router = express.Router();

const ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'application/pdf', 'video/mp4'];
const attachmentUploader = azureUploader(ATTACHMENT_TYPES, [{ name: 'attachments', maxCount: 5 }]);

// ---- Seeker or Geek (whichever the JWT/cookie belongs to — resolved server-side) ----
router.post('/', authenticateJWT, uploadLimiter, attachmentUploader, ticketCtrl.createTicket);
router.get('/mine', authenticateJWT, ticketCtrl.getMyTickets);
router.get('/mine/:id', authenticateJWT, ticketCtrl.getMyTicketById);
router.post('/mine/:id/reply', authenticateJWT, uploadLimiter, attachmentUploader, ticketCtrl.replyToTicketAsUser);

// ---- Admin ----
router.get('/admin/stats', protectAdmin, ticketCtrl.getTicketStats);
router.get('/admin/assignable-admins', protectAdmin, ticketCtrl.listAssignableAdmins);
router.get('/admin', protectAdmin, ticketCtrl.getTicketQueue);
router.get('/admin/:id', protectAdmin, ticketCtrl.getTicketByIdAdmin);
router.patch('/admin/:id/assign', protectAdmin, ticketCtrl.assignTicket);
router.patch('/admin/:id/priority', protectAdmin, ticketCtrl.changeTicketPriority);
router.patch('/admin/:id/status', protectAdmin, ticketCtrl.changeTicketStatus);
router.post('/admin/:id/notes', protectAdmin, ticketCtrl.addInternalNote);
router.post('/admin/:id/reply', protectAdmin, uploadLimiter, attachmentUploader, ticketCtrl.replyToTicketAdmin);

module.exports = router;
