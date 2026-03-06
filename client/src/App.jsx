// Force Redeploy: 1
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
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

  useEffect(() => {
    const checkSession = async () => {
      // INSTANT OFFLINE STARTUP: If we have a cached user and we are offline, 
      // show the UI immediately instead of waiting for a network timeout.
      if (!navigator.onLine && user) {
        setLoading(false);
        return;
      }

      try {
        const res = await getMe();
        const freshUser = res.data.data.user;
        setUser(freshUser);
        localStorage.setItem('resquenet_user', JSON.stringify(freshUser));
      } catch (err) {
        console.log('API Session Check Failed:', navigator.onLine ? 'No active session.' : 'Offline.');
        if (navigator.onLine && err.response && err.response.status === 401) {
          setUser(null);
          localStorage.removeItem('resquenet_user');
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
      <div className="min-h-screen bg-gray-100">
        <Routes>
          <Route path="/" element={<Navigate to="/login" />} />
          <Route path="/login" element={!user ? <Login setUser={setUser} /> : <Navigate to="/dashboard" />} />
          <Route path="/register" element={!user ? <Register setUser={setUser} /> : <Navigate to="/dashboard" />} />
          <Route path="/dashboard" element={user ? <Dashboard user={user} setUser={setUser} /> : <Navigate to="/login" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
