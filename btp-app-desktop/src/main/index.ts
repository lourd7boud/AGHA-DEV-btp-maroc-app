/**
 * BTP Desktop - Main Process Entry
 * 
 * This is the main entry point for the Electron application.
 * It creates the main window and loads the web build.
 * 
 * ⚠️ IMPORTANT: No business logic here - this is just a wrapper!
 */

import { app, BrowserWindow, shell, ipcMain, dialog, nativeTheme, screen, globalShortcut } from 'electron';
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

  // Get primary display dimensions for responsive window size
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  
  // Calculate optimal window size (85% of screen, with min/max limits)
  const windowWidth = Math.min(Math.max(Math.round(screenWidth * 0.85), 1024), 1920);
  const windowHeight = Math.min(Math.max(Math.round(screenHeight * 0.85), 700), 1080);
  
  log.info(`Screen size: ${screenWidth}x${screenHeight}`);
  log.info(`Window size: ${windowWidth}x${windowHeight}`);

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: 1024,
    minHeight: 700,
    title: 'BTP Desktop',
    icon: join(__dirname, '../../resources/icon.png'),
    show: false, // Don't show until ready
    center: true, // Center the window on screen
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a2e' : '#ffffff',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      zoomFactor: 1.0, // Start with 100% zoom
    },
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    log.info('Window ready to show');
    
    // Auto-adjust zoom based on screen DPI/scale factor
    const scaleFactor = primaryDisplay.scaleFactor;
    log.info(`Display scale factor: ${scaleFactor}`);
    
    // Adjust zoom for high DPI displays
    if (scaleFactor > 1.25) {
      const adjustedZoom = 1 / scaleFactor * 1.1; // Slight boost for readability
      mainWindow?.webContents.setZoomFactor(Math.max(adjustedZoom, 0.8));
      log.info(`Adjusted zoom factor: ${adjustedZoom}`);
    }
    
    mainWindow?.show();
    
    // Maximize on smaller screens for better usability
    if (screenWidth <= 1366 || screenHeight <= 768) {
      mainWindow?.maximize();
      log.info('Maximized window for small screen');
    }
    
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
    // DEBUG: Open DevTools in production to diagnose issues
    mainWindow.webContents.openDevTools();
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

  // Register zoom shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control || input.meta) {
      if (input.key === '=' || input.key === '+') {
        // Zoom in: Ctrl/Cmd + =
        const currentZoom = mainWindow?.webContents.getZoomFactor() || 1;
        mainWindow?.webContents.setZoomFactor(Math.min(currentZoom + 0.1, 2.0));
        event.preventDefault();
      } else if (input.key === '-') {
        // Zoom out: Ctrl/Cmd + -
        const currentZoom = mainWindow?.webContents.getZoomFactor() || 1;
        mainWindow?.webContents.setZoomFactor(Math.max(currentZoom - 0.1, 0.5));
        event.preventDefault();
      } else if (input.key === '0') {
        // Reset zoom: Ctrl/Cmd + 0
        mainWindow?.webContents.setZoomFactor(1.0);
        event.preventDefault();
      }
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
