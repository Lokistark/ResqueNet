import { useState } from 'react';
import { login, reportPublicSOS } from '../services/api';
import { Shield, Key, Mail, AlertCircle, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

const Login = ({ setUser }) => {
    // --- STATE MANAGEMENT ---
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(''); // Stores login failure messages
    const [sosLoading, setSosLoading] = useState(false);
    const [sosSuccess, setSosSuccess] = useState(false);

    /**
     * Standard Login Handler
     * Communicates with the backend to establish an authenticated session.
     */
    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await login({ email, password });
            setUser(res.data.data.user); // Pass user data to global state
        } catch (err) {
            setError(err.response?.data?.message || 'CRITICAL: Authentication failed.');
        }
    };

    /**
     * Unauthenticated SOS Bypass
     * Allows individuals in immediate danger to alert rescuers without an account.
     */
    const handlePublicSOS = async () => {
        setSosLoading(true);
        try {
            // Promise wrapper for location detection
            const getLocation = (highAccuracy) => new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: highAccuracy,
                    timeout: 10000,
                    maximumAge: 0
                });
            });

            let position;
            try {
                position = await getLocation(true);
            } catch (err) {
                position = await getLocation(false); // Low-accuracy fallback
            }

            // Send silent distress signal to server
            await reportPublicSOS({
                location: `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`
            });
            setSosSuccess(true);
            setTimeout(() => setSosSuccess(false), 5000);
        } catch (err) {
            alert("EMERGENCY SIGNAL FAILURE: " + (err.code === 1 ? "Permission Denied" : "Signal Timeout"));
        } finally {
            setSosLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-3 sm:p-4 relative bg-gray-50">

            {/* PUBLIC SOS SUCCESS NOTIFICATION */}
            {sosSuccess && (
                <div className="fixed top-8 left-4 right-4 z-50 animate-fade-in-down pointer-events-none">
                    <div className="max-w-sm mx-auto bg-green-600 text-white p-5 rounded-[2rem] shadow-2xl flex items-center gap-4 border-4 border-white animate-bounce-slow">
                        <CheckCircle size={32} className="shrink-0" />
                        <div>
                            <h3 className="font-black text-sm uppercase">ANONYMOUS SOS SENT!</h3>
                            <p className="text-[10px] sm:text-xs opacity-90 font-bold uppercase tracking-wider">Rescuers are tracking your location.</p>
                        </div>
                    </div>
                </div>
            )}

            {/* AUTHENTICATION BOX */}
            <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl p-6 sm:p-10 border-t-[10px] border-emergency-red transition-all">

                <div className="text-center mb-10">
                    <div className="inline-block p-4 bg-red-50 rounded-3xl mb-4 group hover:scale-110 transition-transform">
                        <Shield className="text-emergency-red" size={56} />
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tighter leading-none">RESQUENET</h1>
                    <p className="text-gray-400 font-black uppercase text-[10px] tracking-[0.3em] mt-3">Emergency Response Protocol</p>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-600 p-4 rounded-2xl mb-6 text-center font-black text-xs border border-red-100 uppercase tracking-widest animate-shake">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="relative group">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-emergency-red transition-colors" size={20} />
                        <input
                            type="email"
                            placeholder="Email Address"
                            className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-emergency-red outline-none transition-all text-sm font-bold placeholder-gray-300"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className="relative group">
                        <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-emergency-red transition-colors" size={20} />
                        <input
                            type="password"
                            placeholder="Password"
                            className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-emergency-red outline-none transition-all text-sm font-bold placeholder-gray-300"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    <button className="w-full bg-emergency-red text-white p-5 rounded-2xl font-black text-xs shadow-xl hover:bg-emergency-dark transform hover:-translate-y-1 active:scale-95 transition-all uppercase tracking-[0.2em] mt-2">
                        AUTHENTICATE
                    </button>
                </form>

                {/* --- EMERGENCY UTILITIES --- */}
                <div className="mt-10 pt-10 border-t border-gray-100 space-y-6 text-center">
                    <div>
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.3em] mb-4 italic">In Immediate Danger?</p>
                        <button
                            onClick={handlePublicSOS}
                            disabled={sosLoading}
                            className="w-full bg-gray-900 text-white p-5 rounded-2xl font-black text-xs flex items-center justify-center gap-3 hover:bg-black active:scale-95 transition-all shadow-2xl relative overflow-hidden group"
                        >
                            <AlertCircle size={24} className="text-emergency-red animate-pulse" />
                            <span className="tracking-widest uppercase">BYPASS LOGIN - SEND SOS</span>
                        </button>
                    </div>

                    <p className="text-gray-400 font-bold text-xs uppercase tracking-widest">
                        Don't have an account? <Link to="/register" className="text-emergency-red font-black hover:underline ml-1">Register</Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;
