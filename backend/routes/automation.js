const express = require('express');

const router = express.Router();
const { authenticate } = require('../middleware/auth');
const automationController = require('../controllers/automationController');

router.get('/events', authenticate, automationController.listEvents);
router.post('/events', authenticate, automationController.createEvent);
router.get('/events/:eventId', authenticate, automationController.getEvent);
router.put('/events/:eventId', authenticate, automationController.updateEvent);
router.delete('/events/:eventId', authenticate, automationController.deleteEvent);
router.post('/events/:eventId/run', authenticate, automationController.runEventNow);
router.get('/events/:eventId/runs', authenticate, automationController.listEventRuns);
router.get('/events/:eventId/sheet-logs', authenticate, automationController.getEventSheetLogs);
router.get('/sheet-logs', authenticate, automationController.getAccountSheetLogs);
router.get('/runs/:runId/logs', authenticate, automationController.getRunLogs);

module.exports = router;
