import { useState, useEffect } from 'react';
import { Shield, LogOut, PlusCircle, List, AlertCircle, CheckCircle, Clock, Trash2, X, Users, UserPlus } from 'lucide-react';
import { logout, getIncidents, getMyIncidents, updateIncidentStatus, reportIncident, deleteIncident, getUserCount, getAllUsers, deleteUserAccount } from '../services/api';
import IncidentForm from '../components/IncidentForm';
import StatusIndicator from '../components/StatusIndicator';
import { getLocalReports, deleteLocalReport } from '../services/db';
import { io } from 'socket.io-client';

// Use current origin for socket; Vite proxy handles routing in dev, and relative works in prod
const SOCKET_URL = window.location.origin;

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
    const [socketConnected, setSocketConnected] = useState(false);
    const [realTimeEventToast, setRealTimeEventToast] = useState({ show: false, message: '' });
    const [errorToast, setErrorToast] = useState({ show: false, message: '' });
    const [deleteModal, setDeleteModal] = useState({ show: false, id: null, type: 'incident' });

    /**
     * Global Error Handler
     * Replaces 'localhost says' alerts with premium in-page notifications.
     */
    const triggerError = (msg) => {
        setErrorToast({ show: true, message: msg.toUpperCase() });
        setTimeout(() => setErrorToast({ show: false, message: '' }), 6000);
    };

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

        socket.on('connect', () => {
            console.log('📡 SOCKET: Connected to Server');
            setSocketConnected(true);
        });

        socket.on('disconnect', () => {
            console.log('📡 SOCKET: Disconnected');
            setSocketConnected(false);
        });

        // Event: New incident reported by ANY user
        socket.on('new_incident', (newIncident) => {
            console.log('📡 REAL-TIME: New Incident Received', newIncident);

            // Visual feedback for real-time receipt (Only if reported by someone else)
            const isMe = newIncident.reporter && user.name &&
                newIncident.reporter.trim().toLowerCase() === user.name.trim().toLowerCase();

            if (!isMe) {
                setRealTimeEventToast({ show: true, message: 'NEW EMERGENCY BROADCAST RECEIVED' });
                setTimeout(() => setRealTimeEventToast({ show: false, message: '' }), 3000);
            }

            // SECURITY FILTER: Citizens should only see their own reports in real-time
            const reporterName = newIncident.reporter?.toString().trim().toLowerCase();
            const myName = user.name?.toString().trim().toLowerCase();

            if (user.role === 'admin' || reporterName === myName) {
                setIncidents(prev => {
                    // Check if we already have this incident (by real ID)
                    if (prev.find(inc => inc._id?.toString() === newIncident._id?.toString())) return prev;

                    // FILTER OUT OPTIMISTIC/LOCAL VERSIONS
                    return [newIncident, ...prev.filter(inc => {
                        const incTitle = inc.title?.toString().trim().toLowerCase();
                        const newTitle = newIncident.title?.toString().trim().toLowerCase();
                        const incReporter = inc.reporter?.toString().trim().toLowerCase();
                        const newReporter = newIncident.reporter?.toString().trim().toLowerCase();

                        // Match by title and reporter as a proxy for the 'same' report
                        const isDuplicate = (inc.isOptimistic || inc.isLocal) &&
                            incTitle === newTitle &&
                            incReporter === newReporter;

                        return !isDuplicate;
                    })];
                });
            }
        });

        // Event: Incident status updated by admin
        socket.on('incident_updated', (updatedIncident) => {
            console.log('📡 REAL-TIME: Incident Updated', updatedIncident);

            // Only show sync notification if the user is NOT an admin (meaning the admin did the update)
            if (user.role === 'citizen') {
                setRealTimeEventToast({ show: true, message: 'INCIDENT STATUS SYNCED' });
                setTimeout(() => setRealTimeEventToast({ show: false, message: '' }), 3000);
            }
            setIncidents(prev => prev.map(inc =>
                inc._id.toString() === updatedIncident._id.toString() ? updatedIncident : inc
            ));
        });

        // Event: Incident deleted
        socket.on('incident_deleted', (deletedId) => {
            console.log('📡 REAL-TIME: Incident Deleted', deletedId);

            // Only show if the user isn't the one who likely deleted it
            if (user.role === 'citizen') {
                setRealTimeEventToast({ show: true, message: 'REDACTION SYNCED' });
                setTimeout(() => setRealTimeEventToast({ show: false, message: '' }), 3000);
            }
            setIncidents(prev => prev.filter(inc => inc._id.toString() !== deletedId.toString()));
        });

        // Event: New user registered
        socket.on('user_registered', (newUser) => {
            console.log('📡 REAL-TIME: New User Joined', newUser);
            setUsers(prev => [newUser, ...prev]);
            setUserCount(prev => prev + 1);
        });

        // Event: User deleted by admin
        socket.on('user_deleted', (deletedUserId) => {
            console.log('📡 REAL-TIME: User Revoked', deletedUserId);
            setUsers(prev => prev.filter(u => u._id.toString() !== deletedUserId.toString()));
            setUserCount(prev => prev - 1);
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
            // 1. Fetch live data from server
            const res = user.role === 'admin' ? await getIncidents() : await getMyIncidents();
            let liveIncidents = res.data.data.incidents;

            // 2. Fetch all pending actions from local IndexedDB
            const { getPendingActions } = await import('../services/db');
            const pendingActions = await getPendingActions();

            // 3. Separate ACTIONS
            const pendingCreates = pendingActions.filter(a => a.type === 'CREATE');
            const pendingUpdates = pendingActions.filter(a => a.type === 'UPDATE');
            const pendingDeletes = pendingActions.filter(a => a.type === 'DELETE');

            // 4. APPLY PENDING DELETES (Hide items from UI)
            const deleteIds = pendingDeletes.map(a => a.payload.id.toString());
            liveIncidents = liveIncidents.filter(inc => !deleteIds.includes(inc._id.toString()));

            // 5. APPLY PENDING UPDATES (Change status in UI)
            liveIncidents = liveIncidents.map(inc => {
                const update = pendingUpdates.find(u => u.payload.id.toString() === inc._id.toString());
                return update ? { ...inc, status: update.payload.status, isQueuedStatus: true } : inc;
            });

            // 6. FORMAT PENDING CREATES
            const formattedLocal = pendingCreates.map(action => ({
                ...action.payload,
                _id: `local-${action.id}`,
                status: action.payload.status || 'Pending',
                isQueuedStatus: true,
                createdAt: action.payload.createdAt || action.createdAt,
                reporter: user.name,
                isLocal: true
            }));

            // 7. COMBINE AND SORT
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

            // Fallback: Populate UI from local IndexedDB if server is reachable but failing
            try {
                const { getPendingActions } = await import('../services/db');
                const pendingActions = await getPendingActions();
                const pendingCreates = pendingActions.filter(a => a.type === 'CREATE');

                setIncidents(prev => {
                    const localOnly = pendingCreates.map(action => ({
                        ...action.payload,
                        _id: `local-${action.id}`,
                        status: action.payload.status || 'Pending',
                        isLocal: true
                    }));
                    // Merge with what we already have to prevent 'disappearing' reports
                    return [...localOnly, ...prev.filter(p => !p.isLocal)];
                });
            } catch (dbErr) {
                console.error("Local recovery failed", dbErr);
            }

            const status = err.response?.status;
            if (status === 403 || status === 401) {
                triggerError('SESSION EXPIRED: Please Logout and Login again to restore Admin access.');
            } else {
                triggerError('OFFLINE MODE: Using local synchronization queue.');
            }
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
            inc._id.toString() === id.toString() ? { ...inc, status: newStatus, isQueuedStatus: true } : inc
        ));

        // TYPE A: LOCAL REPORT (Starts with 'local-')
        if (id.toString().startsWith('local-')) {
            try {
                const localId = parseInt(id.toString().replace('local-', ''));
                const { getPendingActions, updatePendingAction } = await import('../services/db');
                const actions = await getPendingActions();
                const action = actions.find(a => a.id === localId);

                if (action) {
                    action.payload.status = newStatus;
                    await updatePendingAction(localId, action);
                    console.log('📝 LOCAL SYNC: Status updated to', newStatus);
                }
                // We stop here since it's not on the server yet
                return;
            } catch (err) {
                console.error('LOCAL SYNC ERROR:', err);
                return;
            }
        }

        // TYPE C: OPTIMISTIC/TEMP REPORT
        if (id.toString().startsWith('temp-')) {
            console.log('📝 UI: Optimistic status updated locally');
            return;
        }

        // TYPE B: LIVE REPORT (Server Update)
        try {
            await updateIncidentStatus(id, newStatus);
            console.log('📡 SERVER SYNC: Status updated to', newStatus);
            // Clear the syncing status once server confirms
            setIncidents(prev => prev.map(inc =>
                inc._id.toString() === id.toString() ? { ...inc, isQueuedStatus: false } : inc
            ));
        } catch (err) {
            const isOffline = !navigator.onLine || err.response?.status === 503 || !err.response;

            if (isOffline) {
                console.log("STATUS: Offline detected. Queuing update for sync...");
                const { queueAction } = await import('../services/db');
                await queueAction('UPDATE', { id, status: newStatus });
                registerSync();
            } else {
                console.error('STATUS SYNC FAILED:', err);
                const errMsg = err.response?.data?.message || 'Access denied or connection lost.';
                triggerError(`COMMAND FAILED: ${errMsg}`);
                fetchData(); // Rollback to server truth
            }
        }
    };

    /**
     * Permanent deletion of reports or users.
     * Controlled via a secure confirmation modal.
     */
    const handleDelete = async () => {
        const targetId = deleteModal.id;
        const targetType = deleteModal.type;

        // INSTANT UI RESPONSE: Close modal and remove item
        setDeleteModal({ show: false, id: null, type: 'incident' });

        if (targetType === 'incident') {
            setIncidents(prev => prev.filter(inc => inc._id?.toString() !== targetId?.toString()));
        } else {
            setUsers(prev => prev.filter(u => u._id?.toString() !== targetId?.toString()));
            setUserCount(prev => prev - 1);
        }

        try {
            if (targetType === 'incident') {
                const idStr = targetId.toString();
                if (idStr.startsWith('local-')) {
                    const localId = parseInt(idStr.replace('local-', ''));
                    // Use the imported function from the top of file
                    await deleteLocalReport(localId);
                    console.log('🗑️ OFFLINE: Local report redacted');
                } else if (idStr.startsWith('temp-') || idStr.startsWith('local-')) {
                    // It's an optimistic or local report. We already removed it from UI at line 322.
                    // If it's local- we already handled it above, but we add 'temp-' here to prevent server call.
                    console.log('🗑️ UI: Temporary report removed locally');
                    return;
                } else {
                    await deleteIncident(targetId);
                }
            } else {
                await deleteUserAccount(targetId);
            }
        } catch (err) {
            const isOffline = !navigator.onLine || err.response?.status === 503 || !err.response;

            if (isOffline && targetType === 'incident') {
                console.log("DELETE: Offline detected. Queuing redaction...");
                const { queueAction } = await import('../services/db');
                await queueAction('DELETE', { id: targetId });
                registerSync();
                setDeleteModal({ show: false, id: null, type: 'incident' });
            } else {
                console.error('DELETION ERROR:', err);
                const errMsg = err.response?.data?.message || 'Deletion failed. Connection lost.';
                triggerError(`OPERATION FAILED: ${errMsg}`);
                fetchData();
            }
        }
    };

    const registerSync = () => {
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
            navigator.serviceWorker.ready.then(registration => {
                return registration.sync.register('sync-reports');
            }).catch(err => console.log('SYNC REG FAILURE', err));
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
            title: "SOS EMERGENCY",
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
            // No need for fetchData() here, socket will handle the update
            setTimeout(() => setSosSuccess(false), 5000);
        } catch (err) {
            // ROLLBACK OPTIMISTIC UPDATE ON GENERIC ERROR (Unless it's just connectivity)
            if (err.response?.status === 401 || err.response?.status === 400) {
                setIncidents(prev => prev.filter(inc => inc._id !== tempId));
                triggerError("EMERGENCY FAILURE: Authentication or Data Error");
            } else {
                // NETWORK FAILURE or 503 (Offline): Queuing for background sync
                const isOfflineError = !navigator.onLine ||
                    err.message === 'Network Error' ||
                    !err.response ||
                    err.response.status === 503;

                if (isOfflineError) {
                    console.log("SOS: Network failure/Offline detected. Queuing...");
                    try {
                        const { queueAction } = await import('../services/db');
                        await queueAction('CREATE', {
                            title: "SOS EMERGENCY",
                            type: "Other",
                            location: optimisticReport.location === "Detecting GPS..." ? "GPS_PENDING" : optimisticReport.location,
                            description: "CRITICAL: Urgent help requested via SOS button.",
                            createdAt: new Date().toISOString()
                        });

                        registerSync();
                        setSosSuccess(true); // Treat as success (queued)
                        setTimeout(() => setSosSuccess(false), 5000);
                    } catch (dbErr) {
                        console.error("SOS: Failed to save locally", dbErr);
                        setIncidents(prev => prev.filter(inc => inc._id !== tempId));
                        triggerError("OFFLINE FAILURE: Signal could not be saved locally.");
                    }
                } else {
                    setIncidents(prev => prev.filter(inc => inc._id !== tempId));
                    triggerError("BROADCAST FAILURE: Server is currently unreachable.");
                }
            }
        } finally {
            setSosLoading(false);
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

            {/* Error Notifications Toast */}
            {errorToast.show && (
                <div className="fixed top-8 left-1/2 transform -translate-x-1/2 z-[70] w-[90%] max-w-md">
                    <div className="bg-white text-emergency-red p-5 rounded-[2rem] shadow-2xl flex items-center gap-4 border-2 border-emergency-red animate-shake font-black text-xs uppercase tracking-widest">
                        <AlertCircle size={28} className="shrink-0" />
                        <p>{errorToast.message}</p>
                    </div>
                </div>
            )}

            {/* Real-time Events Notification */}
            {realTimeEventToast.show && (
                <div className="fixed top-8 left-1/2 transform -translate-x-1/2 z-[60] w-[90%] max-w-md">
                    <div className="bg-black text-white p-5 rounded-[2rem] shadow-2xl flex items-center justify-center gap-4 border-2 border-emergency-red animate-bounce-slow">
                        <Clock size={24} className="text-emergency-red animate-pulse" />
                        <span className="font-black text-[10px] sm:text-xs tracking-[0.2em] uppercase">{realTimeEventToast.message}</span>
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
                    <StatusIndicator isOnline={isOnline} socketConnected={socketConnected} />
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
                    <List size={18} className="sm:size-[22]" /> MY VIEW
                </button>

                <button
                    onClick={() => setShowForm(true)}
                    className={`flex-1 p-3 sm:p-5 rounded-xl sm:rounded-2xl font-black text-[10px] sm:text-sm tracking-widest uppercase flex items-center justify-center gap-2 sm:gap-3 transition-all ${showForm ? 'bg-emergency-red text-white shadow-2xl scale-105' : 'bg-white text-gray-400 hover:bg-gray-50'}`}
                >
                    <PlusCircle size={18} className="sm:size-[22]" /> ADD REPORT
                </button>

                {user.role === 'admin' && (
                    <button
                        onClick={() => { setShowForm(false); setCurrentView('users'); }}
                        className={`flex-1 p-3 sm:p-5 rounded-xl sm:rounded-2xl font-black text-[10px] sm:text-sm tracking-widest uppercase flex items-center justify-center gap-2 sm:gap-3 transition-all ${!showForm && currentView === 'users' ? 'bg-emergency-red text-white shadow-2xl scale-105' : 'bg-white text-gray-400 hover:bg-gray-50'}`}
                    >
                        <Users size={18} className="sm:size-[22]" /> MANAGE USERS
                    </button>
                )}
            </div>

            {/* --- MAIN CONTENT AREA --- */}
            <main className="bg-white rounded-3xl sm:rounded-[2.5rem] shadow-2xl p-4 sm:p-10 border border-gray-100">
                {showForm ? (
                    <IncidentForm
                        onSuccess={() => setShowForm(false)}
                        isOnline={isOnline}
                        user={user}
                        setIncidents={setIncidents}
                        triggerError={triggerError}
                    />
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
                                                    {incident.isQueuedStatus && <span className="ml-1 text-[7px] animate-pulse opacity-50">[SYNCING]</span>}
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
