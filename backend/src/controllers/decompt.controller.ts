import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getCouchDB } from '../config/database';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { Decompt } from '../models/types';

export const createDecompt = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { projectId, periode, numero, lignes } = req.body;

    if (!projectId || !periode || numero === undefined) {
      throw new ApiError('Required fields missing', 400);
    }

    const db = getCouchDB();

    // Calculer le montant total
    let montantTotal = 0;
    if (lignes && Array.isArray(lignes)) {
      montantTotal = lignes.reduce((sum, ligne) => sum + (ligne.montant || 0), 0);
    }

    const decompt: Decompt = {
      _id: `decompt:${uuidv4()}`,
      projectId,
      userId: req.user.id,
      periode,
      numero: parseInt(numero),
      lignes: lignes || [],
      montantTotal,
      statut: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.insert({ ...decompt, type: 'decompt' });

    res.status(201).json({
      success: true,
      data: { ...decompt, _rev: result.rev },
    });
  } catch (error) {
    next(error);
  }
};

export const getDecompts = async (
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
        type: 'decompt',
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

export const getDecomptById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { id } = req.params;
    const db = getCouchDB();
    const decompt = await db.get(`decompt:${id}`);

    if (decompt.userId !== req.user.id) {
      throw new ApiError('Not authorized', 403);
    }

    res.json({ success: true, data: decompt });
  } catch (error: any) {
    if (error.statusCode === 404) {
      next(new ApiError('Decompt not found', 404));
    } else {
      next(error);
    }
  }
};

export const updateDecompt = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { id } = req.params;
    const db = getCouchDB();
    const decompt = await db.get(`decompt:${id}`);

    if (decompt.userId !== req.user.id) {
      throw new ApiError('Not authorized', 403);
    }

    const updated = {
      ...decompt,
      ...req.body,
      updatedAt: new Date(),
    };

    // Recalculer le montant total si lignes modifiées
    if (updated.lignes) {
      updated.montantTotal = updated.lignes.reduce(
        (sum: number, ligne: any) => sum + (ligne.montant || 0),
        0
      );
    }

    const result = await db.insert(updated);

    res.json({
      success: true,
      data: { ...updated, _rev: result.rev },
    });
  } catch (error: any) {
    if (error.statusCode === 404) {
      next(new ApiError('Decompt not found', 404));
    } else {
      next(error);
    }
  }
};

export const deleteDecompt = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { id } = req.params;
    const db = getCouchDB();
    const decompt = await db.get(`decompt:${id}`);

    if (decompt.userId !== req.user.id) {
      throw new ApiError('Not authorized', 403);
    }

    decompt.deletedAt = new Date();
    decompt.updatedAt = new Date();
    await db.insert(decompt);

    res.json({
      success: true,
      message: 'Decompt deleted successfully',
    });
  } catch (error: any) {
    if (error.statusCode === 404) {
      next(new ApiError('Decompt not found', 404));
    } else {
      next(error);
    }
  }
};

export const generateDecomptPDF = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { id } = req.params;
    const db = getCouchDB();
    const decompt = await db.get(`decompt:${id}`);

    if (decompt.userId !== req.user.id) {
      throw new ApiError('Not authorized', 403);
    }

    // TODO: Implémenter la génération de PDF
    // Utiliser une bibliothèque comme pdfkit ou puppeteer

    res.json({
      success: true,
      message: 'PDF generation not yet implemented',
      data: decompt,
    });
  } catch (error: any) {
    if (error.statusCode === 404) {
      next(new ApiError('Decompt not found', 404));
    } else {
      next(error);
    }
  }
};
