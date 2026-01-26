/**
 * Network Monitor Service
 * 
 * Monitors network connectivity and notifies the renderer process.
 */

import { BrowserWindow } from 'electron';
import log from 'electron-log';

let isOnline = true;
let checkInterval: NodeJS.Timeout | null = null;

/**
 * Check if we have internet connectivity
 */
async function checkConnectivity(): Promise<boolean> {
  try {
    // Try to fetch a small resource
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch('https://marocinfra.com/api/health', {
      method: 'HEAD',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Setup network monitoring
 */
export function setupNetworkMonitor(mainWindow: BrowserWindow | null): void {
  log.info('Setting up network monitor...');

  // Check connectivity periodically
  const checkAndNotify = async () => {
    const wasOnline = isOnline;
    isOnline = await checkConnectivity();
    
    // Notify renderer if status changed
    if (wasOnline !== isOnline && mainWindow && !mainWindow.isDestroyed()) {
      log.info(`Network status changed: ${isOnline ? 'online' : 'offline'}`);
      mainWindow.webContents.send('network:status', isOnline);
    }
  };

  // Initial check
  checkAndNotify();

  // Check every 30 seconds
  checkInterval = setInterval(checkAndNotify, 30000);

  log.info('Network monitor setup complete');
}

/**
 * Stop network monitoring
 */
export function stopNetworkMonitor(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}

/**
 * Get current network status
 */
export function getNetworkStatus(): boolean {
  return isOnline;
}
