/**
 * Socket.IO Server for Real-time Sync
 * 
 * Features:
 * - Real-time broadcast of sync operations
 * - Room-based subscriptions per user
 * - Automatic reconnection handling
 * - PostgreSQL LISTEN/NOTIFY integration
 */

import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { PoolClient } from 'pg';
import { getPool } from '../config/postgres';
import logger from '../utils/logger';
import jwt from 'jsonwebtoken';

// ==================== TYPES ====================

interface AuthenticatedSocket extends Socket {
  userId?: string;
  deviceId?: string;
  clientSessionId?: string;
}

interface SyncOperation {
  serverSeq: number;
  opId: string;
  clientId: string;
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  entity: string;
  entityId: string;
  data: any;
  timestamp: number;
  userId: string;
}

interface NotifyPayload {
  server_seq: number;
  op_id: string;
  client_id: string;
  user_id: string;
  entity: string;
  entity_id: string;
  op_type: string;
  payload: any;
  ts: string;
}

// ==================== SOCKET SERVER ====================

let io: SocketIOServer | null = null;
let pgListenerClient: PoolClient | null = null;
let isListening = false;

/**
 * Initialize Socket.IO server
 */
export const initSocketServer = (httpServer: HttpServer): SocketIOServer => {
  console.log('🔌 Initializing Socket.IO server...');

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/socket.io/',
    // CRITICAL: Stable ping settings to prevent reconnect loops
    pingTimeout: 60000,
    pingInterval: 25000,
    // CRITICAL: Try WebSocket first, fallback to polling only if needed
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    allowUpgrades: true,
    // Increase buffer size for better performance
    maxHttpBufferSize: 1e6,
    // Enable compression for better performance
    perMessageDeflate: false,
  });

  // Authentication middleware
  io.use(async (socket, next: (err?: Error) => void) => {
    try {
      const authSocket = socket as AuthenticatedSocket;
      const token = authSocket.handshake.auth?.token ||
        authSocket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        console.log('❌ Socket connection rejected: No token');
        return next(new Error('Authentication required'));
      }

      const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
      const decoded = jwt.verify(token, jwtSecret) as { id: string };

      authSocket.userId = decoded.id;
      authSocket.deviceId = authSocket.handshake.auth?.deviceId || 'unknown';
      authSocket.clientSessionId = authSocket.handshake.auth?.clientSessionId || `session-${Date.now()}`;

      console.log(`✅ Socket authenticated: user=${authSocket.userId}, device=${authSocket.deviceId}, session=${authSocket.clientSessionId}`);
      next();
    } catch (error: any) {
      console.log('❌ Socket auth error:', error.message);
      next(new Error('Authentication failed'));
    }
  });

  // Connection handler
  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`🔌 Socket connected: ${socket.id} (user: ${socket.userId})`);

    // Join user's personal room
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
      console.log(`📢 Socket ${socket.id} joined room: user:${socket.userId}`);
    }

    // Join project rooms
    socket.on('join:project', (projectId: string) => {
      socket.join(`project:${projectId}`);
      console.log(`📢 Socket ${socket.id} joined room: project:${projectId}`);
    });

    socket.on('leave:project', (projectId: string) => {
      socket.leave(`project:${projectId}`);
      console.log(`📢 Socket ${socket.id} left room: project:${projectId}`);
    });

    // Subscribe to entity changes
    socket.on('subscribe', (entities: string[]) => {
      for (const entity of entities) {
        socket.join(`entity:${entity}`);
      }
      console.log(`📢 Socket ${socket.id} subscribed to entities:`, entities);
    });

    // Request sync state
    socket.on('sync:request', async (data: { since: number }) => {
      try {
        if (!socket.userId) return;

        const pool = getPool();
        const result = await pool.query(
          `SELECT server_seq, op_id, client_id, ts, entity, entity_id, op_type, payload
           FROM ops 
           WHERE user_id = $1 AND server_seq > $2 AND applied = TRUE
           ORDER BY server_seq ASC
           LIMIT 500`,
          [socket.userId, data.since || 0]
        );

        const operations = result.rows.map(row => ({
          serverSeq: row.server_seq,
          opId: row.op_id,
          clientId: row.client_id,
          type: row.op_type,
          entity: row.entity,
          entityId: row.entity_id,
          data: row.payload,
          timestamp: new Date(row.ts).getTime(),
        }));

        socket.emit('sync:state', {
          operations,
          serverTime: Date.now(),
        });

        console.log(`📤 Sent ${operations.length} ops to socket ${socket.id}`);
      } catch (error: any) {
        console.error('Sync request error:', error.message);
        socket.emit('sync:error', { message: error.message });
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`🔌 Socket disconnected: ${socket.id} (reason: ${reason})`);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`Socket error (${socket.id}):`, error);
    });
  });

  // Start PostgreSQL listener
  startPgListener();

  logger.info('✅ Socket.IO server initialized');
  console.log('✅ Socket.IO server ready');

  return io;
};

/**
 * Start PostgreSQL LISTEN for real-time updates
 */
