/**
 * Project Asset Controller (Unified V1)
 * Single controller for all project assets: photos, PV, documents
 * 
 * Architecture: One table, one API, different types
 */

import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { getPool } from '../config/postgres';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import PDFDocument from 'pdfkit';

// Valid asset types
type AssetType = 'photo' | 'pv' | 'document';

/**
 * Fix UTF-8 encoding for filenames from browser uploads
 * Browsers sometimes send filenames in Latin-1 encoding
 */
function fixFilenameEncoding(filename: string): string {
  try {
    // Try to decode as Latin-1 then re-encode as UTF-8
    const decoded = Buffer.from(filename, 'latin1').toString('utf8');
    // Check if the result looks valid (no replacement characters)
    if (!decoded.includes('\ufffd') && decoded !== filename) {
      return decoded;
    }
    return filename;
  } catch {
    return filename;
  }
}

/**
 * List assets by project and type
 */
export const listAssets = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { projectId } = req.params;
    const { type } = req.query;

    const pool = getPool();

    // Build query
    let query = `
      SELECT pa.*, u.first_name, u.last_name 
      FROM project_assets pa
      LEFT JOIN users u ON pa.created_by = u.id
      WHERE pa.project_id = $1 AND pa.deleted_at IS NULL
    `;
    const params: any[] = [projectId];

    if (type && ['photo', 'pv', 'document'].includes(type as string)) {
      query += ` AND pa.type = $2`;
      params.push(type);
    }

    query += ` ORDER BY pa.created_at DESC`;

    const result = await pool.query(query, params);

    // Transform to camelCase
    const assets = result.rows.map(row => ({
      id: row.id,
      projectId: row.project_id,
      type: row.type,
      fileName: row.file_name,
      originalName: row.original_name,
      mimeType: row.mime_type,
      fileSize: row.file_size,
      storagePath: row.storage_path,
      createdBy: row.created_by,
      createdByName: row.first_name && row.last_name 
        ? `${row.first_name} ${row.last_name}` 
        : null,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    res.json({
      success: true,
      data: assets,
      count: assets.length,
    });
  } catch (error) {
    logger.error('Error listing assets:', error);
    next(error);
  }
};

/**
 * Upload asset (photo or document)
 */
export const uploadAsset = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);
    if (!req.file) throw new ApiError('No file uploaded', 400);

    const { projectId } = req.params;
    const { type } = req.body;

    // Validate type
    if (!type || !['photo', 'document'].includes(type)) {
      throw new ApiError('Invalid asset type. Must be "photo" or "document"', 400);
    }

    const pool = getPool();

    // Verify project exists
    const project = await pool.query(
      'SELECT id, folder_path FROM projects WHERE id = $1 AND deleted_at IS NULL',
      [projectId]
    );

    if (project.rows.length === 0) {
      throw new ApiError('Project not found', 404);
    }

    const folderPath = project.rows[0].folder_path || projectId;

    // Determine subfolder based on type
    const subfolder = type === 'photo' ? 'Photos' : 'Documents';

    // Create destination path
    const destDir = path.join(process.cwd(), 'uploads', folderPath, subfolder);
    await fs.mkdir(destDir, { recursive: true });

    // Generate unique filename
    const ext = path.extname(req.file.originalname);
    const uniqueName = `${uuidv4()}${ext}`;
    const destPath = path.join(destDir, uniqueName);

    // Move file from temp to destination
    await fs.rename(req.file.path, destPath);

    // Storage path (relative URL)
    const storagePath = `/uploads/${folderPath}/${subfolder}/${uniqueName}`;

    // Fix filename encoding
    const originalName = fixFilenameEncoding(req.file.originalname);

    // Insert into database
    const assetId = uuidv4();
    const result = await pool.query(
      `INSERT INTO project_assets (
        id, project_id, type, file_name, original_name, mime_type, file_size, storage_path, created_by, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        assetId,
        projectId,
        type,
        uniqueName,
        originalName,
        req.file.mimetype,
        req.file.size,
        storagePath,
        req.user.id,
        JSON.stringify({})
      ]
    );

    const asset = result.rows[0];

    logger.info(`Asset uploaded: ${assetId} (${type})`);

    res.status(201).json({
      success: true,
      data: {
        id: asset.id,
        projectId: asset.project_id,
        type: asset.type,
        fileName: asset.file_name,
        originalName: asset.original_name,
        mimeType: asset.mime_type,
        fileSize: asset.file_size,
        storagePath: asset.storage_path,
        createdBy: asset.created_by,
        metadata: asset.metadata,
        createdAt: asset.created_at,
      },
    });
  } catch (error) {
    logger.error('Error uploading asset:', error);
    next(error);
  }
};

/**
 * Upload multiple photos at once
 */
export const uploadMultiplePhotos = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      throw new ApiError('No files uploaded', 400);
    }

    const { projectId } = req.params;
    const pool = getPool();

    // Verify project exists
    const project = await pool.query(
      'SELECT id, folder_path FROM projects WHERE id = $1 AND deleted_at IS NULL',
      [projectId]
    );

    if (project.rows.length === 0) {
      throw new ApiError('Project not found', 404);
    }

    const folderPath = project.rows[0].folder_path || projectId;
    const destDir = path.join(process.cwd(), 'uploads', folderPath, 'Photos');
    await fs.mkdir(destDir, { recursive: true });

    const uploadedAssets = [];

    for (const file of req.files) {
      try {
        const ext = path.extname(file.originalname);
        const uniqueName = `${uuidv4()}${ext}`;
        const destPath = path.join(destDir, uniqueName);

        await fs.rename(file.path, destPath);

        const storagePath = `/uploads/${folderPath}/Photos/${uniqueName}`;
        const assetId = uuidv4();

        // Fix filename encoding
        const originalName = fixFilenameEncoding(file.originalname);

        const result = await pool.query(
          `INSERT INTO project_assets (
            id, project_id, type, file_name, original_name, mime_type, file_size, storage_path, created_by
          ) VALUES ($1, $2, 'photo', $3, $4, $5, $6, $7, $8)
          RETURNING *`,
          [assetId, projectId, uniqueName, originalName, file.mimetype, file.size, storagePath, req.user.id]
        );

        uploadedAssets.push({
          id: result.rows[0].id,
          fileName: result.rows[0].file_name,
          originalName: result.rows[0].original_name,
          storagePath: result.rows[0].storage_path,
          fileSize: result.rows[0].file_size,
        });
      } catch (fileError) {
        logger.error(`Error processing file ${file.originalname}:`, fileError);
      }
    }

    logger.info(`${uploadedAssets.length} photos uploaded for project ${projectId}`);

    res.status(201).json({
      success: true,
      data: uploadedAssets,
      count: uploadedAssets.length,
    });
  } catch (error) {
    logger.error('Error uploading multiple photos:', error);
    next(error);
  }
};

/**
 * Create PV (Procès-Verbal) with PDF generation
 */
export const createPV = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { projectId } = req.params;
    const { pvType, date, observations, participants } = req.body;

    if (!pvType || !date) {
      throw new ApiError('PV type and date are required', 400);
    }

    const pool = getPool();

    // Get project info for PDF
    const projectResult = await pool.query(
      `SELECT p.*, u.first_name, u.last_name 
       FROM projects p 
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      throw new ApiError('Project not found', 404);
    }

    const project = projectResult.rows[0];
    const folderPath = project.folder_path || projectId;

    // Create PV folder
    const pvDir = path.join(process.cwd(), 'uploads', folderPath, 'PV');
    await fs.mkdir(pvDir, { recursive: true });

    // Generate PDF
    const pvId = uuidv4();
    const pdfFileName = `PV_${pvType.replace(/\s+/g, '_')}_${date}_${pvId.substring(0, 8)}.pdf`;
    const pdfPath = path.join(pvDir, pdfFileName);

    await generatePVPdf(pdfPath, {
      pvType,
      date,
      observations,
      participants,
      project: {
        marcheNo: project.marche_no,
        objet: project.objet,
        societe: project.societe,
      },
      createdBy: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email,
    });

    // Get file size
    const stats = await fs.stat(pdfPath);
    const storagePath = `/uploads/${folderPath}/PV/${pdfFileName}`;

    // Save to database
    const result = await pool.query(
      `INSERT INTO project_assets (
        id, project_id, type, file_name, original_name, mime_type, file_size, storage_path, created_by, metadata
      ) VALUES ($1, $2, 'pv', $3, $4, 'application/pdf', $5, $6, $7, $8)
      RETURNING *`,
      [
        pvId,
        projectId,
        pdfFileName,
        pdfFileName,
        stats.size,
        storagePath,
        req.user.id,
        JSON.stringify({ pvType, date, observations, participants })
      ]
    );

    logger.info(`PV created: ${pvId}`);

    res.status(201).json({
      success: true,
      data: {
        id: result.rows[0].id,
        projectId: result.rows[0].project_id,
        type: 'pv',
        fileName: result.rows[0].file_name,
        storagePath: result.rows[0].storage_path,
        metadata: result.rows[0].metadata,
        createdAt: result.rows[0].created_at,
      },
    });
  } catch (error) {
    logger.error('Error creating PV:', error);
    next(error);
  }
};

