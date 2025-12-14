import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getCouchDB } from '../config/database';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { Project } from '../models/types';
import path from 'path';
import fs from 'fs/promises';

/**
 * Créer la structure de dossiers pour un projet
 */
const createProjectFolders = async (folderPath: string): Promise<void> => {
  const folders = [
    'Facture',
    'BP',
    'Photo',
    'Decompt',
    'Metre',
    'Detail',
    'Attachement',
    'PV',
    'Plans',
  ];

  const basePath = path.join(process.cwd(), 'uploads', folderPath);

  await fs.mkdir(basePath, { recursive: true });

  for (const folder of folders) {
    await fs.mkdir(path.join(basePath, folder), { recursive: true });
  }
};

/**
 * Create new project
 */
export const createProject = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401);
    }

    const {
      objet,
      marcheNo,
      annee,
      dateOuverture,
      montant,
      snss,
      cbn,
      rcn,
      societe,
      patente,
      delaisEntreeService,
      osc,
    } = req.body;

    if (!objet || !marcheNo || !annee) {
      throw new ApiError('Required fields missing', 400);
    }

    // Générer le chemin du dossier: /{year}/{marche}-{affaire}
    const folderPath = `${annee}/${marcheNo}`;

    const db = getCouchDB();

    const project: Project = {
      _id: `project:${uuidv4()}`,
      userId: req.user.id,
      objet,
      marcheNo,
      annee,
      dateOuverture: new Date(dateOuverture),
      montant: parseFloat(montant) || 0,
      snss: snss || '',
      cbn: cbn || '',
      rcn: rcn || '',
      societe: societe || '',
      patente: patente || '',
      delaisEntreeService: delaisEntreeService ? new Date(delaisEntreeService) : undefined,
      osc: osc ? new Date(osc) : undefined,
      status: 'draft',
      progress: 0,
      folderPath,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Créer la structure de dossiers
    await createProjectFolders(folderPath);

    // Sauvegarder dans CouchDB
    const result = await db.insert({
      ...project,
      type: 'project',
    });

    res.status(201).json({
      success: true,
      data: { ...project, _rev: result.rev },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all projects for current user
 */
export const getProjects = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401);
    }

    const db = getCouchDB();
    const { status } = req.query;

    let result;

    if (status) {
      result = await db.view('projects', 'by_status', {
        key: [req.user.id, status],
        include_docs: true,
      });
    } else {
      result = await db.view('projects', 'by_user', {
        key: req.user.id,
        include_docs: true,
      });
    }

    const projects = result.rows.map((row) => row.doc);

    res.json({
      success: true,
      data: projects,
      count: projects.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get project by ID
 */
export const getProjectById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401);
    }

    const { id } = req.params;
    const db = getCouchDB();

    const project = await db.get(`project:${id}`);

    if (project.userId !== req.user.id) {
      throw new ApiError('Not authorized', 403);
    }

    res.json({
      success: true,
      data: project,
    });
  } catch (error: any) {
    if (error.statusCode === 404) {
      next(new ApiError('Project not found', 404));
    } else {
      next(error);
    }
  }
};

/**
 * Update project
 */
export const updateProject = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401);
    }

    const { id } = req.params;
    const db = getCouchDB();

    const project = await db.get(`project:${id}`);

    if (project.userId !== req.user.id) {
      throw new ApiError('Not authorized', 403);
    }

    const updatedProject = {
      ...project,
      ...req.body,
      updatedAt: new Date(),
    };

    const result = await db.insert(updatedProject);

    res.json({
      success: true,
      data: { ...updatedProject, _rev: result.rev },
    });
  } catch (error: any) {
    if (error.statusCode === 404) {
      next(new ApiError('Project not found', 404));
    } else {
      next(error);
    }
  }
};

/**
 * Delete project (soft delete)
 */
export const deleteProject = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401);
    }

    const { id } = req.params;
    const db = getCouchDB();

    const project = await db.get(`project:${id}`);

    if (project.userId !== req.user.id) {
      throw new ApiError('Not authorized', 403);
    }

    project.deletedAt = new Date();
    project.updatedAt = new Date();

    const result = await db.insert(project);

    res.json({
      success: true,
      message: 'Project deleted successfully',
    });
  } catch (error: any) {
    if (error.statusCode === 404) {
      next(new ApiError('Project not found', 404));
    } else {
      next(error);
    }
  }
};

/**
 * Get project folder structure
 */
export const getProjectStructure = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401);
    }

    const { id } = req.params;
    const db = getCouchDB();

    const project = await db.get(`project:${id}`);

    if (project.userId !== req.user.id) {
      throw new ApiError('Not authorized', 403);
    }

    const basePath = path.join(process.cwd(), 'uploads', project.folderPath);

    const structure = {
      path: project.folderPath,
      folders: [
        'Facture',
        'BP',
        'Photo',
        'Decompt',
        'Metre',
        'Detail',
        'Attachement',
        'PV',
        'Plans',
      ],
    };

    res.json({
      success: true,
      data: structure,
    });
  } catch (error) {
    next(error);
  }
};
