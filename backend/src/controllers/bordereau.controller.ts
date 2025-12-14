import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getCouchDB } from '../config/database';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { Bordereau } from '../models/types';

export const createBordereau = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { projectId, reference, designation, unite, quantite, prixUnitaire } = req.body;

    if (!projectId || !reference || !designation || !unite || quantite === undefined) {
      throw new ApiError('Required fields missing', 400);
    }

    const db = getCouchDB();
    const montantTotal = quantite * (prixUnitaire || 0);

    const bordereau: Bordereau = {
      _id: `bordereau:${uuidv4()}`,
      projectId,
      userId: req.user.id,
      reference,
      designation,
      unite,
      quantite: parseFloat(quantite),
      prixUnitaire: parseFloat(prixUnitaire) || 0,
      montantTotal,
      metreIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.insert({ ...bordereau, type: 'bordereau' });

    res.status(201).json({
      success: true,
      data: { ...bordereau, _rev: result.rev },
    });
  } catch (error) {
    next(error);
  }
};

export const getBordereaux = async (
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
        type: 'bordereau',
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

export const getBordereauById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { id } = req.params;
    const db = getCouchDB();
    const bordereau = await db.get(`bordereau:${id}`);

    if (bordereau.userId !== req.user.id) {
      throw new ApiError('Not authorized', 403);
    }

    res.json({ success: true, data: bordereau });
  } catch (error: any) {
    if (error.statusCode === 404) {
      next(new ApiError('Bordereau not found', 404));
    } else {
      next(error);
    }
  }
};

export const updateBordereau = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { id } = req.params;
    const db = getCouchDB();
    const bordereau = await db.get(`bordereau:${id}`);

    if (bordereau.userId !== req.user.id) {
      throw new ApiError('Not authorized', 403);
    }

    const updated = {
      ...bordereau,
      ...req.body,
      updatedAt: new Date(),
    };

    // Recalculer le montant total si nécessaire
    if (updated.quantite && updated.prixUnitaire) {
      updated.montantTotal = updated.quantite * updated.prixUnitaire;
    }

    const result = await db.insert(updated);

    res.json({
      success: true,
      data: { ...updated, _rev: result.rev },
    });
  } catch (error: any) {
    if (error.statusCode === 404) {
      next(new ApiError('Bordereau not found', 404));
    } else {
      next(error);
    }
  }
};

export const deleteBordereau = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { id } = req.params;
    const db = getCouchDB();
    const bordereau = await db.get(`bordereau:${id}`);

    if (bordereau.userId !== req.user.id) {
      throw new ApiError('Not authorized', 403);
    }

    bordereau.deletedAt = new Date();
    bordereau.updatedAt = new Date();
    await db.insert(bordereau);

    res.json({
      success: true,
      message: 'Bordereau deleted successfully',
    });
  } catch (error: any) {
    if (error.statusCode === 404) {
      next(new ApiError('Bordereau not found', 404));
    } else {
      next(error);
    }
  }
};