/**
 * Generate PV PDF document
 */
async function generatePVPdf(
  filePath: string,
  data: {
    pvType: string;
    date: string;
    observations?: string;
    participants?: string[];
    project: { marcheNo: string; objet: string; societe: string };
    createdBy: string;
  }
) {
  return new Promise<void>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = require('fs').createWriteStream(filePath);
      
      doc.pipe(stream);

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text('PROCÈS-VERBAL', { align: 'center' });
      doc.moveDown();
      doc.fontSize(16).text(data.pvType.toUpperCase(), { align: 'center' });
      doc.moveDown(2);

      // Project info
      doc.fontSize(12).font('Helvetica-Bold').text('Marché N°: ', { continued: true });
      doc.font('Helvetica').text(data.project.marcheNo || '-');
      
      doc.font('Helvetica-Bold').text('Objet: ', { continued: true });
      doc.font('Helvetica').text(data.project.objet || '-');
      
      doc.font('Helvetica-Bold').text('Société: ', { continued: true });
      doc.font('Helvetica').text(data.project.societe || '-');
      
      doc.moveDown();
      doc.font('Helvetica-Bold').text('Date: ', { continued: true });
      doc.font('Helvetica').text(data.date);

      doc.moveDown(2);

      // Observations
      if (data.observations) {
        doc.font('Helvetica-Bold').text('Observations:');
        doc.moveDown(0.5);
        doc.font('Helvetica').text(data.observations);
        doc.moveDown(2);
      }

      // Participants
      if (data.participants && data.participants.length > 0) {
        doc.font('Helvetica-Bold').text('Participants:');
        doc.moveDown(0.5);
        data.participants.forEach(p => {
          doc.font('Helvetica').text(`• ${p}`);
        });
        doc.moveDown(2);
      }

      // Signatures section
      doc.moveDown(3);
      doc.font('Helvetica-Bold').text('Signatures:', { underline: true });
      doc.moveDown(2);

      // Two columns for signatures
      const leftX = 50;
      const rightX = 350;
      const y = doc.y;

      doc.text('Le Maître d\'Ouvrage:', leftX, y);
      doc.text('L\'Entrepreneur:', rightX, y);
      
      doc.moveDown(4);
      doc.text('_______________________', leftX);
      doc.text('_______________________', rightX, doc.y - 14);

      // Footer
      doc.moveDown(4);
      doc.fontSize(10).font('Helvetica').fillColor('gray')
        .text(`Généré le ${new Date().toLocaleDateString('fr-FR')} par ${data.createdBy}`, { align: 'center' });

      doc.end();

      stream.on('finish', () => resolve());
      stream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Delete asset (soft delete)
 */
export const deleteAsset = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { assetId } = req.params;
    const pool = getPool();

    const result = await pool.query(
      `UPDATE project_assets 
       SET deleted_at = NOW(), updated_at = NOW() 
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [assetId]
    );

    if (result.rows.length === 0) {
      throw new ApiError('Asset not found', 404);
    }

    logger.info(`Asset deleted: ${assetId}`);

    res.json({
      success: true,
      message: 'Asset deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting asset:', error);
    next(error);
  }
};

/**
 * Get asset counts by type for a project
 */
export const getAssetCounts = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { projectId } = req.params;
    const pool = getPool();

    const result = await pool.query(
      `SELECT type, COUNT(*) as count 
       FROM project_assets 
       WHERE project_id = $1 AND deleted_at IS NULL 
       GROUP BY type`,
      [projectId]
    );

    const counts = {
      photos: 0,
      pv: 0,
      documents: 0,
    };

    result.rows.forEach(row => {
      if (row.type === 'photo') counts.photos = parseInt(row.count);
      else if (row.type === 'pv') counts.pv = parseInt(row.count);
      else if (row.type === 'document') counts.documents = parseInt(row.count);
    });

    res.json({
      success: true,
      data: counts,
    });
  } catch (error) {
    logger.error('Error getting asset counts:', error);
    next(error);
  }
};
