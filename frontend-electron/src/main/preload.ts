import { contextBridge, ipcRenderer } from 'electron';

// Types for update info
interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
}

interface DownloadProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

// CRITICAL: Expose API_URL to renderer
const API_URL = process.env.VITE_API_URL || 'http://162.55.219.151';

console.log('🔧 [PRELOAD] API_URL:', API_URL);
console.log('🔧 [PRELOAD] Initializing context bridge...');

// Exposer des APIs sécurisées au renderer
contextBridge.exposeInMainWorld('electron', {
  // CRITICAL: API configuration
  apiUrl: API_URL,
  
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppPath: (name: string) => ipcRenderer.invoke('get-app-path', name),
  
  // Update functions
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  
  // Update event listeners
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => {
    const listener = (_event: any, info: UpdateInfo) => callback(info);
    ipcRenderer.on('update-available', listener);
    return () => ipcRenderer.removeListener('update-available', listener);
  },
  
  onUpdateNotAvailable: (callback: (info: { version: string }) => void) => {
    const listener = (_event: any, info: { version: string }) => callback(info);
    ipcRenderer.on('update-not-available', listener);
    return () => ipcRenderer.removeListener('update-not-available', listener);
  },
  
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => {
    const listener = (_event: any, progress: DownloadProgress) => callback(progress);
    ipcRenderer.on('download-progress', listener);
    return () => ipcRenderer.removeListener('download-progress', listener);
  },
  
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    const listener = (_event: any, info: { version: string }) => callback(info);
    ipcRenderer.on('update-downloaded', listener);
    return () => ipcRenderer.removeListener('update-downloaded', listener);
  },
  
  onUpdateError: (callback: (error: { message: string }) => void) => {
    const listener = (_event: any, error: { message: string }) => callback(error);
    ipcRenderer.on('update-error', listener);
    return () => ipcRenderer.removeListener('update-error', listener);
  },
});
