/**
 * Auto Updater Service
 * 
 * Handles automatic updates from GitHub Releases.
 */

import { BrowserWindow, dialog } from 'electron';
import { AppUpdater } from 'electron-updater';
import log from 'electron-log';

/**
 * Setup auto updater
 */
export function setupAutoUpdater(
  autoUpdater: AppUpdater,
  mainWindow: BrowserWindow | null
): void {
  log.info('Setting up auto updater...');

  // Configure auto updater
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // Logging
  autoUpdater.logger = log;

  // Check for updates on startup
  autoUpdater.checkForUpdates().catch((err) => {
    log.error('Error checking for updates:', err);
  });

  // ============================================
  // Event Handlers
  // ============================================

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...');
    notifyRenderer('update:checking');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version);
    notifyRenderer('update:available', info);

    // Show dialog to user
    dialog.showMessageBox({
      type: 'info',
      title: 'Mise à jour disponible',
      message: `Une nouvelle version (${info.version}) est disponible.`,
      detail: 'Voulez-vous la télécharger maintenant?',
      buttons: ['Télécharger', 'Plus tard'],
      defaultId: 0,
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('No update available, current version is latest');
    notifyRenderer('update:not-available', info);
  });

  autoUpdater.on('download-progress', (progress) => {
    log.info(`Download progress: ${progress.percent.toFixed(2)}%`);
    notifyRenderer('update:progress', progress);
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info.version);
    notifyRenderer('update:downloaded', info);

    // Show dialog to restart
    dialog.showMessageBox({
      type: 'info',
      title: 'Mise à jour prête',
      message: 'La mise à jour a été téléchargée.',
      detail: 'L\'application va redémarrer pour installer la mise à jour.',
      buttons: ['Redémarrer maintenant', 'Plus tard'],
      defaultId: 0,
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });
  });

  autoUpdater.on('error', (error) => {
    log.error('Auto updater error:', error);
    notifyRenderer('update:error', error.message);
  });

  // Helper to notify renderer
  function notifyRenderer(channel: string, data?: any) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
  }

  log.info('Auto updater setup complete');
}

/**
 * Manually check for updates
 */
export async function checkForUpdates(autoUpdater: AppUpdater): Promise<void> {
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    log.error('Error checking for updates:', error);
    throw error;
  }
}
