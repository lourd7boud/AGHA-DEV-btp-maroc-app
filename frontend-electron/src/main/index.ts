import { app, BrowserWindow, ipcMain, shell, protocol, session, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { URL } from 'url';
import { autoUpdater } from 'electron-updater';

let mainWindow: BrowserWindow | null = null;

// API URL for production

// API URL configuration
const API_URL = process.env.VITE_API_URL || 'http://162.55.219.151';

console.log('🚀 [MAIN] Starting Electron App...');
console.log('🔧 [MAIN] API_URL:', API_URL);
console.log('🔧 [MAIN] NODE_ENV:', process.env.NODE_ENV);

// ... (existing code)

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '../../build/icon.png'),
    title: 'BTP Maroc - Gestion de Projets',
    backgroundColor: '#ffffff', // Prevent initial black flash
    show: false, // Don't show until ready
  });

  // Show window when ready to prevent flickering
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Handle loading failure
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
    if (process.env.NODE_ENV === 'development') {
      // Retry after delay in dev mode
      setTimeout(() => {
        mainWindow?.loadURL('http://localhost:5173');
      }, 1000);
    }
  });

  // En développement, charger depuis le serveur Vite avec retry
  if (process.env.NODE_ENV === 'development') {
    const loadDevServer = async () => {
      try {
        await mainWindow?.loadURL('http://localhost:5173');
        mainWindow?.webContents.openDevTools();
      } catch (err) {
        console.log('Dev server not ready, retrying...');
        setTimeout(loadDevServer, 1000);
      }
    };
    loadDevServer();
  } else {
    // En production, charger les fichiers buildés
    // Use custom protocol for loading local files which maps to dist/renderer
    mainWindow?.loadURL('app://./index.html');
  }

  // Toggle DevTools with F12
  mainWindow?.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      if (mainWindow?.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow?.webContents.openDevTools();
      }
    }
  });

  // Handle external links
  mainWindow?.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow?.on('closed', () => {
    mainWindow = null;
  });

  // Check for updates after window is ready
  if (process.env.NODE_ENV !== 'development') {
    // Enable auto-update check
    setTimeout(() => {
      checkForUpdates();
    }, 3000);
  }
}

// Auto-update functions
function checkForUpdates() {
  autoUpdater.checkForUpdates().catch(err => {
    console.error('Failed to check for updates:', err);
  });
}

function setupAutoUpdater() {
  // Update available
  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    mainWindow?.webContents.send('update-available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  // Update not available
  autoUpdater.on('update-not-available', (info) => {
    console.log('Update not available. Current version is up to date.');
    mainWindow?.webContents.send('update-not-available', { version: info.version });
  });

  // Download progress
  autoUpdater.on('download-progress', (progressObj) => {
    mainWindow?.webContents.send('download-progress', {
      percent: Math.round(progressObj.percent),
      transferred: progressObj.transferred,
      total: progressObj.total,
      bytesPerSecond: progressObj.bytesPerSecond,
    });
  });

  // Update downloaded
  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    mainWindow?.webContents.send('update-downloaded', {
      version: info.version,
    });
  });

  // Error occurred
  autoUpdater.on('error', (error) => {
    console.error('Auto-updater error:', error);
    mainWindow?.webContents.send('update-error', {
      message: error.message,
    });
  });
}

app.whenReady().then(() => {
  // Register custom protocol for serving local files
  protocol.registerFileProtocol('app', (request, callback) => {
    const url = request.url.replace('app://./', '');
    const decodedUrl = decodeURIComponent(url);
    const filePath = path.join(__dirname, '../renderer', decodedUrl);

    // For SPA routing, serve index.html for non-file requests
    if (fs.existsSync(filePath)) {
      callback({ path: filePath });
    } else {
      // Fallback to index.html for client-side routing
      callback({ path: path.join(__dirname, '../renderer/index.html') });
    }
  });

  // Setup auto-updater event handlers
  setupAutoUpdater();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers pour communication avec le renderer
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-app-path', (_event, name: string) => {
  return app.getPath(name as any);
});

// Auto-updater IPC handlers
ipcMain.handle('check-for-updates', async () => {
  if (process.env.NODE_ENV === 'development') {
    return { error: 'Updates are disabled in development mode' };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, updateInfo: result?.updateInfo };
  } catch (error: any) {
    return { error: error.message };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error: any) {
    return { error: error.message };
  }
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall(false, true);
});
