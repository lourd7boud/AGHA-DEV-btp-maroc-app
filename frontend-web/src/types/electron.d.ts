// TypeScript declarations for Electron API
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

interface ElectronAPI {
  // App info
  getAppVersion: () => Promise<string>;
  getAppPath: (name: string) => Promise<string>;
  
  // Update functions
  checkForUpdates: () => Promise<{ success?: boolean; error?: string; updateInfo?: any }>;
  downloadUpdate: () => Promise<{ success?: boolean; error?: string }>;
  installUpdate: () => Promise<void>;
  
  // Update event listeners
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void;
  onUpdateNotAvailable: (callback: (info: { version: string }) => void) => () => void;
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => () => void;
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => () => void;
  onUpdateError: (callback: (error: { message: string }) => void) => () => void;
}

interface Window {
  electron?: ElectronAPI;
}
