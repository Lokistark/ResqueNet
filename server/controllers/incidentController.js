const Incident = require('../models/Incident');

/**
 * @route   POST /api/incidents
 * @desc    Submit a new emergency report
 * @access  Private (Authenticated Users)
 */
exports.createIncident = async (req, res) => {
    try {
        // We attach the authenticated user's name to the report for accountability and tracking
        const newIncident = await Incident.create({
            ...req.body,
            reporter: req.user.name
        });

        // EMIT REAL-TIME EVENT
        const io = req.app.get('socketio');
        if (io) {
            io.emit('new_incident', newIncident.toObject());
            console.log('📡 SOCKET: Broadcast -> new_incident');
        }

        res.status(201).json({
            status: 'success',
            data: { incident: newIncident }
        });
    } catch (err) {
        res.status(400).json({ status: 'fail', message: err.message });
    }
};

/**
 * @route   GET /api/incidents
 * @desc    Fetch all reports across the system for administrator monitoring
 * @access  Private (Admin Role Only)
 */
exports.getAllIncidents = async (req, res) => {
    try {
        // Retrieve all systemic incidents sorted by the most recent first
        const incidents = await Incident.find().sort('-createdAt');
        res.status(200).json({
            status: 'success',
            results: incidents.length,
            data: { incidents }
        });
    } catch (err) {
        res.status(400).json({ status: 'fail', message: err.message });
    }
};

exports.getMyIncidents = async (req, res) => {
    try {
        const incidents = await Incident.find({ reporter: req.user.name }).sort('-createdAt');
        res.status(200).json({
            status: 'success',
            results: incidents.length,
            data: { incidents }
        });
    } catch (err) {
        res.status(400).json({ status: 'fail', message: err.message });
    }
};

exports.updateIncidentStatus = async (req, res) => {
    try {
        const { status } = req.body;

        // Ensure the status is one of the allowed enum values
        if (!['Pending', 'In Progress', 'Resolved'].includes(status)) {
            return res.status(400).json({ status: 'fail', message: 'Invalid status type' });
        }

        const incident = await Incident.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true, runValidators: true }
        );

        if (!incident) {
            return res.status(404).json({ status: 'fail', message: 'Incident not found' });
        }

        // EMIT REAL-TIME EVENT
        const io = req.app.get('socketio');
        if (io) {
            io.emit('incident_updated', incident);
            console.log('📡 SOCKET: Broadcast -> incident_updated', incident._id);
        }

        res.status(200).json({ status: 'success', data: { incident } });
    } catch (err) {
        res.status(400).json({ status: 'fail', message: err.message });
    }
};

exports.deleteIncident = async (req, res) => {
    try {
        const incident = await Incident.findById(req.params.id);

        if (!incident) {
            return res.status(404).json({ status: 'fail', message: 'Incident not found' });
        }

        // Only Admin or the Original Reporter can delete
        if (req.user.role !== 'admin' && incident.reporter !== req.user.name) {
            return res.status(403).json({ status: 'fail', message: 'Not authorized to delete this report' });
        }

        await Incident.findByIdAndDelete(req.params.id);

        // EMIT REAL-TIME EVENT
        const io = req.app.get('socketio');
        if (io) {
            io.emit('incident_deleted', req.params.id);
            console.log('📡 SOCKET: Broadcast -> incident_deleted', req.params.id);
        }

        res.status(204).json({ status: 'success', data: null });
    } catch (err) {
        res.status(400).json({ status: 'fail', message: err.message });
    }
};

exports.createPublicSOS = async (req, res) => {
    try {
        const newIncident = await Incident.create({
            title: "UNAUTHENTICATED SOS",
            type: "Other",
            location: req.body.location,
            description: "CRITICAL: Urgent help requested by an unauthenticated user (Public Login SOS).",
            reporter: "Anonymous/Unknown"
        });

        // EMIT REAL-TIME EVENT
        const io = req.app.get('socketio');
        if (io) {
            io.emit('new_incident', newIncident);
            console.log('📡 SOCKET: Broadcast -> new_incident (Public SOS)');
        }

        res.status(201).json({
            status: 'success',
            data: { incident: newIncident }
        });
    } catch (err) {
        res.status(400).json({ status: 'fail', message: err.message });
    }
};
