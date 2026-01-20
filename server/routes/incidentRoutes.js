const express = require('express');
const { createIncident, getAllIncidents, getMyIncidents, updateIncidentStatus, deleteIncident, createPublicSOS } = require('../controllers/incidentController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const router = express.Router();

// PUBLIC SOS - Anyone can report in extreme danger without logging in
router.post('/public-sos', createPublicSOS);

router.use(protect);

router.post('/', createIncident);
router.get('/', restrictTo('admin'), getAllIncidents);
router.get('/my', getMyIncidents);
router.patch('/:id/status', restrictTo('admin'), updateIncidentStatus);
router.delete('/:id', deleteIncident);

module.exports = router;
