import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { getCouchDB } from '../config/database';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { Attachment } from '../models/types';

export const uploadAttachment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    if (!req.file) {
      throw new ApiError('No file uploaded', 400);
    }

    const { projectId, category, description, linkedType, linkedId } = req.body;

    if (!projectId || !category) {
      throw new ApiError('Project ID and category required', 400);
    }

    const db = getCouchDB();
    const project = await db.get(`project:${projectId}`);

    if (project.userId !== req.user.id) {
      throw new ApiError('Not authorized', 403);
    }

    // Déplacer vers le dossier approprié selon la catégorie
    const categoryFolders: { [key: string]: string } = {
      facture: 'Facture',
      bp: 'BP',
      plan: 'Plans',
      autre: 'Attachement',
    };

    const folder = categoryFolders[category] || 'Attachement';
    const destPath = path.join(
      process.cwd(),
      'uploads',
      project.folderPath,
      folder,
      req.file.filename
    );

    await fs.rename(req.file.path, destPath);

    const attachment: Attachment = {
      _id: `attachment:${uuidv4()}`,
      projectId,
      userId: req.user.id,
      fileName: req.file.originalname,
      filePath: `/uploads/${project.folderPath}/${folder}/${req.file.filename}`,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      category,
      description: description || '',
      linkedTo:
        linkedType && linkedId ? { type: linkedType, id: linkedId } : undefined,
      syncStatus: 'synced',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.insert({ ...attachment, type: 'attachment' });

    res.status(201).json({
      success: true,
      data: { ...attachment, _rev: result.rev },
    });
  } catch (error) {
    next(error);
  }
};

export const getAttachments = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { projectId } = req.params;
    const { category } = req.query;
    const db = getCouchDB();

    const selector: any = {
      type: 'attachment',
      projectId,
      userId: req.user.id,
      deletedAt: { $exists: false },
    };

    if (category) {
      selector.category = category;
    }

    const result = await db.find({ selector });

    res.json({
      success: true,
      data: result.docs,
      count: result.docs.length,
    });
  } catch (error) {
    next(error);
  }
};

export const getAttachmentById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { id } = req.params;
    const db = getCouchDB();
    const attachment = await db.get(`attachment:${id}`);

    if (attachment.userId !== req.user.id) {
      throw new ApiError('Not authorized', 403);
    }

    res.json({ success: true, data: attachment });
  } catch (error: any) {
    if (error.statusCode === 404) {
      next(new ApiError('Attachment not found', 404));
    } else {
      next(error);
    }
  }
};

export const deleteAttachment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { id } = req.params;
    const db = getCouchDB();
    const attachment = await db.get(`attachment:${id}`);

    if (attachment.userId !== req.user.id) {
      throw new ApiError('Not authorized', 403);
    }

    // Supprimer le fichier physique
    const filePath = path.join(process.cwd(), attachment.filePath);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // Fichier peut ne pas exister
    }

    attachment.deletedAt = new Date();
    attachment.updatedAt = new Date();
    await db.insert(attachment);

    res.json({
      success: true,
      message: 'Attachment deleted successfully',
    });
  } catch (error: any) {
    if (error.statusCode === 404) {
      next(new ApiError('Attachment not found', 404));
    } else {
      next(error);
    }
  }
};
