# Real-time Sync System Documentation

## Overview

This document describes the real-time synchronization system implemented in the BTP Maroc application. The system provides:

- **Instant updates**: Changes made by any user appear immediately on all connected devices (< 1 second)
- **Offline support**: Full functionality when offline, with automatic sync when reconnecting
- **Conflict resolution**: Last-write-wins strategy with server-assigned sequence numbers
- **Room-based subscriptions**: Efficient updates targeting specific projects

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Client A      │     │   Server        │     │   Client B      │
│   (Browser)     │     │   (Node.js)     │     │   (Electron)    │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │  1. POST /sync/push   │                       │
         │──────────────────────>│                       │
         │                       │                       │
         │                       │  2. Apply to          │
         │                       │     PostgreSQL        │
         │                       │                       │
         │                       │  3. Trigger NOTIFY    │
         │                       │     on ops_channel    │
         │                       │                       │
         │                       │  4. Socket.IO emit    │
         │                       │────────────────────────>
         │                       │                       │
         │                       │                       │ 5. Apply to Dexie
         │                       │                       │    & update UI
         │                       │                       │
```

## Components

### Backend

#### 1. Socket Server (`backend/src/realtime/socketServer.ts`)

The Socket.IO server handles:
- WebSocket connections with JWT authentication
- Room management (user rooms, project rooms)
- Broadcasting operations to connected clients
- PostgreSQL LISTEN for real-time notifications

```typescript
// Key functions:
initSocketServer(httpServer)   // Initialize Socket.IO
broadcastOperation(userId, op) // Send op to all user's devices
```

#### 2. PostgreSQL Triggers (`backend/src/realtime/pgNotify.ts`)

Sets up database triggers for real-time notifications:

```sql
-- Trigger function
CREATE FUNCTION notify_ops_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('ops_channel', row_to_json(NEW)::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on ops table
CREATE TRIGGER ops_notify_trigger
  AFTER INSERT ON ops
  FOR EACH ROW
  EXECUTE FUNCTION notify_ops_change();
```

#### 3. Sync Controller (`backend/src/controllers/sync.controller.v2.ts`)

Handles sync operations:
- `POST /sync/push` - Receive and apply client operations
- `GET /sync/pull` - Return operations since a given sequence

### Frontend

#### 1. Realtime Sync Service (`frontend-web/src/services/realtimeSync.ts`)

Core WebSocket client:

```typescript
// Connect to server
realtimeSync.connect(serverUrl, token, deviceId, userId);

// Subscribe to project updates
realtimeSync.subscribeToProject(projectId);

// Listen for operations
realtimeSync.onOperation((op) => {
  // Handle incoming operation
});
```

#### 2. Sync Manager Hook (`frontend-web/src/hooks/useSyncManagerV3.ts`)

React hook for managing sync:

```typescript
const { syncState, sync, syncPush, syncPull } = useSyncManager(userId);

// syncState.realtimeConnected - true when WebSocket is connected
// syncState.status - 'idle' | 'syncing' | 'synced' | 'error' | 'offline' | 'realtime'
```

#### 3. Realtime Hook (`frontend-web/src/hooks/useRealtimeSync.ts`)

React hook for real-time features:

```typescript
// Listen for entity updates
useEntityUpdates('project', ({ type, entityId, data }) => {
  console.log('Project updated!', entityId);
});

// Auto-refresh when data changes
useRefreshOnChange('bordereau', () => {
  refetchBordereaux();
});
```

#### 4. Project Subscription Hook (`frontend-web/src/hooks/useProjectRealtime.ts`)

```typescript
// In a project detail page
useProjectRealtime(projectId);  // Subscribes to project updates
```

## Data Flow

### 1. User Makes a Change (Client A)

```typescript
// Log operation locally
await db.syncOperations.add({
  id: opId,
  type: 'UPDATE',
  entity: 'project',
  entityId: projectId,
  data: { objet: 'New Title' },
  synced: false,
});

// Apply locally
await db.projects.update(projectId, { objet: 'New Title' });

// Push to server
await apiService.syncPush([operation], deviceId);
```

### 2. Server Processes Operation

```typescript
// Apply to database
await client.query(`UPDATE projects SET objet = $1 WHERE id = $2`, [data.objet, entityId]);

// Record in ops log
await client.query(`INSERT INTO ops (...) VALUES (...)`, [...]);
// ^ This triggers pg_notify automatically via trigger
```

### 3. Server Broadcasts via PostgreSQL NOTIFY

```sql
-- Trigger fires automatically
NOTIFY ops_channel, '{"server_seq": 123, "entity": "project", ...}';
```

### 4. Socket Server Receives NOTIFY

```typescript
pgClient.on('notification', (msg) => {
  const payload = JSON.parse(msg.payload);
  io.to(`user:${payload.user_id}`).emit('sync:op', payload);
});
```

### 5. Client B Receives Operation

```typescript
socket.on('sync:op', async (op) => {
  // Skip if from same device
  if (op.clientId === myDeviceId) return;
  
  // Apply to local Dexie
  await db.projects.put({ ...op.data, id: op.entityId });
  
  // React components using useLiveQuery auto-update
});
```

## Offline Support

### When Offline

1. Operations are stored in Dexie `syncOperations` table with `synced: false`
2. Changes are applied immediately to local database
3. UI works normally

### When Coming Back Online

```typescript
// Automatic recovery
window.addEventListener('online', async () => {
  // 1. Push pending operations
  await pushPendingOperations(userId);
  
  // 2. Pull missed operations
  await pullLatestOperations(userId);
  
  // 3. Reconnect WebSocket
  realtimeSync.reconnect();
});
```

## Event System

The system uses an event bus for cross-component communication:

```typescript
// Available events
REALTIME_EVENTS = {
  PROJECT_UPDATED: 'project:updated',
  BORDEREAU_UPDATED: 'bordereau:updated',
  PERIODE_UPDATED: 'periode:updated',
  METRE_UPDATED: 'metre:updated',
  DECOMPT_UPDATED: 'decompt:updated',
  PHOTO_UPDATED: 'photo:updated',
  PV_UPDATED: 'pv:updated',
  ATTACHMENT_UPDATED: 'attachment:updated',
  DATA_CHANGED: 'data:changed',
};

// Listen for events
realtimeEvents.on('project:updated', (data) => {
  console.log('Project changed:', data.entityId);
});
```

## Fallback Mechanism

If WebSocket connection fails:

1. After 3 failed connection attempts, polling starts
2. Polling interval: 5 seconds
3. When WebSocket reconnects, polling stops

```typescript
// Automatic fallback
if (reconnectAttempts >= 3) {
  startFallbackPolling(); // Poll every 5 seconds
}
```

## Configuration

### Backend (environment variables)

```env
# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=btpdb
POSTGRES_USER=btpuser
POSTGRES_PASSWORD=xxx

# JWT
JWT_SECRET=your-secret-key

# CORS
CORS_ORIGIN=*
```

### Frontend

```typescript
// In realtimeSync.ts
const REALTIME_CONFIG = {
  RECONNECT_DELAY_MIN: 1000,      // 1 second
  RECONNECT_DELAY_MAX: 30000,     // 30 seconds
  RECONNECT_ATTEMPTS_MAX: 10,
  FALLBACK_POLL_INTERVAL: 5000,   // 5 seconds
};
```

## Files Modified/Created

### Backend

- `backend/src/index.ts` - Added Socket.IO initialization
- `backend/src/realtime/socketServer.ts` - Socket.IO server (NEW)
- `backend/src/realtime/pgNotify.ts` - PostgreSQL triggers (NEW)
- `backend/src/realtime/index.ts` - Module exports (NEW)
- `backend/package.json` - Added socket.io dependency

### Frontend

- `frontend-web/src/services/realtimeSync.ts` - WebSocket client (NEW)
- `frontend-web/src/services/offlineSyncQueue.ts` - Offline handler (NEW)
- `frontend-web/src/hooks/useRealtimeSync.ts` - Realtime hook (NEW)
- `frontend-web/src/hooks/useProjectRealtime.ts` - Project subscription hook (NEW)
- `frontend-web/src/hooks/useSyncManagerV3.ts` - Updated with realtime support
- `frontend-web/src/hooks/index.ts` - Added new exports
- `frontend-web/src/components/SyncIndicator.tsx` - Added realtime status
- `frontend-web/package.json` - Added socket.io-client dependency

## Testing Scenarios

### Scenario 1: A modifies → B sees instantly

1. User A opens project
2. User A changes project name
3. Within 1 second, User B sees the new name (no refresh needed)

### Scenario 2: Offline editing

1. User A goes offline
2. User A makes changes
3. User A comes back online
4. Changes sync automatically
5. User B sees the changes

### Scenario 3: Concurrent editing

1. User A edits field X
2. User B edits field Y (same record)
3. Both changes merge (last-write-wins per field)

## Troubleshooting

### WebSocket not connecting

1. Check if server is running
2. Verify JWT token is valid
3. Check CORS settings
4. Check firewall/proxy settings

### Data not syncing

1. Check browser console for errors
2. Verify `syncOperations` table has pending items
3. Manually trigger sync with `sync()` function
4. Check server logs for errors

### Pages showing loading forever

1. Verify Dexie database has data
2. Check if user ID matches in queries
3. Ensure entity IDs are normalized correctly

## Best Practices

1. **Always use `useLiveQuery`** - Ensures automatic UI updates
2. **Normalize IDs** - Use `entity:uuid` format consistently
3. **Handle offline** - Always save to Dexie first, then sync
4. **Subscribe to projects** - Use `useProjectRealtime` on detail pages
5. **Clean old operations** - Run `cleanOldOperations()` periodically
