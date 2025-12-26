/**
 * Asset Service (Unified V1)
 * Single service for all project assets: photos, PV, documents
 * Server-first architecture - no IndexedDB
 */

import { apiService } from './apiService';

export type AssetType = 'photo' | 'pv' | 'document';

export interface ProjectAsset {
  id: string;
  projectId: string;
  type: AssetType;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  createdBy: string;
  createdByName?: string;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt?: string;
}

export interface AssetCounts {
  photos: number;
  pv: number;
  documents: number;
}

export interface CreatePVData {
  pvType: string;
  date: string;
  observations?: string;
  participants?: string[];
}

class AssetService {
  // Note: apiService already has /api as baseURL, so we just use /assets
  private baseUrl = '/assets';

  /**
   * List all assets for a project (optionally filter by type)
   */
  async listAssets(projectId: string, type?: AssetType): Promise<ProjectAsset[]> {
    try {
      const params = type ? `?type=${type}` : '';
      const response = await apiService.get(`${this.baseUrl}/project/${projectId}${params}`);
      return response?.data || [];
    } catch (error) {
      console.error('Error listing assets:', error);
      return [];
    }
  }

  /**
   * Get photos for a project
   */
  async getPhotos(projectId: string): Promise<ProjectAsset[]> {
    return this.listAssets(projectId, 'photo');
  }

  /**
   * Get PVs for a project
   */
  async getPVs(projectId: string): Promise<ProjectAsset[]> {
    return this.listAssets(projectId, 'pv');
  }

  /**
   * Get documents for a project
   */
  async getDocuments(projectId: string): Promise<ProjectAsset[]> {
    return this.listAssets(projectId, 'document');
  }

  /**
   * Get asset counts by type
   */
  async getAssetCounts(projectId: string): Promise<AssetCounts> {
    try {
      const response = await apiService.get(`${this.baseUrl}/project/${projectId}/counts`);
      return response?.data || { photos: 0, pv: 0, documents: 0 };
    } catch (error) {
      console.error('Error getting asset counts:', error);
      return { photos: 0, pv: 0, documents: 0 };
    }
  }

  /**
   * Upload multiple photos
   */
  async uploadPhotos(
    projectId: string,
    files: File[],
    onProgress?: (progress: number) => void
  ): Promise<ProjectAsset[]> {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });

    try {
      const response = await apiService.postFormData(
        `${this.baseUrl}/project/${projectId}/photos`,
        formData,
        onProgress
      );
      return response?.data || [];
    } catch (error) {
      console.error('Error uploading photos:', error);
      throw error;
    }
  }

  /**
   * Upload a single document
   */
  async uploadDocument(
    projectId: string,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<ProjectAsset> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', 'document');

    try {
      const response = await apiService.postFormData(
        `${this.baseUrl}/project/${projectId}/upload`,
        formData,
        onProgress
      );
      return response?.data;
    } catch (error) {
      console.error('Error uploading document:', error);
      throw error;
    }
  }

  /**
   * Create a PV (generates PDF on server)
   */
  async createPV(projectId: string, data: CreatePVData): Promise<ProjectAsset> {
    try {
      const response = await apiService.post(`${this.baseUrl}/project/${projectId}/pv`, data);
      return response?.data;
    } catch (error) {
      console.error('Error creating PV:', error);
      throw error;
    }
  }

  /**
   * Delete an asset
   */
  async deleteAsset(assetId: string): Promise<void> {
    try {
      await apiService.delete(`${this.baseUrl}/${assetId}`);
    } catch (error) {
      console.error('Error deleting asset:', error);
      throw error;
    }
  }

  /**
   * Get full URL for an asset
   */
  getAssetUrl(storagePath: string): string {
    // In production, storagePath is like /uploads/...
    // The server serves static files at /uploads
    if (storagePath.startsWith('http')) {
      return storagePath;
    }
    
    // For relative paths, prepend the API base URL
    const baseUrl = window.location.origin;
    return `${baseUrl}${storagePath}`;
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export const assetService = new AssetService();
