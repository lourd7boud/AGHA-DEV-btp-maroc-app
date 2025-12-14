import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiService } from '../services/apiService';
import { db, User } from '../db/database';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; firstName: string; lastName: string }) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isLoading: false,
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

          set({ user, token, isLoading: false });
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

          set({ user, token, isLoading: false });
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
        set({ user: null, token: null, error: null });
      },

      checkAuth: async () => {
        const token = localStorage.getItem('authToken');
        if (!token) {
          set({ user: null, token: null, error: null });
          return;
        }

        try {
          const response = await apiService.getCurrentUser();
          const user = response.data;
          set({ user, token, error: null });
        } catch (error: any) {
          // Token invalide ou expiré, déconnecter
          console.log('🔒 Auth check failed, logging out:', error.response?.status);
          localStorage.removeItem('authToken');
          localStorage.removeItem('auth-storage');
          localStorage.removeItem('lastSyncTimestamp');
          set({ user: null, token: null, error: null });
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, token: state.token }),
    }
  )
);
