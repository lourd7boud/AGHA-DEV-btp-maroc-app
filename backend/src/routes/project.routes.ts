import { Router } from 'express';
import {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  deleteProject,
  getProjectStructure,
  getDeletedProjects,
  restoreProject,
} from '../controllers/project.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// Toutes les routes nécessitent l'authentification
router.use(authenticate);

/**
 * @route   POST /api/projects
 * @desc    Create new project
 * @access  Private
 */
router.post('/', createProject);

/**
 * @route   GET /api/projects
 * @desc    Get all projects for current user
 * @access  Private
 */
router.get('/', getProjects);

/**
 * @route   GET /api/projects/:id
 * @desc    Get project by ID
 * @access  Private
 */
router.get('/:id', getProjectById);

/**
 * @route   PUT /api/projects/:id
 * @desc    Update project
 * @access  Private
 */
router.put('/:id', updateProject);

/**
 * @route   DELETE /api/projects/:id
 * @desc    Delete project (soft delete)
 * @access  Private
 */
router.delete('/:id', deleteProject);

/**
 * @route   GET /api/projects/deleted/list
 * @desc    Get deleted projects (trash bin)
 * @access  Private
 */
router.get('/deleted/list', getDeletedProjects);

/**
 * @route   POST /api/projects/:id/restore
 * @desc    Restore a deleted project
 * @access  Private
 */
router.post('/:id/restore', restoreProject);

/**
 * @route   GET /api/projects/:id/structure
 * @desc    Get project folder structure
 * @access  Private
 */
router.get('/:id/structure', getProjectStructure);

export default router;
