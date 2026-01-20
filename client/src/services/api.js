import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:5000/api',
    withCredentials: true
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
