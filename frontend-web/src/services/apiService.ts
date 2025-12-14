import axios, { AxiosInstance, AxiosError } from 'axios';

// Detect if running in Electron - must be evaluated at runtime
const checkIsElectron = () => {
  if (typeof window === 'undefined') return false;
  return window.navigator.userAgent.includes('Electron') || 
         window.location.protocol === 'app:' ||
         (window as any).electron !== undefined;
};

// Use relative URL in production (works with Nginx proxy), full URL in development
const getApiUrl = () => {
  // CRITICAL: Check if Electron context bridge exposed apiUrl
  if (typeof window !== 'undefined' && (window as any).electron?.apiUrl) {
    const electronApiUrl = (window as any).electron.apiUrl;
    console.log('🔌 [API] Using Electron API URL:', electronApiUrl);
    return `${electronApiUrl}/api`;
  }
  
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl) {
    console.log('🌐 [API] Using VITE_API_URL:', envUrl);
    return envUrl;
  }
  
  // In Electron, always use the production server directly
  if (checkIsElectron()) {
    console.log('🔌 [API] Electron detected, using production URL');
    return 'http://162.55.219.151/api';
  }
  
  // In production (no VITE_API_URL), use relative path for Nginx proxy
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    console.log('🌐 [API] Production mode, using relative path');
    return '/api';
  }
  
  console.log('🔧 [API] Development mode, using localhost');
  return 'http://localhost:3000/api';
};

class ApiService {
  private client: AxiosInstance;

  constructor() {
    const baseURL = getApiUrl();
    
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log('API Service initialized with baseURL:', baseURL);

    this.client.interceptors.request.use(
      (config) => {
        console.log('API Request:', config.method?.toUpperCase(), config.url, config.data);
        const token = localStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => {
        console.log('API Response:', response.status, response.config.url, response.data);
        return response;
      },
      async (error: AxiosError) => {
        console.error('API Error:', error.response?.status, error.config?.url, error.response?.data);
        
        if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
          localStorage.removeItem('authToken');
          localStorage.removeItem('auth-storage');
          localStorage.removeItem('lastSyncTimestamp');
          
          if (!window.location.hash.includes('/login')) {
            window.location.hash = '#/login';
          }
        }
        return Promise.reject(error);
      }
    );
  }

  async register(data: { email: string; password: string; firstName: string; lastName: string }) {
    const response = await this.client.post('/auth/register', data);
    return response.data;
  }

  async login(email: string, password: string) {
    const response = await this.client.post('/auth/login', { email, password });
    return response.data;
  }

  async getCurrentUser() {
    const response = await this.client.get('/auth/me');
    return response.data;
  }

  async getProjects(status?: string) {
    const response = await this.client.get('/projects', { params: { status } });
    return response.data;
  }

  async getProject(id: string) {
    const response = await this.client.get(`/projects/${id}`);
    return response.data;
  }

  async createProject(data: any) {
    const response = await this.client.post('/projects', data);
    return response.data;
  }

  async updateProject(id: string, data: any) {
    const response = await this.client.put(`/projects/${id}`, data);
    return response.data;
  }

  async deleteProject(id: string) {
    const response = await this.client.delete(`/projects/${id}`);
    return response.data;
  }

  async getDeletedProjects() {
    const response = await this.client.get('/projects/deleted/list');
    return response.data;
  }

  async restoreProject(id: string) {
    const response = await this.client.post(`/projects/${id}/restore`);
    return response.data;
  }

  async getBordereaux(projectId: string) {
    const response = await this.client.get(`/bordereau/project/${projectId}`);
    return response.data;
  }

  async getPeriodes(projectId: string) {
    const response = await this.client.get(`/periodes/project/${projectId}`);
    return response.data;
  }

  async createBordereau(data: any) {
    const response = await this.client.post('/bordereau', data);
    return response.data;
  }

  async updateBordereau(id: string, data: any) {
    const response = await this.client.put(`/bordereau/${id}`, data);
    return response.data;
  }

  async deleteBordereau(id: string) {
    const response = await this.client.delete(`/bordereau/${id}`);
    return response.data;
  }

  async getMetres(projectId: string) {
    const response = await this.client.get(`/metre/project/${projectId}`);
    return response.data;
  }

  async createMetre(data: any) {
    const response = await this.client.post('/metre', data);
    return response.data;
  }

  async updateMetre(id: string, data: any) {
    const response = await this.client.put(`/metre/${id}`, data);
    return response.data;
  }

  async deleteMetre(id: string) {
    const response = await this.client.delete(`/metre/${id}`);
    return response.data;
  }

  async getDecompts(projectId: string) {
    const response = await this.client.get(`/decompt/project/${projectId}`);
    return response.data;
  }

  async createDecompt(data: any) {
    const response = await this.client.post('/decompt', data);
    return response.data;
  }

  async updateDecompt(id: string, data: any) {
    const response = await this.client.put(`/decompt/${id}`, data);
    return response.data;
  }

  async deleteDecompt(id: string) {
    const response = await this.client.delete(`/decompt/${id}`);
    return response.data;
  }

  async uploadPhoto(projectId: string, file: File, metadata: any) {
    const formData = new FormData();
    formData.append('photo', file);
    formData.append('projectId', projectId);
    Object.keys(metadata).forEach((key) => {
      formData.append(key, metadata[key]);
    });
    const response = await this.client.post('/photos', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async getPhotos(projectId: string) {
    const response = await this.client.get(`/photos/project/${projectId}`);
    return response.data;
  }

  async deletePhoto(id: string) {
    const response = await this.client.delete(`/photos/${id}`);
    return response.data;
  }

  async getPVs(projectId: string) {
    const response = await this.client.get(`/pv/project/${projectId}`);
    return response.data;
  }

  async createPV(data: any) {
    const response = await this.client.post('/pv', data);
    return response.data;
  }

  async updatePV(id: string, data: any) {
    const response = await this.client.put(`/pv/${id}`, data);
    return response.data;
  }

  async deletePV(id: string) {
    const response = await this.client.delete(`/pv/${id}`);
    return response.data;
  }

  async uploadAttachment(projectId: string, file: File, metadata: any) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('projectId', projectId);
    Object.keys(metadata).forEach((key) => {
      formData.append(key, metadata[key]);
    });
    const response = await this.client.post('/attachments', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async getAttachments(projectId: string, category?: string) {
    const response = await this.client.get(`/attachments/project/${projectId}`, {
      params: { category },
    });
    return response.data;
  }

  async deleteAttachment(id: string) {
    const response = await this.client.delete(`/attachments/${id}`);
    return response.data;
  }

  async syncPush(operations: any[], deviceId: string) {
    const response = await this.client.post('/sync/push', { operations, deviceId });
    return response.data;
  }

  async syncPull(lastSync: number, deviceId: string) {
    const response = await this.client.get('/sync/pull', {
      params: { lastSync, deviceId },
    });
    return response.data;
  }

  async getLastSyncTime() {
    const response = await this.client.get('/sync/last');
    return response.data;
  }

  async resolveConflict(id: string, resolution: 'local' | 'remote' | 'merge', mergedData?: any) {
    const response = await this.client.post(`/sync/conflict/${id}`, { resolution, mergedData });
    return response.data;
  }
}

export const apiService = new ApiService();

