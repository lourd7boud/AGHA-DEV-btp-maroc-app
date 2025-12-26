import axios, { AxiosInstance, AxiosError } from 'axios';

// Use relative URL in production (works with Nginx proxy), full URL in development
const getApiUrl = () => {
  // CRITICAL: Check if Electron context bridge exposed apiUrl
  if (typeof window !== 'undefined' && (window as any).electron?.apiUrl) {
    const electronApiUrl = (window as any).electron.apiUrl;
    console.log('🔌 [API] Using Electron API URL:', electronApiUrl);
    return `${electronApiUrl}/api`;
  }
  
  // In WEB browser (production/staging), ALWAYS use relative path for Nginx proxy
  // This ensures HTTPS pages use HTTPS API (no mixed content)
  // Works for BOTH marocinfra.com AND dev.marocinfra.com
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    console.log('🌐 [API] Web production mode, using relative path /api');
    return '/api';
  }
  
  // Only use VITE_API_URL in localhost development
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl) {
    console.log('🔧 [API] Dev mode, using VITE_API_URL:', envUrl);
    return envUrl;
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
        
        // Check for new token in response headers (auto-refresh from server)
        const newToken = response.headers['x-new-token'];
        if (newToken) {
          console.log('🔄 Token auto-refreshed by server, updating storage');
          this.updateStoredToken(newToken);
        }
        
        return response;
      },
      async (error: AxiosError) => {
        const status = error.response?.status;
        console.error('API Error:', status, error.config?.url, error.response?.data);
        
        const originalRequest = error.config;
        
        // CRITICAL: Server errors (500, 502, 503, 504) should NEVER invalidate the session
        // User should remain authenticated and retry later
        if (status && status >= 500) {
          console.warn(`⚠️ Server error ${status} - session preserved, app will work offline`);
          // Don't logout, don't clear tokens - just reject and let the app handle offline mode
          return Promise.reject(error);
        }
        
        // Network errors (no response) should also preserve session
        if (!error.response && error.code === 'ERR_NETWORK') {
          console.warn('⚠️ Network error - session preserved, app will work offline');
          return Promise.reject(error);
        }
        
        // Only handle 401 for non-auth endpoints and avoid infinite loops
        if (status === 401 && 
            originalRequest &&
            !originalRequest.url?.includes('/auth/login') && 
            !originalRequest.url?.includes('/auth/register') &&
            !originalRequest.url?.includes('/auth/refresh') &&
            !(originalRequest as any)._retry) {
          
          // Mark this request as retried to avoid infinite loops
          (originalRequest as any)._retry = true;
          
          // Try to refresh token
          const token = localStorage.getItem('authToken');
          if (token) {
            try {
              console.log('🔄 Attempting to refresh token...');
              
              // Use a fresh axios instance to avoid interceptor loops
              const refreshAxios = axios.create({
                baseURL: this.client.defaults.baseURL,
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000 // 10s timeout for refresh
              });
              
              const refreshResponse = await refreshAxios.post('/auth/refresh', { token });
              
              if (refreshResponse.data?.data?.token) {
                const newToken = refreshResponse.data.data.token;
                console.log('✅ Token refreshed successfully');
                this.updateStoredToken(newToken);
                
                // Retry original request with new token
                originalRequest.headers = originalRequest.headers || {};
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                return this.client.request(originalRequest);
              }
            } catch (refreshError: any) {
              const refreshStatus = refreshError.response?.status;
              console.log('🔒 Token refresh failed:', refreshStatus || refreshError.message);
              
              // Only logout if refresh truly failed with auth error (not server/network error)
              if (refreshStatus === 401 || refreshStatus === 403) {
                this.handleLogout();
              }
              // For server errors during refresh, preserve session
              if (refreshStatus && refreshStatus >= 500) {
                console.warn('⚠️ Server error during refresh - session preserved');
                return Promise.reject(error);
              }
            }
          } else {
            // No token at all, redirect to login
            this.handleLogout();
          }
        }
        
        return Promise.reject(error);
      }
    );
  }
  
  private updateStoredToken(newToken: string) {
    localStorage.setItem('authToken', newToken);
    
    // Update zustand auth storage
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      try {
        const parsed = JSON.parse(authStorage);
        if (parsed.state) {
          parsed.state.token = newToken;
          localStorage.setItem('auth-storage', JSON.stringify(parsed));
        }
      } catch (e) {
        console.warn('Failed to update auth storage:', e);
      }
    }
  }
  
  private handleLogout() {
    console.log('🚪 Logging out user due to auth failure');
    localStorage.removeItem('authToken');
    localStorage.removeItem('auth-storage');
    localStorage.removeItem('lastSyncTimestamp');
    
    // Check if using hash router or regular router
    const isHashRouter = window.location.hash.includes('#/');
    const currentPath = isHashRouter 
      ? window.location.hash.replace('#', '') 
      : window.location.pathname;
    
    if (!currentPath.includes('/login')) {
      if (isHashRouter) {
        window.location.hash = '#/login';
      } else {
        window.location.href = '/login';
      }
    }
  }

  async refreshToken(token: string) {
    const response = await this.client.post('/auth/refresh', { token });
    return response.data;
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

  // Missing methods
  async getBordereau(id: string) {
    const response = await this.client.get(`/bordereau/${id}`);
    return response.data;
  }

  async createPeriode(data: any) {
    const response = await this.client.post('/periodes', data);
    return response.data;
  }

  async updatePeriode(id: string, data: any) {
    const response = await this.client.put(`/periodes/${id}`, data);
    return response.data;
  }

  async deletePeriode(id: string) {
    const response = await this.client.delete(`/periodes/${id}`);
    return response.data;
  }

  async permanentDeleteProject(id: string) {
    const response = await this.client.delete(`/projects/${id}/permanent`);
    return response.data;
  }

  /**
   * Get unique companies from all existing projects
   * Used for autocomplete suggestions
   */
  async getCompanies(): Promise<{ nom: string; rc?: string; cnss?: string }[]> {
    try {
      const response = await this.getProjects();
      
      // Handle both formats: {success: true, data: [...]} and direct array
      const projects = response?.data || response || [];
      
      // Extract unique companies from projects
      const companiesMap = new Map<string, { nom: string; rc?: string; cnss?: string }>();
      
      if (Array.isArray(projects)) {
        for (const project of projects) {
          const societe = project.societe || project.société;
          if (societe && societe.trim()) {
            const key = societe.trim().toLowerCase();
            if (!companiesMap.has(key)) {
              companiesMap.set(key, {
                nom: societe.trim(),
                rc: project.rc || '',
                cnss: project.cnss || ''
              });
            }
          }
        }
      }
      
      console.log(`📊 ${companiesMap.size} entreprises uniques trouvées`);
      return Array.from(companiesMap.values());
    } catch (error) {
      console.error('Error fetching companies from projects:', error);
      return [];
    }
  }

  // ============================================
  // Generic HTTP methods for extensibility
  // ============================================

  /**
   * Generic GET request
   */
  async get(url: string) {
    const response = await this.client.get(url);
    return response.data;
  }

  /**
   * Generic POST request
   */
  async post(url: string, data: any) {
    const response = await this.client.post(url, data);
    return response.data;
  }

  /**
   * Generic PUT request
   */
  async put(url: string, data: any) {
    const response = await this.client.put(url, data);
    return response.data;
  }

  /**
   * Generic DELETE request
   */
  async delete(url: string) {
    const response = await this.client.delete(url);
    return response.data;
  }

  /**
   * POST with FormData (for file uploads)
   */
  async postFormData(url: string, formData: FormData, onProgress?: (progress: number) => void) {
    const response = await this.client.post(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      },
    });
    return response.data;
  }
}

export const apiService = new ApiService();

