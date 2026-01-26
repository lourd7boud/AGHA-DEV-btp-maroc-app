/**
 * IPC Handlers Registry
 * 
 * Registers all IPC handlers for communication between main and renderer processes.
 */

import { IpcMain, dialog, shell, app, clipboard, nativeImage } from 'electron';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import log from 'electron-log';

/**
 * Register all IPC handlers
 */
export function registerIpcHandlers(ipcMain: IpcMain): void {
  log.info('Registering IPC handlers...');

  // ============================================
  // App Info
  // ============================================
  
  ipcMain.handle('app:version', () => {
    return app.getVersion();
  });

  ipcMain.handle('app:platform', () => {
    return process.platform;
  });

  ipcMain.handle('app:info', () => {
    return {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      node: process.versions.node,
      isPackaged: app.isPackaged,
    };
  });

  // ============================================
  // File System Operations
  // ============================================

  /**
   * Save file with dialog
   */
  ipcMain.handle('fs:save', async (_, data: Uint8Array, defaultName: string) => {
    try {
      const result = await dialog.showSaveDialog({
        defaultPath: defaultName,
        filters: [
          { name: 'PDF Documents', extensions: ['pdf'] },
          { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        log.info('File save canceled by user');
        return { success: false, canceled: true };
      }

      // Ensure directory exists
      const dir = dirname(result.filePath);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }

      // Write file
      await writeFile(result.filePath, Buffer.from(data));
      log.info(`File saved: ${result.filePath}`);

      return { 
        success: true, 
        filePath: result.filePath,
        canceled: false,
      };
    } catch (error) {
      log.error('Error saving file:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        canceled: false,
      };
    }
  });

  /**
   * Save file to specific path (no dialog)
   */
  ipcMain.handle('fs:saveToPath', async (_, data: Uint8Array, filePath: string) => {
    try {
      // Ensure directory exists
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }

      // Write file
      await writeFile(filePath, Buffer.from(data));
      log.info(`File saved to path: ${filePath}`);

      return { success: true, filePath };
    } catch (error) {
      log.error('Error saving file to path:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Open file in default application
   */
  ipcMain.handle('fs:open', async (_, filePath: string) => {
    try {
      await shell.openPath(filePath);
      log.info(`Opened file: ${filePath}`);
      return { success: true };
    } catch (error) {
      log.error('Error opening file:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Open folder in file explorer
   */
  ipcMain.handle('fs:showInFolder', async (_, filePath: string) => {
    try {
      shell.showItemInFolder(filePath);
      log.info(`Showing in folder: ${filePath}`);
      return { success: true };
    } catch (error) {
      log.error('Error showing in folder:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Select folder dialog
   */
  ipcMain.handle('fs:selectFolder', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      return { 
        success: true, 
        folderPath: result.filePaths[0],
        canceled: false,
      };
    } catch (error) {
      log.error('Error selecting folder:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        canceled: false,
      };
    }
  });

  // ============================================
  // Shell Operations
  // ============================================

  ipcMain.handle('shell:openExternal', async (_, url: string) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      log.error('Error opening external URL:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // ============================================
  // Clipboard Operations
  // ============================================

  ipcMain.handle('clipboard:writeText', (_, text: string) => {
    clipboard.writeText(text);
    return { success: true };
  });

  ipcMain.handle('clipboard:readText', () => {
    return clipboard.readText();
  });

  // ============================================
  // Dialog Operations
  // ============================================

  ipcMain.handle('dialog:showMessage', async (_, options: Electron.MessageBoxOptions) => {
    const result = await dialog.showMessageBox(options);
    return result;
  });

  ipcMain.handle('dialog:showError', (_, title: string, content: string) => {
    dialog.showErrorBox(title, content);
    return { success: true };
  });

  log.info('IPC handlers registered');
}
