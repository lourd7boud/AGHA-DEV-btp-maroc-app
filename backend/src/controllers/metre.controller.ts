import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getCouchDB } from '../config/database';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { Metre } from '../models/types';

export const createMetre = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { projectId, bordereauId, reference, designation, mesures } = req.body;

    if (!projectId || !reference || !designation) {
      throw new ApiError('Required fields missing', 400);
    }

    const db = getCouchDB();

    // Calculer le total des quantités
    let totalQuantite = 0;
    if (mesures && Array.isArray(mesures)) {
      totalQuantite = mesures.reduce((sum, m) => {
        let qty = m.quantite || 1;
        if (m.longueur) qty *= m.longueur;
        if (m.largeur) qty *= m.largeur;
        if (m.hauteur) qty *= m.hauteur;
        return sum + qty;
      }, 0);
    }

    const metre: Metre = {
      _id: `metre:${uuidv4()}`,
      projectId,
      bordereauId: bordereauId || '',
      userId: req.user.id,
      reference,
      designation,
      mesures: mesures || [],
      totalQuantite,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.insert({ ...metre, type: 'metre' });

    // Mettre à jour le bordereau si lié
    if (bordereauId) {
      try {
        const bordereau = await db.get(`bordereau:${bordereauId}`);
        if (!bordereau.metreIds.includes(metre._id)) {
          bordereau.metreIds.push(metre._id);
          await db.insert(bordereau);
        }
      } catch (error) {
        // Bordereau n'existe pas encore, ignorer
      }
    }

    res.status(201).json({
      success: true,
      data: { ...metre, _rev: result.rev },
    });
  } catch (error) {
    next(error);
  }
};

export const getMetres = async (
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
        type: 'metre',
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

export const getMetreById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { id } = req.params;
    const db = getCouchDB();
    const metre = await db.get(`metre:${id}`);

    if (metre.userId !== req.user.id) {
      throw new ApiError('Not authorized', 403);
    }

    res.json({ success: true, data: metre });
  } catch (error: any) {
    if (error.statusCode === 404) {
      next(new ApiError('Metre not found', 404));
    } else {
      next(error);
    }
  }
};

export const updateMetre = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { id } = req.params;
    const db = getCouchDB();
    const metre = await db.get(`metre:${id}`);

    if (metre.userId !== req.user.id) {
      throw new ApiError('Not authorized', 403);
    }

    const updated = {
      ...metre,
      ...req.body,
      updatedAt: new Date(),
    };

    // Recalculer le total si mesures modifiées
    if (updated.mesures) {
      updated.totalQuantite = updated.mesures.reduce((sum: number, m: any) => {
        let qty = m.quantite || 1;
        if (m.longueur) qty *= m.longueur;
        if (m.largeur) qty *= m.largeur;
        if (m.hauteur) qty *= m.hauteur;
        return sum + qty;
      }, 0);
    }

    const result = await db.insert(updated);

    res.json({
      success: true,
      data: { ...updated, _rev: result.rev },
    });
  } catch (error: any) {
    if (error.statusCode === 404) {
      next(new ApiError('Metre not found', 404));
    } else {
      next(error);
    }
  }
};

export const deleteMetre = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { id } = req.params;
    const db = getCouchDB();
    const metre = await db.get(`metre:${id}`);

    if (metre.userId !== req.user.id) {
      throw new ApiError('Not authorized', 403);
    }

    metre.deletedAt = new Date();
    metre.updatedAt = new Date();
    await db.insert(metre);

    res.json({
      success: true,
      message: 'Metre deleted successfully',
    });
  } catch (error: any) {
    if (error.statusCode === 404) {
      next(new ApiError('Metre not found', 404));
    } else {
      next(error);
    }
  }
};
