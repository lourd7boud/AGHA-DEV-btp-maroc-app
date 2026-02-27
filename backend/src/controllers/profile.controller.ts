import { Response, NextFunction } from 'express';
import { getPool } from '../config/postgres';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import { keysToCamel } from '../utils/transform';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const SIGNATURES_DIR = path.join(process.cwd(), 'uploads', 'signatures');

// Ensure signatures directory exists
if (!fs.existsSync(SIGNATURES_DIR)) {
  fs.mkdirSync(SIGNATURES_DIR, { recursive: true });
}

/**
 * GET /api/profile — Get current user profile
 */
export const getProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);
    const pool = getPool();

    const result = await pool.query(
      `SELECT id, email, first_name, last_name, role, job_title, phone, department,
              company_name, signature_url, stamp_url, avatar_url, created_at
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [req.user.id]
    );

    if (result.rows.length === 0) throw new ApiError('User not found', 404);

    res.json({ success: true, data: keysToCamel(result.rows[0]) });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/profile — Update current user profile
 */
export const updateProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);
    const { firstName, lastName, jobTitle, phone, department, companyName } = req.body;
    const pool = getPool();

    const result = await pool.query(
      `UPDATE users SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        job_title = COALESCE($3, job_title),
        phone = COALESCE($4, phone),
        department = COALESCE($5, department),
        company_name = COALESCE($6, company_name),
        updated_at = NOW()
      WHERE id = $7 AND deleted_at IS NULL
      RETURNING id, email, first_name, last_name, role, job_title, phone, department,
                company_name, signature_url, stamp_url, avatar_url`,
      [firstName, lastName, jobTitle, phone, department, companyName, req.user.id]
    );

    if (result.rows.length === 0) throw new ApiError('User not found', 404);

    res.json({ success: true, data: keysToCamel(result.rows[0]) });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/profile/signature — Upload signature (Base64 PNG or file)
 */
export const uploadSignature = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    let filePath: string;

    if (req.body.imageData) {
      // Base64 data from canvas
      const base64Data = req.body.imageData.replace(/^data:image\/png;base64,/, '');
      const fileName = `${req.user.id}_signature.png`;
      filePath = path.join(SIGNATURES_DIR, fileName);
      fs.writeFileSync(filePath, base64Data, 'base64');
    } else if (req.file) {
      // Uploaded file via multer
      const fileName = `${req.user.id}_signature${path.extname(req.file.originalname)}`;
      filePath = path.join(SIGNATURES_DIR, fileName);
      fs.renameSync(req.file.path, filePath);
    } else {
      throw new ApiError('No signature data provided', 400);
    }

    const signatureUrl = `/uploads/signatures/${path.basename(filePath)}`;
    const pool = getPool();

    await pool.query(
      `UPDATE users SET signature_url = $1, updated_at = NOW() WHERE id = $2`,
      [signatureUrl, req.user.id]
    );

    logger.info(`Signature uploaded for user ${req.user.id}`);

    res.json({ success: true, data: { signatureUrl } });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/profile/signature — Delete signature
 */
export const deleteSignature = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);
    const pool = getPool();

    // Get current signature path
    const userResult = await pool.query(
      `SELECT signature_url FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (userResult.rows[0]?.signature_url) {
      const filePath = path.join(process.cwd(), userResult.rows[0].signature_url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await pool.query(
      `UPDATE users SET signature_url = NULL, updated_at = NOW() WHERE id = $1`,
      [req.user.id]
    );

    res.json({ success: true, message: 'Signature deleted' });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/profile/stamp — Upload stamp/cachet (Base64 PNG or file)
 */
export const uploadStamp = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    let filePath: string;

    if (req.body.imageData) {
      const base64Data = req.body.imageData.replace(/^data:image\/png;base64,/, '');
      const fileName = `${req.user.id}_stamp.png`;
      filePath = path.join(SIGNATURES_DIR, fileName);
      fs.writeFileSync(filePath, base64Data, 'base64');
    } else if (req.file) {
      const fileName = `${req.user.id}_stamp${path.extname(req.file.originalname)}`;
      filePath = path.join(SIGNATURES_DIR, fileName);
      fs.renameSync(req.file.path, filePath);
    } else {
      throw new ApiError('No stamp data provided', 400);
    }

    const stampUrl = `/uploads/signatures/${path.basename(filePath)}`;
    const pool = getPool();

    await pool.query(
      `UPDATE users SET stamp_url = $1, updated_at = NOW() WHERE id = $2`,
      [stampUrl, req.user.id]
    );

    logger.info(`Stamp uploaded for user ${req.user.id}`);

    res.json({ success: true, data: { stampUrl } });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/profile/stamp — Delete stamp
 */
export const deleteStamp = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);
    const pool = getPool();

    const userResult = await pool.query(
      `SELECT stamp_url FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (userResult.rows[0]?.stamp_url) {
      const filePath = path.join(process.cwd(), userResult.rows[0].stamp_url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await pool.query(
      `UPDATE users SET stamp_url = NULL, updated_at = NOW() WHERE id = $1`,
      [req.user.id]
    );

    res.json({ success: true, message: 'Stamp deleted' });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/profile/sign-document — Log a document signing event
 */
export const signDocument = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { documentType, documentId, projectId, documentHash } = req.body;

    if (!documentType) throw new ApiError('documentType is required', 400);

    // Generate a unique short verification code
    const verificationCode = crypto.randomBytes(6).toString('hex').toUpperCase().slice(0, 12);

    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO signature_audit_log
        (user_id, document_type, document_id, project_id, document_hash, verification_code, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.user.id,
        documentType,
        documentId || null,
        projectId || null,
        documentHash || null,
        verificationCode,
        req.ip || req.headers['x-forwarded-for'] || 'unknown',
        req.headers['user-agent'] || 'unknown',
      ]
    );

    logger.info(`Document signed: ${documentType} by user ${req.user.id}, code: ${verificationCode}`);

    res.status(201).json({
      success: true,
      data: {
        ...keysToCamel(result.rows[0]),
        verificationUrl: `https://marocinfra.com/verify/${verificationCode}`,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/profile/verify/:code — Verify a signed document (public)
 */
export const verifyDocument = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { code } = req.params;
    const pool = getPool();

    const result = await pool.query(
      `SELECT sal.*, u.first_name, u.last_name, u.email, u.job_title, u.company_name
       FROM signature_audit_log sal
       INNER JOIN users u ON sal.user_id = u.id
       WHERE sal.verification_code = $1`,
      [code]
    );

    if (result.rows.length === 0) {
      res.json({ success: false, message: 'Code de vérification invalide' });
      return;
    }

    const row = result.rows[0];
    res.json({
      success: true,
      data: {
        signerName: `${row.first_name} ${row.last_name}`,
        signerEmail: row.email,
        signerTitle: row.job_title,
        company: row.company_name,
        documentType: row.document_type,
        signedAt: row.signed_at,
        documentHash: row.document_hash,
        verified: true,
      },
    });
  } catch (error) {
    next(error);
  }
};
