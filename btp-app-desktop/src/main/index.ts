/**
 * BTP Desktop - Main Process Entry
 * 
 * This is the main entry point for the Electron application.
 * It creates the main window and loads the web build.
 * 
 * ⚠️ IMPORTANT: No business logic here - this is just a wrapper!
 */

import { app, BrowserWindow, shell, ipcMain, dialog, nativeTheme } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import { registerIpcHandlers } from './ipc';
import { setupNetworkMonitor } from './services/networkMonitor';
import { setupTray } from './services/tray';
import { setupAutoUpdater } from './services/autoUpdater';

// Configure logging
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// Log app info
log.info('='.repeat(50));
log.info(`BTP Desktop v${app.getVersion()} starting...`);
log.info(`Platform: ${process.platform}`);
log.info(`Arch: ${process.arch}`);
log.info(`Electron: ${process.versions.electron}`);
log.info(`Node: ${process.versions.node}`);
log.info('='.repeat(50));

// Keep a global reference of the window object
let mainWindow: BrowserWindow | null = null;

// Check if we're in development mode
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

/**
 * Create the main application window
 */
async function createWindow(): Promise<void> {
  log.info('Creating main window...');
  
  // Get the preload script path
  const preloadPath = join(__dirname, '../preload/index.js');
  
  if (!existsSync(preloadPath)) {
    log.error(`Preload script not found at: ${preloadPath}`);
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: 'BTP Desktop',
    icon: join(__dirname, '../../resources/icon.png'),
    show: false, // Don't show until ready
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a2e' : '#ffffff',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    log.info('Window ready to show');
    mainWindow?.show();
    
    // Focus the window
    if (mainWindow?.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow?.focus();
  });

  // Load the web build
  const rendererPath = join(__dirname, '../../renderer/index.html');
  
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    // In development, load from Vite dev server
    log.info(`Loading from dev server: ${process.env.VITE_DEV_SERVER_URL}`);
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else if (existsSync(rendererPath)) {
    // In production, load from the renderer folder
    log.info(`Loading from file: ${rendererPath}`);
    await mainWindow.loadFile(rendererPath);
  } else {
    // Fallback: show error
    log.error(`Renderer not found at: ${rendererPath}`);
    dialog.showErrorBox(
      'Erreur de chargement',
      `L'interface utilisateur n'a pas été trouvée.\nChemin attendu: ${rendererPath}\n\nVeuillez réinstaller l'application.`
    );
    app.quit();
    return;
  }

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    log.info(`Opening external URL: ${url}`);
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Handle window close
  mainWindow.on('closed', () => {
    log.info('Main window closed');
    mainWindow = null;
  });

  // Handle navigation (prevent navigating away from the app)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const appUrl = mainWindow?.webContents.getURL();
    if (appUrl && !url.startsWith(appUrl.split('#')[0])) {
      log.info(`Preventing navigation to: ${url}`);
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  log.info('Main window created successfully');
}

/**
 * Initialize the application
 */
async function initialize(): Promise<void> {
  log.info('Initializing application...');
  
  // Register IPC handlers
  registerIpcHandlers(ipcMain);
  
  // Setup network monitor
  setupNetworkMonitor(mainWindow);
  
  // Setup auto updater (only in production)
  if (!isDev) {
    setupAutoUpdater(autoUpdater, mainWindow);
  }
  
  log.info('Application initialized');
}

// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
  await initialize();
  await createWindow();
  
  // Setup tray icon
  setupTray(app, mainWindow);

  // On macOS, re-create window when dock icon is clicked
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  log.info('All windows closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle app quit
app.on('before-quit', () => {
  log.info('Application quitting...');
});

// Handle second instance (single instance lock)
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  log.info('Another instance is already running, quitting...');
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection:', reason);
});
