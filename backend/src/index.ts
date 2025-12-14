import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { createServer } from 'http';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { ensureJsonResponse } from './middleware/jsonOnly';
import logger from './utils/logger';
import { initPostgres } from './config/postgres';
import { initSocketServer, setupRealtimeTriggers } from './realtime';

// v3 - Enhanced startup logging
console.log('');
console.log('========================================');
console.log('=== BTP BACKEND SERVER v4 REALTIME ===');
console.log('========================================');
console.log('Timestamp:', new Date().toISOString());
console.log('Node version:', process.version);
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('');

// Routes
import authRoutes from './routes/auth.routes';
import projectRoutes from './routes/project.routes';
import bordereauRoutes from './routes/bordereau.routes';
import metreRoutes from './routes/metre.routes';
import decomptRoutes from './routes/decompt.routes';
import photoRoutes from './routes/photo.routes';
import pvRoutes from './routes/pv.routes';
import attachmentRoutes from './routes/attachment.routes';
import periodeRoutes from './routes/periode.routes';
import syncRoutes from './routes/sync.routes.v2';  // Use enhanced sync controller v2

console.log('✅ All routes imported successfully (using sync.controller.v2)');

// dotenv is preloaded via -r dotenv/config in package.json

const app: Express = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(compression());
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ensure JSON responses for all API routes
app.use(ensureJsonResponse);

// Static files (uploads)
app.use('/uploads', express.static('uploads'));

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/bordereau', bordereauRoutes);
app.use('/api/metre', metreRoutes);
app.use('/api/decompt', decomptRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/pv', pvRoutes);
app.use('/api/attachments', attachmentRoutes);
app.use('/api/periodes', periodeRoutes);
app.use('/api/sync', syncRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

// Create HTTP server
const server = createServer(app);

// Initialize Database and Start server
const startServer = async () => {
  console.log('');
  console.log('=== startServer() CALLED ===');
  try {
    // Initialize PostgreSQL
    console.log('Initializing PostgreSQL connection...');
    await initPostgres();
    console.log('✅ PostgreSQL initialized successfully');
    
    // Setup realtime triggers (LISTEN/NOTIFY)
    console.log('Setting up realtime triggers...');
    await setupRealtimeTriggers();
    console.log('✅ Realtime triggers ready');
    
    // Initialize Socket.IO
    console.log('Initializing Socket.IO server...');
    initSocketServer(server);
    console.log('✅ Socket.IO server ready');
    
    // Start server
    server.listen(PORT, () => {
      console.log('');
      console.log('========================================');
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 API URL: http://localhost:${PORT}`);
      console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
      console.log(`📅 Started at: ${new Date().toISOString()}`);
      console.log('========================================');
      console.log('');
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📝 Environment: ${process.env.NODE_ENV}`);
      logger.info(`🔗 API URL: http://localhost:${PORT}`);
    });
  } catch (error: any) {
    console.error('');
    console.error('========================================');
    console.error('❌ Failed to start server:', error.message);
    console.error('Error stack:', error.stack);
    console.error('========================================');
    console.error('');
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

export default app;
