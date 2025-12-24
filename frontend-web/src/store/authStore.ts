import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiService } from '../services/apiService';
import { db, User } from '../db/database';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isInitialized: boolean;  // Track if auth has been checked
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; firstName: string; lastName: string }) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      isInitialized: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiService.login(email, password);
          const { user, token } = response.data;

          // Clear lastSyncTimestamp to force full sync on login
          localStorage.removeItem('lastSyncTimestamp');
          console.log('🔄 Cleared lastSyncTimestamp for full sync');

          // Check trial expiration
          if (user.trialEndDate && new Date(user.trialEndDate) < new Date()) {
            // Update user to inactive in local DB
            await db.users.update(user.id, { isActive: false });
            throw new Error('Votre période d\'essai a expiré. Veuillez contacter l\'administrateur.');
          }

          // Check if account is active
          if (user.isActive === false) {
            throw new Error('Votre compte est désactivé. Veuillez contacter l\'administrateur.');
          }

          // Update last login
          await db.users.update(user.id, { lastLogin: new Date().toISOString() });

          // Store token
          localStorage.setItem('authToken', token);

          // Store user in IndexedDB
          await db.users.put({
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role || 'user',
            isActive: user.isActive ?? true,
            trialEndDate: user.trialEndDate,
            createdBy: user.createdBy,
            createdAt: user.createdAt || new Date().toISOString(),
            lastLogin: new Date().toISOString(),
            token,
          });

          set({ user, token, isLoading: false, isInitialized: true });
        } catch (error: any) {
          set({
            error: error.response?.data?.error?.message || error.message || 'Login failed',
            isLoading: false,
          });
          throw error;
        }
      },

      register: async (data) => {
        set({ isLoading: true, error: null });
        try {
          console.log('🔵 Sending registration request:', data);
          const response = await apiService.register(data);
          console.log('🟢 Registration response:', response);
          const { user, token } = response.data;

          localStorage.setItem('authToken', token);

          await db.users.put({
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            isActive: user.isActive ?? true,
            createdAt: user.createdAt || new Date().toISOString(),
            token,
          });

          set({ user, token, isLoading: false, isInitialized: true });
        } catch (error: any) {
          console.error('🔴 Registration error:', error);
          console.error('🔴 Error response:', error.response);
          const errorMessage = error.response?.data?.error?.message || error.message || 'Registration failed';
          set({
            error: errorMessage,
            isLoading: false,
          });
          throw error;
        }
      },

      logout: () => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('lastSyncTimestamp');
        localStorage.removeItem('auth-storage');
        set({ user: null, token: null, error: null, isInitialized: true });
      },

      refreshToken: async () => {
        const token = localStorage.getItem('authToken');
        if (!token) return false;
        
        try {
          console.log('🔄 Attempting to refresh token from authStore...');
          const response = await apiService.refreshToken(token);
          if (response.data?.token) {
            const newToken = response.data.token;
            localStorage.setItem('authToken', newToken);
            set((state) => ({ ...state, token: newToken }));
            console.log('✅ Token refreshed successfully in authStore');
            return true;
          }
          return false;
        } catch (error) {
          console.error('🔒 Token refresh failed in authStore');
          return false;
        }
      },

      checkAuth: async () => {
        const token = localStorage.getItem('authToken');
        
        if (!token) {
          console.log('🔒 No token found, setting initialized');
          set({ user: null, token: null, error: null, isInitialized: true });
          return;
        }

        // If we already have a valid user and token match, skip API call
        const currentState = get();
        if (currentState.user && currentState.token === token && currentState.isInitialized) {
          console.log('✅ Auth already validated, skipping API call');
          return;
        }

        try {
          set({ isLoading: true });
          console.log('🔍 Checking auth with server...');
          const response = await apiService.getCurrentUser();
          const user = response.data;
          
          // Check if token was refreshed during the call (via X-New-Token header)
          const latestToken = localStorage.getItem('authToken') || token;
          
          console.log('✅ Auth check successful for user:', user.email);
          set({ user, token: latestToken, error: null, isInitialized: true, isLoading: false });
        } catch (error: any) {
          console.log('🔒 Auth check failed:', error.response?.status || error.message);
          
          // The apiService interceptor will handle token refresh and logout
          // Only clear state if we don't have a token anymore (interceptor logged out)
          const currentToken = localStorage.getItem('authToken');
          if (!currentToken) {
            console.log('🔒 Token was cleared by interceptor, clearing state');
            set({ user: null, token: null, error: null, isInitialized: true, isLoading: false });
          } else {
            // Token still exists, maybe refresh succeeded - try one more time
            try {
              console.log('🔄 Retrying auth check after potential refresh...');
              const retryResponse = await apiService.getCurrentUser();
              const retryUser = retryResponse.data;
              const retryToken = localStorage.getItem('authToken') || token;
              console.log('✅ Retry successful for user:', retryUser.email);
              set({ user: retryUser, token: retryToken, error: null, isInitialized: true, isLoading: false });
            } catch (retryError) {
              console.log('🔒 Retry also failed, clearing state');
              localStorage.removeItem('authToken');
              localStorage.removeItem('auth-storage');
              localStorage.removeItem('lastSyncTimestamp');
              set({ user: null, token: null, error: null, isInitialized: true, isLoading: false });
            }
          }
        }
      },
    }),
    {
      name: 'auth-storage',
      // CRITICAL: Do NOT persist isInitialized - it must be false on page load
      // Only persist user and token
      partialize: (state) => ({ user: state.user, token: state.token }),
    }
  )
);
