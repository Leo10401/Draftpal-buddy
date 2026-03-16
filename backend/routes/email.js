const express = require('express');
const router = express.Router();
const emailController = require('../controllers/emailController');
const { authenticate } = require('../middleware/auth');

// Send email route - protected by authenticate middleware
router.post('/send', authenticate, emailController.sendEmail);
router.post('/sheet-preview', authenticate, emailController.previewSheetSend);
router.post('/sheet-send', authenticate, emailController.sendSheetBulk);

module.exports = router;