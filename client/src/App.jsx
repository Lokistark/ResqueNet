// RESQ-V19: PURE OFFLINE-FIRST ENGINE
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import { getMe } from './services/api';

function App() {
  const [user, setUser] = useState(() => {
    // 🏗️ LOCAL STORAGE FIRST: Retrieve the persistent auth session immediately.
    const cachedUser = localStorage.getItem('resquenet_user');
    return cachedUser ? JSON.parse(cachedUser) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    /**
     * MOBILE PATTERN: checkAuthentication()
     * Ignores connectivity status. Prioritizes local token.
     */
    const checkAuthentication = async () => {
      // 1. FORCE LOAD UI: If local session exists, get the user into the app immediately.
      if (user) {
        setLoading(false);
      }

      // 2. SILENT BACKGROUND REFRESH: Attempt to sync session but never block if offline.
      try {
        const res = await getMe();
        const freshUser = res.data.data.user;
        setUser(freshUser);
        localStorage.setItem('resquenet_user', JSON.stringify(freshUser));
      } catch (err) {
        const isAuthError = err.response && (err.response.status === 401 || err.response.status === 403);
        if (isAuthError) {
          // Absolute logout ONLY if server explicitly invalidates the token.
          setUser(null);
          localStorage.removeItem('resquenet_user');
          localStorage.removeItem('resquenet_incidents');
        }
        // Network errors are ignored. The local session remains active.
      } finally {
        setLoading(false);
      }
    };

    checkAuthentication();

    // REGISTER SILENT SERVICE WORKER
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW ERR:', err));
      });
    }
  }, []);

  if (loading) return null; // Zero-Flicker Launch

  return (
    <Router>
      <div className="min-h-screen bg-gray-100 flex flex-col">
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
