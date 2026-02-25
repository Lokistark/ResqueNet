import { useState, useEffect } from 'react';
import { Shield, LogOut, PlusCircle, List, AlertCircle, CheckCircle, Clock, Trash2, X, Users, UserPlus } from 'lucide-react';
import { logout, getIncidents, getMyIncidents, updateIncidentStatus, reportIncident, deleteIncident, getUserCount, getAllUsers, deleteUserAccount } from '../services/api';
import IncidentForm from '../components/IncidentForm';
import StatusIndicator from '../components/StatusIndicator';
import { getLocalReports, deleteLocalReport } from '../services/db';
import { io } from 'socket.io-client';

// Determine Socket Endpoint based on environment
const apiUrl = import.meta.env.VITE_API_BASE_URL || '';
const SOCKET_URL = (apiUrl.startsWith('http'))
    ? apiUrl.replace('/api', '')
    : (import.meta.env.DEV ? `${window.location.protocol}//${window.location.hostname}:5000` : window.location.origin);

const Dashboard = ({ user, setUser }) => {
    // --- STATE MANAGEMENT ---
    const [incidents, setIncidents] = useState([]); // List of emergency alerts
    const [users, setUsers] = useState([]);         // List of registered citizens (Admin only)
    const [userCount, setUserCount] = useState(0); // Total citizen count (Admin only)
    const [showForm, setShowForm] = useState(false); // Toggle between History and New Report
    const [currentView, setCurrentView] = useState('reports'); // Admin toggle: 'reports' or 'users'
    const [isOnline, setIsOnline] = useState(navigator.onLine); // Network connectivity tracking

    // UI Feedback States
    const [sosLoading, setSosLoading] = useState(false);
    const [sosSuccess, setSosSuccess] = useState(false);
    const [statusUpdateSuccess, setStatusUpdateSuccess] = useState(false);
    const [deleteModal, setDeleteModal] = useState({ show: false, id: null, type: 'incident' });

    // --- INITIALIZATION & SYNC ---
    useEffect(() => {
        // Track connection status for offline-first capabilities
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        fetchData(); // Load initial data from server

        // --- REAL-TIME SOCKET INTEGRATION ---
        const socket = io(SOCKET_URL, {
            withCredentials: true,
            transports: ['websocket', 'polling']
        });

        // Event: New incident reported by ANY user
        socket.on('new_incident', (newIncident) => {
            console.log('📡 REAL-TIME: New Incident Received', newIncident);

            // SECURITY FILTER: Citizens should only see their own reports in real-time
            // Admins see everything.
            if (user.role === 'admin' || newIncident.reporter === user.name) {
                setIncidents(prev => {
                    // Check if we already have this incident (by real ID)
                    if (prev.find(inc => inc._id === newIncident._id)) return prev;

                    // For citizens: Remove the temporary optimistic version of this specific report
                    if (user.role === 'citizen') {
                        return [newIncident, ...prev.filter(inc =>
                            !(inc.isOptimistic && inc.title === newIncident.title)
                        )];
                    }

                    // For admins: Just add it to the top
                    return [newIncident, ...prev];
                });
            }
        });

        // Event: Incident status updated by admin
        socket.on('incident_updated', (updatedIncident) => {
            console.log('📡 REAL-TIME: Incident Updated', updatedIncident);
            setIncidents(prev => prev.map(inc =>
                inc._id === updatedIncident._id ? updatedIncident : inc
            ));
        });

        // Event: Incident deleted
        socket.on('incident_deleted', (deletedId) => {
            console.log('📡 REAL-TIME: Incident Deleted', deletedId);
            setIncidents(prev => prev.filter(inc => inc._id !== deletedId));
        });

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            socket.disconnect(); // Cleanup connection on unmount
        };
    }, [user.role]);

    /**
     * Fetches all relevant data based on user role.
     * Citizens get their own reports; Admins get everything.
     */
    const fetchData = async () => {
        try {
            // Fetch live data from server
            const res = user.role === 'admin' ? await getIncidents() : await getMyIncidents();
            let liveIncidents = res.data.data.incidents;

            // Fetch pending data from local IndexedDB (Offline-First)
            const localIncidents = await getLocalReports();

            // Map local incidents to look like server incidents for the UI
            const formattedLocal = localIncidents.map(inc => ({
                ...inc,
                _id: `local-${inc.id}`,
                status: 'Queued (Offline)',
                createdAt: inc.createdAt || new Date().toISOString(),
                reporter: user.name,
                isLocal: true
            }));

            // Combine and sort by date (newest first)
            const combined = [...formattedLocal, ...liveIncidents].sort((a, b) =>
                new Date(b.createdAt) - new Date(a.createdAt)
            );

            setIncidents(combined);

            // Fetch extra metrics if user is an administrator
            if (user.role === 'admin') {
                const countRes = await getUserCount();
                setUserCount(countRes.data.data.count);

                const usersRes = await getAllUsers();
                setUsers(usersRes.data.data.users);
            }
        } catch (err) {
            console.error('SERVER FETCH ERROR:', err);
            // Fallback to local only if server is unreachable
            const localIncidents = await getLocalReports();
            setIncidents(localIncidents.map(inc => ({
                ...inc,
                _id: `local-${inc.id}`,
                status: 'Queued (Offline)',
                isLocal: true
            })));
        }
    };

    const fetchIncidents = fetchData; // Alias for compatibility

    // --- AUTHENTICATION ---
    const handleLogout = async () => {
        await logout();
        setUser(null); // Clear global user state to redirect to Login
    };

    // --- INCIDENT MANAGEMENT ---

    /**
     * Updates the resolution status of an incident (Admin only).
     * Provides immediate visual feedback to the dispatcher.
     */
    const handleStatusChange = async (id, newStatus) => {
        // OPTIMISTIC UPDATE: Update UI immediately
        setIncidents(prev => prev.map(inc =>
            inc._id === id ? { ...inc, status: newStatus } : inc
        ));

        try {
            await updateIncidentStatus(id, newStatus);
            setStatusUpdateSuccess(true);
            setTimeout(() => setStatusUpdateSuccess(false), 3000);
            // No need to fetchData here as socket and local state handle it
        } catch (err) {
            alert('CRITICAL: Status update synchronization failed. Rolling back...');
            fetchData(); // Rollback to server state
        }
    };

    /**
     * Permanent deletion of reports or users.
     * Controlled via a secure confirmation modal.
     */
    const handleDelete = async () => {
        const targetId = deleteModal.id;
        const targetType = deleteModal.type;

        // OPTIMISTIC DELETE: Remove from UI instantly
        if (targetType === 'incident') {
            setIncidents(prev => prev.filter(inc => inc._id !== targetId));
        } else {
            setUsers(prev => prev.filter(u => u._id !== targetId));
            setUserCount(prev => prev - 1);
        }

        try {
            if (targetType === 'incident') {
                if (targetId.toString().startsWith('local-')) {
                    // Extract the numeric ID and delete from IndexedDB
                    const localId = parseInt(targetId.toString().replace('local-', ''));
                    await deleteLocalReport(localId);
                    console.log('🗑️ OFFLINE: Local report redacted');
                } else {
                    await deleteIncident(targetId);
                }
            } else {
                await deleteUserAccount(targetId);
            }
            setDeleteModal({ show: false, id: null, type: 'incident' });
        } catch (err) {
            console.error('DELETION ERROR:', err);
            alert(err.response?.data?.message || 'CRITICAL: Deletion failed. Rolling back...');
            fetchData(); // Rollback on error
        }
    };

    /**
     * ONE-TAP EMERGENCY SOS
     * Uses browser Geolocation to broadcast distress signal.
     * Implements "Optimistic UI" for zero-latency feedback.
     */
    const handleSOS = async () => {
        setSosLoading(true);
        const tempId = 'temp-' + Date.now();

        // Immediate UI feedback so the user knows the button worked instantly
        const optimisticReport = {
            _id: tempId,
            title: "SOS EMERGENCY (SENDING...)",
            type: "Other",
            location: "Detecting GPS...",
            description: "CRITICAL: Urgent help requested via SOS button.",
            reporter: user.name,
            status: 'Pending',
            createdAt: new Date().toISOString(),
            isOptimistic: true
        };

        setIncidents(prev => [optimisticReport, ...prev]);

        try {
            // Promise wrapper for Geolocation API
            const getLocation = (highAccuracy) => new Promise((resolve, reject) => {
                if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: highAccuracy,
                    timeout: 20000, // Wait 20s (increased from 6s)
                    maximumAge: 0
                });
            });

            let position;
            let locationString = "Unknown Location";

            try {
                position = await getLocation(true); // Attempt high precision (GPS)
                locationString = `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`;
            } catch (err) {
                console.warn("High accuracy GPS failed, trying low accuracy...");
                try {
                    position = await getLocation(false); // Fallback to cell/wifi accuracy
                    locationString = `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`;
                } catch (err2) {
                    console.warn("All GPS failed. Sending without precise location.");
                    locationString = "GPS FAILED (Unknown)";
                }
            }

            const sosData = {
                title: "SOS EMERGENCY",
                type: "Other",
                location: locationString,
                description: "CRITICAL: Urgent help requested via SOS button."
            };

            await reportIncident(sosData);
            setSosSuccess(true);
            setTimeout(() => setSosSuccess(false), 5000);
        } catch (err) {
            // ROLLBACK OPTIMISTIC UPDATE ON GENERIC ERROR (Unless it's just connectivity)
            if (err.response?.status === 401 || err.response?.status === 400) {
                setIncidents(prev => prev.filter(inc => inc._id !== tempId));
                alert("EMERGENCY FAILURE: Authentication or Data Error");
            } else {
                // NETWORK FAILURE or 503 (Offline): Queuing for background sync
                const isOfflineError = !navigator.onLine ||
                    err.message === 'Network Error' ||
                    !err.response ||
                    err.response.status === 503;

                if (isOfflineError) {
                    console.log("SOS: Network failure/Offline detected. Queuing...");
                    try {
                        await saveReportLocally({
                            title: "SOS EMERGENCY",
                            type: "Other",
                            location: optimisticReport.location === "Detecting GPS..." ? "GPS_PENDING" : optimisticReport.location,
                            description: "CRITICAL: Urgent help requested via SOS button.",
                            createdAt: new Date().toISOString()
                        });

                        if ('serviceWorker' in navigator && 'SyncManager' in window) {
                            const registration = await navigator.serviceWorker.ready;
                            await registration.sync.register('sync-reports');
                        }

                        setSosSuccess(true); // Treat as success (queued)
                        setTimeout(() => setSosSuccess(false), 5000);
                    } catch (dbErr) {
                        console.error("SOS: Failed to save locally", dbErr);
                        setIncidents(prev => prev.filter(inc => inc._id !== tempId));
                        alert("EMERGENCY FAILURE: Signal could not be queued offline.");
                    }
                } else {
                    setIncidents(prev => prev.filter(inc => inc._id !== tempId));
                    alert("EMERGENCY FAILURE: Server error or Timeout");
                }
            }
        } finally {
            setSosLoading(false);
            fetchIncidents(); // Sync with real server data
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-3 sm:p-6 lg:p-8 relative min-h-screen">

            {/* --- GLOBAL OVERLAYS --- */}

            {/* SOS Success Message */}
            {sosSuccess && (
                <div className="fixed top-6 left-4 right-4 z-50 animate-fade-in-down pointer-events-none">
                    <div className="max-w-md mx-auto bg-green-600 text-white p-4 sm:p-6 rounded-3xl shadow-2xl flex items-center gap-4 border-4 border-white">
                        <CheckCircle size={40} className="shrink-0" />
                        <div>
                            <h3 className="text-lg sm:text-xl font-black">SOS ON THE WAY!</h3>
                            <p className="text-xs sm:text-sm font-medium opacity-90">Rescue teams have your location.</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Secure Delete confirmation Modal */}
            {deleteModal.show && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-[2.5rem] p-6 sm:p-10 max-w-sm w-full shadow-2xl border-t-[12px] border-emergency-red">
                        <div className="text-center">
                            {deleteModal.type === 'user' ? (
                                <Users size={64} className="mx-auto text-emergency-red mb-4" />
                            ) : (
                                <Trash2 size={64} className="mx-auto text-emergency-red mb-4" />
                            )}
                            <h2 className="text-2xl font-black text-gray-900 mb-3 lowercase tracking-tight">
                                {deleteModal.type === 'user' ? 'confirm delete user' : 'confirm delete report'}
                            </h2>
                            <p className="text-gray-500 font-medium mb-8 text-sm sm:text-base leading-relaxed">
                                {deleteModal.type === 'user'
                                    ? "This will permanently remove this citizen's account and all their emergency history."
                                    : "This report will be permanently removed from the dispatch system. Recover is impossible."
                                }
                            </p>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => setDeleteModal({ show: false, id: null, type: 'incident' })}
                                    className="flex-1 px-4 py-4 bg-gray-100 text-gray-600 rounded-2xl font-black hover:bg-gray-200 transition-all text-xs tracking-widest uppercase"
                                >
                                    CANCEL
                                </button>
                                <button
                                    onClick={handleDelete}
                                    className="flex-1 px-4 py-4 bg-emergency-red text-white rounded-2xl font-black hover:bg-emergency-dark shadow-xl transition-all text-xs tracking-widest uppercase"
                                >
                                    PROCEED
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Status Feedback Notification */}
            {statusUpdateSuccess && (
                <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 w-[90%] max-w-sm">
                    <div className="bg-blue-600 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-center gap-3 border-2 border-white animate-fade-in-up">
                        <CheckCircle size={20} />
                        <span className="font-black text-[10px] tracking-[0.2em] uppercase">Status Sync Success</span>
                    </div>
                </div>
            )}

            {/* --- DASHBOARD HEADER --- */}
            <header className="flex flex-col sm:flex-row justify-between items-center mb-8 bg-white p-6 rounded-3xl shadow-xl border-l-[10px] border-emergency-red gap-6">
                <div className="text-center sm:text-left">
                    <h1 className="text-3xl sm:text-4xl font-black text-gray-900 flex items-center justify-center sm:justify-start gap-3">
                        <Shield className="text-emergency-red" size={40} />
                        RESQUENET
                    </h1>
                    <p className="text-gray-500 font-bold lowercase mt-1 shrink-0">
                        Logged in as {user.name} ({user.role})
                    </p>
                </div>
                <div className="flex items-center gap-5 bg-gray-50 p-3 px-5 rounded-2xl border border-gray-100 w-full sm:w-auto justify-between">
                    <StatusIndicator isOnline={isOnline} />
                    <button
                        onClick={handleLogout}
                        className="p-2 text-gray-300 hover:text-emergency-red transition-all transform hover:scale-110 active:scale-90"
                        title="Secure Logout"
                    >
                        <LogOut size={28} />
                    </button>
                </div>
            </header>

            {/* --- ADMIN METRICS --- */}
            {user.role === 'admin' && (
                <div className="mb-8 overflow-hidden">
                    <div className="bg-blue-600 text-white p-7 rounded-[2rem] shadow-2xl flex items-center justify-between border-b-[12px] border-blue-800 transform hover:scale-[1.01] transition-transform">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.25em] opacity-70 mb-2">Registered Citizens</p>
                            <h3 className="text-5xl font-black leading-none tracking-tighter">{userCount}</h3>
                        </div>
                        <Users size={64} className="opacity-20" />
                    </div>
                </div>
            )}

            {/* --- CITIZEN SOS ACTION --- */}
            {user.role === 'citizen' && (
                <div className="mb-6 sm:mb-8 relative group">
                    <button
                        disabled={sosLoading}
                        onClick={handleSOS}
                        className="w-full bg-emergency-red hover:bg-emergency-dark text-white py-6 sm:py-14 rounded-3xl sm:rounded-[2.5rem] shadow-2xl flex flex-col items-center justify-center gap-3 sm:gap-4 transform active:scale-95 transition-all animate-pulse-slow border-b-[10px] sm:border-b-[16px] border-emergency-dark relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <AlertCircle size={48} className="sm:size-[72] relative z-10" />
                        <div className="relative z-10 text-center px-4">
                            <span className="text-xl sm:text-4xl lg:text-5xl font-black uppercase tracking-widest block leading-tight">SEND EMERGENCY SOS</span>
                            <span className="text-[8px] sm:text-xs opacity-80 font-black uppercase tracking-[0.2em] mt-2 sm:mt-4 block">Instantly broadcast location to responders</span>
                        </div>
                    </button>
                </div>
            )}

            {/* --- NAVIGATION TOGGLES --- */}
            <div className="flex gap-2 sm:gap-6 mb-6 sm:mb-8">
                <button
                    onClick={() => { setShowForm(false); setCurrentView('reports'); }}
                    className={`flex-1 p-3 sm:p-5 rounded-xl sm:rounded-2xl font-black text-[10px] sm:text-sm tracking-widest uppercase flex items-center justify-center gap-2 sm:gap-3 transition-all ${!showForm && currentView === 'reports' ? 'bg-emergency-red text-white shadow-2xl scale-105' : 'bg-white text-gray-400 hover:bg-gray-50'}`}
                >
                    <List size={18} className="sm:size-[22]" /> {user.role === 'admin' ? 'Recent Alerts' : 'My History'}
                </button>

                {user.role === 'citizen' ? (
                    <button
                        onClick={() => setShowForm(true)}
                        className={`flex-1 p-3 sm:p-5 rounded-xl sm:rounded-2xl font-black text-[10px] sm:text-sm tracking-widest uppercase flex items-center justify-center gap-2 sm:gap-3 transition-all ${showForm ? 'bg-emergency-red text-white shadow-2xl scale-105' : 'bg-white text-gray-400 hover:bg-gray-50'}`}
                    >
                        <PlusCircle size={18} className="sm:size-[22]" /> Detailed Report
                    </button>
                ) : (
                    <button
                        onClick={() => { setShowForm(false); setCurrentView('users'); }}
                        className={`flex-1 p-3 sm:p-5 rounded-xl sm:rounded-2xl font-black text-[10px] sm:text-sm tracking-widest uppercase flex items-center justify-center gap-2 sm:gap-3 transition-all ${!showForm && currentView === 'users' ? 'bg-emergency-red text-white shadow-2xl scale-105' : 'bg-white text-gray-400 hover:bg-gray-50'}`}
                    >
                        <Users size={18} className="sm:size-[22]" /> Manage Users
                    </button>
                )}
            </div>

            {/* --- MAIN CONTENT AREA --- */}
            <main className="bg-white rounded-3xl sm:rounded-[2.5rem] shadow-2xl p-4 sm:p-10 border border-gray-100">
                {showForm ? (
                    <IncidentForm onSuccess={() => { setShowForm(false); fetchData(); }} isOnline={isOnline} />
                ) : currentView === 'reports' ? (
                    <div className="space-y-4 sm:space-y-6">
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-lg sm:text-2xl font-black text-gray-900 lowercase tracking-tight">Active Transmissions</h2>
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 px-2 py-0.5 sm:px-3 sm:py-1 rounded-full">{incidents.length} Found</span>
                        </div>

                        {incidents.length === 0 ? (
                            <div className="text-center py-20 px-4">
                                <Shield size={64} className="mx-auto text-gray-100 mb-4" />
                                <p className="text-gray-400 font-bold uppercase text-xs tracking-widest italic">All Quiet. No active alerts reported.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4 sm:gap-6">
                                {incidents.map(incident => (
                                    <div key={incident._id} className={`border-l-[4px] sm:border-l-[6px] p-4 sm:p-6 rounded-2xl sm:rounded-3xl transition-all hover:shadow-xl group ${incident.status === 'Resolved' ? 'border-green-500 bg-green-50/30' :
                                        incident.status === 'In Progress' ? 'border-blue-500 bg-blue-50/30' : 'border-emergency-red bg-gray-50'
                                        }`}>
                                        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                                            <div className="w-full sm:w-auto">
                                                <h3 className="font-black text-lg sm:text-2xl text-gray-900 leading-tight mb-1">{incident.title}</h3>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[8px] sm:text-[9px] font-black uppercase text-gray-400 tracking-[0.3em]">REF: {incident._id.slice(-8)}</span>
                                                    {incident.isOptimistic && <span className="animate-pulse text-emergency-red font-black text-[8px] sm:text-[9px] uppercase tracking-widest">[SENDING...]</span>}
                                                    {incident.isLocal && <span className="text-orange-500 font-black text-[8px] sm:text-[9px] uppercase tracking-widest">[QUEUED OFFLINE]</span>}
                                                </div>
                                            </div>

                                            <div className="flex sm:flex-col items-center sm:items-end w-full sm:w-auto shrink-0 gap-2 sm:gap-3">
                                                <div className="flex items-center gap-2 sm:gap-3">
                                                    <button
                                                        onClick={() => setDeleteModal({ show: true, id: incident._id, type: 'incident' })}
                                                        className="p-1.5 sm:p-0 text-gray-200 hover:text-emergency-red transition-all"
                                                        title="Redact Report"
                                                    >
                                                        <Trash2 size={18} className="sm:size-[20]" />
                                                    </button>
                                                    <span className="px-2 py-1 sm:px-3 sm:py-1.5 bg-emergency-red text-white text-[9px] sm:text-[10px] font-black rounded-lg sm:rounded-xl uppercase tracking-widest shadow-lg">
                                                        {incident.type}
                                                    </span>
                                                </div>
                                                <span className={`flex items-center justify-center gap-1 text-[9px] sm:text-[10px] font-black uppercase px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl shadow-sm border ${incident.status === 'Resolved' ? 'bg-green-100 text-green-700 border-green-200' :
                                                    incident.status === 'In Progress' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-orange-100 text-orange-700 border-orange-200'
                                                    }`}>
                                                    {incident.status === 'Resolved' ? <CheckCircle size={10} className="sm:size-[12]" /> : <Clock size={10} className="sm:size-[12]" />} {incident.status}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="mt-6 sm:mt-8 space-y-4 sm:space-y-5">
                                            <div className="bg-white/60 p-3 sm:p-5 rounded-xl sm:rounded-2xl border border-white/50 shadow-inner">
                                                <span className="font-black uppercase text-[8px] sm:text-[10px] text-gray-400 block mb-1 sm:mb-2 tracking-[0.2em]">SITUATION SUMMARY</span>
                                                <p className="text-gray-700 text-xs sm:text-base leading-relaxed font-medium">{incident.description}</p>
                                            </div>
                                            <div className="bg-white/60 p-3 sm:p-5 rounded-xl sm:rounded-2xl border border-white/50 shadow-inner inline-flex flex-col w-full sm:w-auto">
                                                <span className="font-black uppercase text-[8px] sm:text-[10px] text-gray-400 block mb-1 sm:mb-2 tracking-[0.2em]">COORDINATES</span>
                                                <p className="text-gray-900 font-black text-xs sm:text-sm tracking-tight">{incident.location}</p>
                                            </div>
                                        </div>

                                        {user.role === 'admin' && (
                                            <div className="mt-8 pt-6 border-t border-gray-200/50">
                                                <span className="block text-[8px] sm:text-[10px] font-black text-gray-400 uppercase mb-3 tracking-[0.3em] text-center sm:text-left">COMMAND: UPDATE RESOLUTION STATUS</span>
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                                                    <button
                                                        onClick={() => handleStatusChange(incident._id, 'Pending')}
                                                        className={`px-4 py-2 sm:px-5 sm:py-3 text-[9px] sm:text-[10px] font-black rounded-xl transition-all border-2 ${incident.status === 'Pending' ? 'bg-orange-500 text-white border-orange-500 shadow-xl scale-105' : 'bg-white border-gray-100 text-orange-500 hover:border-orange-500'}`}
                                                    >
                                                        PENDING
                                                    </button>
                                                    <button
                                                        onClick={() => handleStatusChange(incident._id, 'In Progress')}
                                                        className={`px-4 py-2 sm:px-5 sm:py-3 text-[9px] sm:text-[10px] font-black rounded-xl transition-all border-2 ${incident.status === 'In Progress' ? 'bg-blue-500 text-white border-blue-500 shadow-xl scale-105' : 'bg-white border-gray-100 text-blue-500 hover:border-blue-500'}`}
                                                    >
                                                        IN PROGRESS
                                                    </button>
                                                    <button
                                                        onClick={() => handleStatusChange(incident._id, 'Resolved')}
                                                        className={`px-4 py-2 sm:px-5 sm:py-3 text-[9px] sm:text-[10px] font-black rounded-xl transition-all border-2 ${incident.status === 'Resolved' ? 'bg-green-600 text-white border-green-600 shadow-xl scale-105' : 'bg-white border-gray-100 text-green-600 hover:border-green-600'}`}
                                                    >
                                                        RESOLVED
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        <div className="mt-8 flex flex-col sm:flex-row justify-between items-center text-[10px] text-gray-400 font-black tracking-widest uppercase gap-4 opacity-60">
                                            <span className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded-full">SOURCE: {incident.reporter}</span>
                                            <span>TIME: {new Date(incident.createdAt).toLocaleString()}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    /* --- PERSONNEL DATABASE (ADMIN ONLY) --- */
                    <div className="space-y-6">
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-xl sm:text-2xl font-black text-gray-900 lowercase tracking-tight">Access Control List</h2>
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 px-3 py-1 rounded-full">{users.length} Citizens</span>
                        </div>

                        {users.length === 0 ? (
                            <p className="text-gray-400 text-center py-20 italic">No registered personnel found in system.</p>
                        ) : (
                            <div className="grid grid-cols-1 gap-4">
                                {users.map(u => (
                                    <div key={u._id} className="flex flex-col sm:flex-row items-center justify-between p-5 bg-gray-50 border-2 border-transparent hover:border-gray-200 rounded-[2rem] transition-all group gap-4">
                                        <div className="flex items-center gap-5 w-full">
                                            <div className="w-14 h-14 bg-emergency-red text-white rounded-[1.25rem] flex items-center justify-center font-black text-2xl shadow-lg shrink-0">
                                                {u.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="truncate">
                                                <h4 className="font-black text-gray-900 text-lg sm:text-xl leading-tight truncate">{u.name}</h4>
                                                <p className="text-xs text-gray-500 font-bold tracking-tight lowercase truncate">{u.email}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setDeleteModal({ show: true, id: u._id, type: 'user' })}
                                            className="w-full sm:w-auto p-4 sm:p-3 text-gray-400 hover:text-emergency-red hover:bg-red-50 rounded-2xl transition-all sm:opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 font-black text-[10px] tracking-widest uppercase border border-gray-100 sm:border-none"
                                            title="Revoke Permission"
                                        >
                                            <Trash2 size={22} /><span className="sm:hidden">Revoke Access</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
};

export default Dashboard;
