import { useState } from 'react';
import { register } from '../services/api';
import { Shield, User, Mail, Key } from 'lucide-react';
import { Link } from 'react-router-dom';

const Register = ({ setUser }) => {
    // --- STATE MANAGEMENT ---
    const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'citizen' });
    const [error, setError] = useState(''); // Stores registration error messages
    const [loading, setLoading] = useState(false);

    /**
     * Account Creation Handler
     * Note: All public registrations are automatically assigned the 'citizen' role 
     * for system security. Higher privileges are assigned by existing administrators.
     */
    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const res = await register(formData);
            setUser(res.data.data.user); // Auto-login user after successful registration
        } catch (err) {
            let errorMsg = err.response?.data?.message || 'CRITICAL: Registration procedure failed.';

            // Check if the error is due to being offline
            if (!navigator.onLine || !err.response) {
                errorMsg = 'NETWORK OFFLINE: Please check your internet connection to create an account.';
            }

            // Helpful message for duplicate accounts
            if (errorMsg.includes('E11000') || errorMsg.includes('duplicate')) {
                errorMsg = 'This email is already registered. Please Login!';
            }

            setError(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-3 sm:p-4 bg-gray-50">
            {/* REGISTRATION CONTAINER */}
            <div className="max-w-md w-full bg-white rounded-3xl sm:rounded-[2.5rem] shadow-2xl p-5 sm:p-10 border-t-[8px] sm:border-t-[10px] border-emergency-red transition-all">

                <div className="text-center mb-6 sm:mb-10">
                    <div className="inline-block p-3 sm:p-4 bg-red-50 rounded-2xl sm:rounded-3xl mb-3 sm:mb-4">
                        <Shield className="text-emergency-red size-10 sm:size-14" />
                    </div>
                    <h1 className="text-2xl sm:text-4xl font-black text-gray-900 tracking-tighter leading-none">RESQUENET</h1>
                    <p className="text-gray-400 font-black uppercase text-[8px] sm:text-[10px] tracking-[0.3em] mt-2 sm:mt-3">Join Response Network</p>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-600 p-3 sm:p-4 rounded-xl sm:rounded-2xl mb-4 sm:mb-6 text-center font-black text-[10px] sm:text-xs border border-red-100 uppercase tracking-widest animate-shake">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
                    <div className="relative group">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-emergency-red transition-colors size-4 sm:size-5" />
                        <input
                            type="text"
                            placeholder="Full Name"
                            className="w-full pl-10 sm:pl-12 pr-4 py-3 sm:py-4 bg-gray-50 border-2 border-transparent rounded-xl sm:rounded-2xl focus:bg-white focus:border-emergency-red outline-none transition-all text-xs sm:text-sm font-bold placeholder-gray-300"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            required
                        />
                    </div>

                    <div className="relative group">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-emergency-red transition-colors size-4 sm:size-5" />
                        <input
                            type="email"
                            placeholder="Email Address"
                            className="w-full pl-10 sm:pl-12 pr-4 py-3 sm:py-4 bg-gray-50 border-2 border-transparent rounded-xl sm:rounded-2xl focus:bg-white focus:border-emergency-red outline-none transition-all text-xs sm:text-sm font-bold placeholder-gray-300"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            required
                        />
                    </div>

                    <div className="relative group">
                        <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-emergency-red transition-colors size-4 sm:size-5" />
                        <input
                            type="password"
                            placeholder="Password"
                            className="w-full pl-10 sm:pl-12 pr-4 py-3 sm:py-4 bg-gray-50 border-2 border-transparent rounded-xl sm:rounded-2xl focus:bg-white focus:border-emergency-red outline-none transition-all text-xs sm:text-sm font-bold placeholder-gray-300"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            required
                        />
                    </div>

                    {/* Role selection is hardcoded to 'citizen' in the backend for security. */}

                    <button
                        disabled={loading}
                        className="w-full bg-emergency-red text-white p-4 sm:p-5 rounded-xl sm:rounded-2xl font-black text-[10px] sm:text-xs shadow-xl hover:bg-emergency-dark transform hover:-translate-y-1 active:scale-95 transition-all uppercase tracking-[0.2em] mt-1 sm:mt-2 disabled:opacity-50"
                    >
                        {loading ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT'}
                    </button>
                </form>

                <div className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-gray-100 text-center">
                    <p className="text-gray-400 font-bold text-[10px] sm:text-xs uppercase tracking-widest text-center">
                        Already have an account? <Link to="/login" className="text-emergency-red font-black hover:underline ml-1">Login</Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Register;
