/**
 * BTP Desktop - Preload Script
 * 
 * This script runs in the renderer process but has access to Node.js APIs.
 * It exposes a safe API to the renderer through contextBridge.
 * 
 * ⚠️ IMPORTANT: Only expose what's necessary - keep the surface area minimal!
 */

import { contextBridge, ipcRenderer } from 'electron';

/**
 * Electron API exposed to the renderer
 */
const electronAPI = {
  // ============================================
  // Platform Info
  // ============================================
  
  /** Check if running in Electron */
  isElectron: true,
  
  /** Get current platform */
  platform: process.platform as 'win32' | 'darwin' | 'linux',
  
  /** API URL for backend connection */
  apiUrl: 'https://marocinfra.com',
  
  /** Get app version */
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  
  /** Get app version (alias for compatibility) */
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  
  /** Get full app info */
  getAppInfo: (): Promise<{
    version: string;
    platform: string;
    arch: string;
    electron: string;
    node: string;
    isPackaged: boolean;
  }> => ipcRenderer.invoke('app:info'),

  // ============================================
  // File System Operations
  // ============================================
  
  /**
   * Save file with dialog
   * @param data - File data as Uint8Array
   * @param defaultName - Default file name
   */
  saveFile: (data: Uint8Array, defaultName: string): Promise<{
    success: boolean;
    filePath?: string;
    canceled?: boolean;
    error?: string;
  }> => ipcRenderer.invoke('fs:save', data, defaultName),

  /**
   * Save file to specific path (no dialog)
   * @param data - File data as Uint8Array
   * @param filePath - Target file path
   */
  saveToPath: (data: Uint8Array, filePath: string): Promise<{
    success: boolean;
    filePath?: string;
    error?: string;
  }> => ipcRenderer.invoke('fs:saveToPath', data, filePath),

  /**
   * Open file in default application
   * @param filePath - File path to open
   */
  openFile: (filePath: string): Promise<{
    success: boolean;
    error?: string;
  }> => ipcRenderer.invoke('fs:open', filePath),

  /**
   * Show file in folder
   * @param filePath - File path
   */
  showInFolder: (filePath: string): Promise<{
    success: boolean;
    error?: string;
  }> => ipcRenderer.invoke('fs:showInFolder', filePath),

  /**
   * Select folder dialog
   */
  selectFolder: (): Promise<{
    success: boolean;
    folderPath?: string;
    canceled?: boolean;
    error?: string;
  }> => ipcRenderer.invoke('fs:selectFolder'),

  // ============================================
  // Shell Operations
  // ============================================

  /**
   * Open URL in default browser
   * @param url - URL to open
   */
  openExternal: (url: string): Promise<{
    success: boolean;
    error?: string;
  }> => ipcRenderer.invoke('shell:openExternal', url),

  // ============================================
  // Clipboard Operations
  // ============================================

  /**
   * Write text to clipboard
   * @param text - Text to copy
   */
  copyToClipboard: (text: string): Promise<{
    success: boolean;
  }> => ipcRenderer.invoke('clipboard:writeText', text),

  /**
   * Read text from clipboard
   */
  readFromClipboard: (): Promise<string> => ipcRenderer.invoke('clipboard:readText'),

  // ============================================
  // Dialog Operations
  // ============================================

  /**
   * Show message dialog
   */
  showMessage: (options: {
    type?: 'none' | 'info' | 'error' | 'question' | 'warning';
    title?: string;
    message: string;
    detail?: string;
    buttons?: string[];
  }): Promise<{ response: number }> => ipcRenderer.invoke('dialog:showMessage', options),

  /**
   * Show error dialog
   */
  showError: (title: string, content: string): Promise<void> => 
    ipcRenderer.invoke('dialog:showError', title, content),

  // ============================================
  // Event Listeners
  // ============================================

  /**
   * Listen for network status changes
   */
  onNetworkChange: (callback: (isOnline: boolean) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, isOnline: boolean) => callback(isOnline);
    ipcRenderer.on('network:status', handler);
    return () => ipcRenderer.removeListener('network:status', handler);
  },

  /**
   * Listen for navigation requests from tray
   */
  onNavigate: (callback: (path: string) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, path: string) => callback(path);
    ipcRenderer.on('navigate', handler);
    return () => ipcRenderer.removeListener('navigate', handler);
  },

  // ============================================
  // Update Events
  // ============================================

  /**
   * Listen for update events
   */
  onUpdateChecking: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('update:checking', handler);
    return () => ipcRenderer.removeListener('update:checking', handler);
  },

  onUpdateAvailable: (callback: (info: any) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, info: any) => callback(info);
    ipcRenderer.on('update:available', handler);
    return () => ipcRenderer.removeListener('update:available', handler);
  },

  onUpdateNotAvailable: (callback: (info: any) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, info: any) => callback(info);
    ipcRenderer.on('update:not-available', handler);
    return () => ipcRenderer.removeListener('update:not-available', handler);
  },

  onUpdateProgress: (callback: (progress: { percent: number }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, progress: any) => callback(progress);
    ipcRenderer.on('update:progress', handler);
    return () => ipcRenderer.removeListener('update:progress', handler);
  },

  onUpdateDownloaded: (callback: (info: any) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, info: any) => callback(info);
    ipcRenderer.on('update:downloaded', handler);
    return () => ipcRenderer.removeListener('update:downloaded', handler);
  },

  onUpdateError: (callback: (error: string) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, error: string) => callback(error);
    ipcRenderer.on('update:error', handler);
    return () => ipcRenderer.removeListener('update:error', handler);
  },
};

// Expose the API to the renderer (both names for compatibility)
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
contextBridge.exposeInMainWorld('electron', electronAPI);

// Type declaration for the global window object
declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}

console.log('BTP Desktop preload script loaded');
