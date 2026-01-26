/**
 * System Tray Service
 * 
 * Creates and manages the system tray icon.
 */

import { App, BrowserWindow, Menu, Tray, nativeImage } from 'electron';
import { join } from 'path';
import log from 'electron-log';

let tray: Tray | null = null;

/**
 * Setup system tray
 */
export function setupTray(app: App, mainWindow: BrowserWindow | null): void {
  log.info('Setting up system tray...');

  // Get icon path
  const iconPath = join(__dirname, '../../resources/icon.png');
  
  try {
    // Create tray icon
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.resize({ width: 16, height: 16 }));

    // Create context menu
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Ouvrir BTP Desktop',
        click: () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) {
              mainWindow.restore();
            }
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Projets',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.webContents.send('navigate', '/projects');
          }
        },
      },
      {
        label: 'Nouveau Projet',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.webContents.send('navigate', '/create-project');
          }
        },
      },
      { type: 'separator' },
      {
        label: 'À propos',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.webContents.send('navigate', '/settings');
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Quitter',
        click: () => {
          app.quit();
        },
      },
    ]);

    tray.setToolTip('BTP Desktop');
    tray.setContextMenu(contextMenu);

    // Double click to show window
    tray.on('double-click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.show();
        mainWindow.focus();
      }
    });

    log.info('System tray setup complete');
  } catch (error) {
    log.warn('Could not setup system tray:', error);
  }
}

/**
 * Destroy tray
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