const startPgListener = async (): Promise<void> => {
  if (isListening) {
    console.log('📡 PG listener already running');
    return;
  }

  try {
    const pool = getPool();
    pgListenerClient = await pool.connect();

    // Set up notification handler
    pgListenerClient.on('notification', (msg) => {
      if (msg.channel === 'ops_channel' && msg.payload) {
        try {
          const payload: NotifyPayload = JSON.parse(msg.payload);
          handleOpsNotification(payload);
        } catch (parseError) {
          console.error('Error parsing notification payload:', parseError);
        }
      }
    });

    // Subscribe to channel
    await pgListenerClient.query('LISTEN ops_channel');
    isListening = true;

    console.log('📡 PostgreSQL LISTEN started on ops_channel');
    logger.info('📡 PostgreSQL LISTEN started');

    // Handle connection errors
    pgListenerClient.on('error', async (err) => {
      console.error('PG listener error:', err);
      isListening = false;
      // Reconnect after delay
      setTimeout(startPgListener, 5000);
    });

  } catch (error: any) {
    console.error('Failed to start PG listener:', error.message);
    // Retry after delay
    setTimeout(startPgListener, 5000);
  }
};

/**
 * Handle notification from PostgreSQL
 */
const handleOpsNotification = (payload: NotifyPayload): void => {
  if (!io) return;

  const operation: SyncOperation = {
    serverSeq: payload.server_seq,
    opId: payload.op_id,
    clientId: payload.client_id,
    type: payload.op_type as 'CREATE' | 'UPDATE' | 'DELETE',
    entity: payload.entity,
    entityId: payload.entity_id,
    data: payload.payload,
    timestamp: new Date(payload.ts).getTime(),
    userId: payload.user_id,
  };

  // Find sender sockets to exclude (Echo Prevention) - Use clientSessionId
  const senderSockets: string[] = [];
  if (io) {
    const sockets = io.sockets.sockets;
    for (const [id, socket] of sockets) {
      const authSocket = socket as AuthenticatedSocket;
      // Match by userId AND deviceId to prevent echo
      if (authSocket.userId === payload.user_id && authSocket.deviceId === payload.client_id) {
        senderSockets.push(id);
      }
    }
  }
  
  // CRITICAL: If no sender found, this might be a server-initiated DELETE - DO NOT BROADCAST
  if (senderSockets.length === 0 && payload.op_type === 'DELETE') {
    console.log(`⚠️ DELETE operation without sender - BLOCKED: ${operation.opId}`);
    return;
  }

  console.log(`📤 Broadcasting op: ${operation.opId} (${operation.type} ${operation.entity}) - Excluded sockets: ${senderSockets.length}`);

  // Broadcast to user's room (excluding the sender's device)
  if (senderSockets.length > 0) {
    io.except(senderSockets).to(`user:${payload.user_id}`).emit('sync:op', operation);
    io.except(senderSockets).to(`entity:${payload.entity}`).emit('sync:op', operation);
  } else {
    io.to(`user:${payload.user_id}`).emit('sync:op', operation);
    io.to(`entity:${payload.entity}`).emit('sync:op', operation);
  }

  // Broadcast to project room if applicable
  if (payload.payload?.projectId || payload.payload?.project_id) {
    const projectId = payload.payload.projectId || payload.payload.project_id;
    if (senderSockets.length > 0) {
      io.except(senderSockets).to(`project:${projectId}`).emit('sync:op', operation);
    } else {
      io.to(`project:${projectId}`).emit('sync:op', operation);
    }
  }

};

/**
 * Broadcast operation to all connected clients
 * Called directly from sync controller when operations are applied
 */
export const broadcastOperation = (
  userId: string,
  operation: Omit<SyncOperation, 'userId'>
): void => {
  if (!io) {
    console.warn('Socket.IO not initialized, cannot broadcast');
    return;
  }

  const fullOp: SyncOperation = { ...operation, userId };

  console.log(`📤 Direct broadcast: ${operation.opId} to user:${userId}`);

  // Broadcast to user's room
  io.to(`user:${userId}`).emit('sync:op', fullOp);

  // Broadcast to entity room
  io.to(`entity:${operation.entity}`).emit('sync:op', fullOp);
};

/**
 * Get connected clients count
 */
export const getConnectedClientsCount = (): number => {
  if (!io) return 0;
  return io.sockets.sockets.size;
};

/**
 * Get connected clients for a user
 */
export const getUserConnectedClients = (userId: string): number => {
  if (!io) return 0;
  const room = io.sockets.adapter.rooms.get(`user:${userId}`);
  return room ? room.size : 0;
};

/**
 * Shutdown socket server
 */
export const shutdownSocketServer = async (): Promise<void> => {
  if (pgListenerClient) {
    await pgListenerClient.query('UNLISTEN ops_channel');
    pgListenerClient.release();
    pgListenerClient = null;
    isListening = false;
  }

  if (io) {
    io.close();
    io = null;
  }

  console.log('🔌 Socket server shut down');
};

export const getIO = (): SocketIOServer | null => io;

export default {
  initSocketServer,
  broadcastOperation,
  getConnectedClientsCount,
  getUserConnectedClients,
  shutdownSocketServer,
  getIO,
};
