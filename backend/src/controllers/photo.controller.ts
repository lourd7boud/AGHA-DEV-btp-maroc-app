import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { getCouchDB } from '../config/database';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { Photo } from '../models/types';

export const uploadPhoto = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    if (!req.file) {
      throw new ApiError('No file uploaded', 400);
    }

    const { projectId, description, tags, latitude, longitude } = req.body;

    if (!projectId) {
      throw new ApiError('Project ID required', 400);
    }

    const db = getCouchDB();

    // Récupérer le projet pour obtenir le folderPath
    const project = await db.get(`project:${projectId}`);

    if (project.userId !== req.user.id) {
      throw new ApiError('Not authorized', 403);
    }

    // Déplacer le fichier vers le dossier du projet
    const destPath = path.join(
      process.cwd(),
      'uploads',
      project.folderPath,
      'Photo',
      req.file.filename
    );

    await fs.rename(req.file.path, destPath);

    const photo: Photo = {
      _id: `photo:${uuidv4()}`,
      projectId,
      userId: req.user.id,
      fileName: req.file.originalname,
      filePath: `/uploads/${project.folderPath}/Photo/${req.file.filename}`,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      description: description || '',
      tags: tags ? JSON.parse(tags) : [],
      location:
        latitude && longitude
          ? { latitude: parseFloat(latitude), longitude: parseFloat(longitude) }
          : undefined,
      syncStatus: 'synced',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.insert({ ...photo, type: 'photo' });

    res.status(201).json({
      success: true,
      data: { ...photo, _rev: result.rev },
    });
  } catch (error) {
    next(error);
  }
};

export const getPhotos = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { projectId } = req.params;
    const db = getCouchDB();

    const result = await db.find({
      selector: {
        type: 'photo',
        projectId,
        userId: req.user.id,
        deletedAt: { $exists: false },
      },
    });

    res.json({
      success: true,
      data: result.docs,
      count: result.docs.length,
    });
  } catch (error) {
    next(error);
  }
};

export const getPhotoById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { id } = req.params;
    const db = getCouchDB();
    const photo = await db.get(`photo:${id}`);

    if (photo.userId !== req.user.id) {
      throw new ApiError('Not authorized', 403);
    }

    res.json({ success: true, data: photo });
  } catch (error: any) {
    if (error.statusCode === 404) {
      next(new ApiError('Photo not found', 404));
    } else {
      next(error);
    }
  }
};

export const deletePhoto = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { id } = req.params;
    const db = getCouchDB();
    const photo = await db.get(`photo:${id}`);

    if (photo.userId !== req.user.id) {
      throw new ApiError('Not authorized', 403);
    }

    // Supprimer le fichier physique
    const filePath = path.join(process.cwd(), photo.filePath);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // Fichier peut ne pas exister
    }

    photo.deletedAt = new Date();
    photo.updatedAt = new Date();
    await db.insert(photo);

    res.json({
      success: true,
      message: 'Photo deleted successfully',
    });
  } catch (error: any) {
    if (error.statusCode === 404) {
      next(new ApiError('Photo not found', 404));
    } else {
      next(error);
    }
  }
};
