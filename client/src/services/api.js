import axios from 'axios';

const api = axios.create({
    // Fallback to the live Vercel backend if Env Var is missing (Crucial for Vercel)
    baseURL: import.meta.env.VITE_API_BASE_URL || 'https://resque-net.vercel.app/api',
    withCredentials: true,
    timeout: 30000 // 30s timeout (wait for Vercel cold start)
});

// Automatic Retry for Vercel Cold Starts
api.interceptors.response.use(null, async (error) => {
    const { config, response } = error;
    if (config && !config.__isRetryRequest && (!response || response.status >= 500)) {
        config.__isRetryRequest = true;
        console.log("Retrying request due to server wakeup...");
        return new Promise(resolve => setTimeout(() => resolve(api(config)), 1000));
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
