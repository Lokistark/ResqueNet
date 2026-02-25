import { useState } from 'react';
import { reportIncident } from '../services/api';
import { saveReportLocally } from '../services/db';
import { MapPin, AlertTriangle, FileText, User } from 'lucide-react';
import DOMPurify from 'dompurify';

const IncidentForm = ({ onSuccess, isOnline, user, setIncidents }) => {
    // --- STATE MANAGEMENT ---
    const [formData, setFormData] = useState({
        title: '',
        type: 'Fire',
        location: '',
        description: ''
    });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    /**
     * Submission Logic
     * Handles both Online (Direct API) and Offline (Local IndexedDB) modes.
     * Implements background sync registration for reliability.
     */
    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        const sanitizedData = {
            title: DOMPurify.sanitize(formData.title),
            type: formData.type,
            location: DOMPurify.sanitize(formData.location),
            description: DOMPurify.sanitize(formData.description)
        };

        const tempId = 'temp-' + Date.now();
        const optimisticReport = {
            ...sanitizedData,
            _id: tempId,
            status: 'Syncing...',
            reporter: user.name,
            createdAt: new Date().toISOString(),
            isOptimistic: true
        };

        // INSTANT UI FEEDBACK
        setIncidents(prev => [optimisticReport, ...prev]);
        onSuccess(); // Close form immediately for "Much Fast" feel

        if (isOnline) {
            try {
                await reportIncident(sanitizedData);
                // The socket message 'new_incident' will handle replacing the optimistic one
            } catch (err) {
                // If it really fails (not just offline), roll back or mark as local
                console.error("REPORT FAIL:", err);
                await saveReportLocally({ ...sanitizedData, createdAt: new Date().toISOString() });
                registerSync();
            }
        } else {
            await saveReportLocally({ ...sanitizedData, createdAt: new Date().toISOString() });
            registerSync();
        }
        setLoading(false);
    };

    /**
     * Registers a Background Sync event with the Service Worker.
     * Ensures reports are sent even if the user closes the tab.
     */
    const registerSync = () => {
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
            navigator.serviceWorker.ready.then(registration => {
                return registration.sync.register('sync-reports');
            }).catch(err => console.log('SYNC REG FAILURE', err));
        }
    };

    /**
     * GPS Acquisition Utility
     */
    const getLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((position) => {
                setFormData({
                    ...formData,
                    location: `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`
                });
            }, (err) => {
                alert("GPS ACQUISITION FAILED. Please specify location manually.");
            });
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-8 animate-fade-in">
            <div className="border-b-[6px] border-emergency-red pb-4 mb-2">
                <h2 className="text-2xl sm:text-3xl font-black text-gray-900 uppercase tracking-tight">Report Incident</h2>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mt-1 italic">Join Response Network</p>
            </div>

            <div className="space-y-6">
                <div className="group">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                        <AlertTriangle size={14} className="text-emergency-red" /> Incident Title
                    </label>
                    <input
                        type="text"
                        required
                        className="w-full p-4 bg-gray-50 border-2 border-transparent rounded-[1.5rem] focus:bg-white focus:border-emergency-red outline-none transition-all font-bold text-gray-800 placeholder-gray-300 shadow-inner"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder="Nature of Emergency..."
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 block">Emergency Type</label>
                        <select
                            className="w-full p-4 bg-gray-50 border-2 border-transparent rounded-[1.5rem] focus:bg-white focus:border-emergency-red outline-none font-bold text-gray-800 shadow-inner appearance-none cursor-pointer"
                            value={formData.type}
                            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                        >
                            <option value="Fire">Fire</option>
                            <option value="Medical">Medical</option>
                            <option value="Flood">Flood</option>
                            <option value="Accident">Accident</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                            <MapPin size={14} className="text-emergency-red" /> Location
                        </label>
                        <div className="flex gap-2 items-center">
                            <input
                                type="text"
                                required
                                className="flex-1 min-w-0 p-4 bg-gray-50 border-2 border-transparent rounded-[1.5rem] focus:bg-white focus:border-emergency-red outline-none font-bold text-gray-800 placeholder-gray-300 shadow-inner text-sm sm:text-base"
                                value={formData.location}
                                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                placeholder="Detecting or Manually Enter..."
                            />
                            <button
                                type="button"
                                onClick={getLocation}
                                className="shrink-0 px-4 py-4 bg-emergency-red text-white rounded-[1.25rem] hover:bg-emergency-dark active:scale-95 transition-all font-black text-[10px] sm:text-xs uppercase tracking-widest shadow-lg flex items-center justify-center min-w-[60px]"
                                title="Use GPS"
                            >
                                GPS
                            </button>
                        </div>
                    </div>
                </div>

                <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                        <FileText size={14} className="text-emergency-red" /> Description
                    </label>
                    <textarea
                        required
                        rows="5"
                        className="w-full p-6 bg-gray-50 border-2 border-transparent rounded-[2rem] focus:bg-white focus:border-emergency-red outline-none transition-all font-bold text-gray-800 placeholder-gray-300 shadow-inner resize-none"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Describe the emergency in detail..."
                    ></textarea>
                </div>
            </div>

            {message && (
                <div className={`p-5 rounded-2xl font-black text-[10px] tracking-[0.2em] text-center uppercase animate-fade-in-up border-2 ${message.includes('Error') || message.includes('OFFLINE') || message.includes('TIMEOUT') ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-green-50 text-green-600 border-green-100'}`}>
                    {message}
                </div>
            )}

            <button
                type="submit"
                disabled={loading}
                className="w-full bg-emergency-red text-white p-6 rounded-[2rem] font-black text-sm shadow-2xl hover:bg-emergency-dark transform hover:-translate-y-1 active:scale-95 transition-all disabled:opacity-50 uppercase tracking-[0.3em] border-b-[8px] border-emergency-dark"
            >
                {loading ? 'Submitting...' : 'Submit Emergency Report'}
            </button>
        </form>
    );
};

export default IncidentForm;
