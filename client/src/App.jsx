// Force Redeploy: 2
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ShieldAlert, WifiOff } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import { getMe } from './services/api';


function App() {
  const [user, setUser] = useState(() => {
    // RESTORE SESSION (Offline Fallback)
    const cachedUser = localStorage.getItem('resquenet_user');
    return cachedUser ? JSON.parse(cachedUser) : null;
  });
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      // 1. SILENT STARTUP: If we have a cached user, we are already "In" 
      // regardless of the internet.
      if (user) setLoading(false);

      if (!navigator.onLine) {
        setLoading(false);
        return;
      }

      try {
        const res = await getMe();
        const freshUser = res.data.data.user;
        setUser(freshUser);
        localStorage.setItem('resquenet_user', JSON.stringify(freshUser));
      } catch (err) {
        const isAuthError = err.response && (err.response.status === 401 || err.response.status === 403);
        const isNetworkError = !err.response || err.response.status >= 500;

        if (isAuthError && navigator.onLine) {
          // Only log out if the SERVER explicitly told us the session is dead
          console.log('📡 AUTH: Session invalidated by server.');
          setUser(null);
          localStorage.removeItem('resquenet_user');
          localStorage.removeItem('resquenet_incidents'); // Clear history on logout
        } else if (isNetworkError) {
          console.log('📡 NETWORK: Server unreachable, sticking with local session.');
        }
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // Register Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
          console.log('SW registered:', registration);
        }).catch(error => {
          console.log('SW registration failed:', error);
        });
      });
    }
  }, []);

  // Sync user state to localStorage
  useEffect(() => {
    if (user) {
      localStorage.setItem('resquenet_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('resquenet_user');
    }
  }, [user]);

  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;

  return (
    <Router>
      <div className="min-h-screen bg-gray-100 flex flex-col">
        {/* OFFLINE INDICATOR */}
        {isOffline && (
          <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-center gap-3 animate-pulse sticky top-0 z-[9999] shadow-lg">
            <WifiOff size={18} className="shrink-0" />
            <span className="text-xs font-black uppercase tracking-widest">
              OFFLINE MODE: RESILIENT
            </span>
            <ShieldAlert size={18} className="shrink-0" />
          </div>
        )}

        <div className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/login" />} />
            <Route path="/login" element={!user ? <Login setUser={setUser} /> : <Navigate to="/dashboard" />} />
            <Route path="/register" element={!user ? <Register setUser={setUser} /> : <Navigate to="/dashboard" />} />
            <Route path="/dashboard" element={user ? <Dashboard user={user} setUser={setUser} /> : <Navigate to="/login" />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
