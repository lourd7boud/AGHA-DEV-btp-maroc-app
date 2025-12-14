import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getCouchDB } from '../config/database';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { PV } from '../models/types';

export const createPV = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { projectId, type, numero, date, objet, contenu, participants, attachments } = req.body;

    if (!projectId || !type || !numero || !date || !objet) {
      throw new ApiError('Required fields missing', 400);
    }

    const db = getCouchDB();

    const pv: PV = {
      _id: `pv:${uuidv4()}`,
      projectId,
      userId: req.user.id,
      type,
      numero,
      date: new Date(date),
      objet,
      contenu: contenu || '',
      participants: participants || [],
      attachments: attachments || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.insert({ ...pv, type: 'pv' });

    res.status(201).json({
      success: true,
      data: { ...pv, _rev: result.rev },
    });
  } catch (error) {
    next(error);
  }
};

export const getPVs = async (
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
        type: 'pv',
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

export const getPVById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { id } = req.params;
    const db = getCouchDB();
    const pv = await db.get(`pv:${id}`);

    if (pv.userId !== req.user.id) {
      throw new ApiError('Not authorized', 403);
    }

    res.json({ success: true, data: pv });
  } catch (error: any) {
    if (error.statusCode === 404) {
      next(new ApiError('PV not found', 404));
    } else {
      next(error);
    }
  }
};

export const updatePV = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { id } = req.params;
    const db = getCouchDB();
    const pv = await db.get(`pv:${id}`);

    if (pv.userId !== req.user.id) {
      throw new ApiError('Not authorized', 403);
    }

    const updated = {
      ...pv,
      ...req.body,
      updatedAt: new Date(),
    };

    const result = await db.insert(updated);

    res.json({
      success: true,
      data: { ...updated, _rev: result.rev },
    });
  } catch (error: any) {
    if (error.statusCode === 404) {
      next(new ApiError('PV not found', 404));
    } else {
      next(error);
    }
  }
};

export const deletePV = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { id } = req.params;
    const db = getCouchDB();
    const pv = await db.get(`pv:${id}`);

    if (pv.userId !== req.user.id) {
      throw new ApiError('Not authorized', 403);
    }

    pv.deletedAt = new Date();
    pv.updatedAt = new Date();
    await db.insert(pv);

    res.json({
      success: true,
      message: 'PV deleted successfully',
    });
  } catch (error: any) {
    if (error.statusCode === 404) {
      next(new ApiError('PV not found', 404));
    } else {
      next(error);
    }
  }
};
