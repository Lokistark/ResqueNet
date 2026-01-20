const mongoose = require('mongoose');

/**
 * INCIDENT SCHEMA
 * Defines the structure for disaster reports.
 * Includes automatic validation and strict data typing.
 */
const incidentSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    type: {
        type: String,
        required: true,
        enum: ['Fire', 'Medical', 'Flood', 'Accident', 'Other'], // Strict categorization for emergency response
        description: "The nature of the emergency"
    },
    location: {
        type: String,
        required: true,
        description: "GPS coordinates (lat/long) or physical address fetched from client"
    },
    description: {
        type: String,
        required: true
    },
    reporter: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['Pending', 'Resolved', 'In Progress'],
        default: 'Pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Incident', incidentSchema);
