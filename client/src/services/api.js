import axios from 'axios';

const api = axios.create({
    baseURL: '/api', // Use relative path; Vite proxy handles this in dev, and Vercel in prod
    withCredentials: true,
    timeout: 30000 // 30s timeout
});

// Automatic Retry for Vercel Cold Starts / Low Network
api.interceptors.response.use(null, async (error) => {
    const { config, response } = error;

    // Fast-fail for explicit offline conditions to avoid 14s retry delay
    const isExplicitlyOffline = !navigator.onLine ||
        (response && response.status === 503 && response.headers && response.headers['x-resquenet-offline'] === 'true');

    if (isExplicitlyOffline) {
        return Promise.reject(error);
    }

    // Initialize retry count
    config.retryCount = config.retryCount || 0;
    const MAX_RETRIES = 1; // Direct retry once, then fail fast for better UX

    // Retry if: 
    // 1. It's a 503 error (Database connecting)
    // 2. It's a network error (no response)
    if (config && config.retryCount < MAX_RETRIES &&
        (!response || response.status === 503)) {

        config.retryCount += 1;
        // ZERO DELAY RETRY: Don't make the user wait if it was just a transient hiccup
        console.log(`API: Rapid Retry (${config.retryCount}/${MAX_RETRIES})...`);
        return api(config);
    }

    return Promise.reject(error);
});

export const reportIncident = (data) => api.post('/incidents', data);
export const reportPublicSOS = (data) => api.post('/incidents/public-sos', data);
export const getIncidents = () => api.get('/incidents');
export const getMyIncidents = () => api.get('/incidents/my');
export const updateIncidentStatus = (id, status) => api.patch(`/incidents/${id}/status`, { status });
export const deleteIncident = (id) => api.delete(`/incidents/${id}`);
export const login = (credentials) => api.post('/auth/login', credentials);
export const register = (userData) => api.post('/auth/register', userData);
export const logout = () => api.get('/auth/logout');
export const getMe = () => api.get('/auth/me');
export const getUserCount = () => api.get('/auth/count');
export const getAllUsers = () => api.get('/auth');
export const deleteUserAccount = (id) => api.delete(`/auth/${id}`);

export default api;
