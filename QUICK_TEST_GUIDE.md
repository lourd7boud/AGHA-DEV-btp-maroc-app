# ⚡ Quick Test Script - Production Verification

## 🎯 Fast Production Testing (5 minutes)

Run these tests immediately after deployment to verify all fixes are working.

---

## 🧪 Test 1: WebSocket Connection (2 min)

### Browser Test:
```javascript
// Open: http://162.55.219.151
// Open DevTools Console (F12)
// Run:

// 1. Check connection
localStorage.getItem('clientSessionId')
// Should return: "session-device-xyz-timestamp"

// 2. Check WebSocket in Network tab
// Filter: "socket.io"
// Look for: Status 101, Type: websocket

// 3. Check console logs:
// Should see: "✅ Connected to realtime server"
// Should NOT see: "Falling back to polling"
```

### Expected Output:
```
✅ Connected to realtime server
🔌 Socket.IO URL: http://162.55.219.151
🔌 [REALTIME] Using VITE_API_URL: http://162.55.219.151
✅ Realtime status changed: connected
```

### ❌ If Failed:
```bash
# Check nginx
sudo nginx -t
sudo tail -f /var/log/nginx/error.log

# Restart backend
pm2 restart btp-backend
pm2 logs btp-backend
```

---

## 🧪 Test 2: No DELETE Loops (1 min)

### Browser Test:
```javascript
// Open: http://162.55.219.151
// Login as user
// Open DevTools Console
// Look for INIT SYNC logs:

// Expected:
// [SYNC] INIT_SYNC_START
// [SYNC] BULK_CREATE projects
// [SYNC] BULK_CREATE bordereaux
// [SYNC] BULK_CREATE periodes
// [SYNC] SYNC_COMPLETE

// Should NOT see:
// [SYNC] BULK_DELETE  ❌ NO!
// DELETE operation ❌ NO!
```

### Backend Test:
```bash
# Check backend logs for DELETE operations
pm2 logs btp-backend --lines 100 | grep -i delete

# Should NOT see:
# "full-sync-project-delete-" ❌
# "DELETE operation without sender" ❌

# Should see (only if user actually deleted something):
# "DELETE operation with sender" ✅
```

### Count Projects:
```sql
psql -U btpuser -d btpdb -c "
  SELECT 
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE deleted_at IS NULL) as active,
    COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) as deleted
  FROM projects;
"
```

Expected:
```
 total | active | deleted 
-------+--------+---------
    10 |      6 |       4
```

---

## 🧪 Test 3: Electron App (2 min)

### Install & Test:
```bash
# Install from release folder
cd frontend-electron/release
# Double-click installer or run:
"BTP Maroc - Gestion de Projets Setup 1.0.0.exe"
```

### After Launch:
1. Press **F12** to open DevTools
2. Check Console logs:

### Expected Output:
```
🚀 [MAIN] Starting Electron App...
🔧 [MAIN] API_URL: http://162.55.219.151
🔧 [MAIN] NODE_ENV: production
🔧 [PRELOAD] API_URL: http://162.55.219.151
🔧 [PRELOAD] Initializing context bridge...
🔌 [API] Using Electron API URL: http://162.55.219.151
🔌 [REALTIME] Using Electron API URL: http://162.55.219.151
✅ Connected to realtime server
[SYNC] INIT_SYNC_START
[SYNC] BULK_CREATE projects
[SYNC] SYNC_COMPLETE
Applied: 94, Skipped: 0, Errors: 0
```

3. **Visual Check:**
   - ✅ Projects visible
   - ✅ Total projects count matches web
   - ✅ Can create new project
   - ✅ Realtime sync works (test with another device)

### ❌ If White Screen:
```bash
# Check if frontend-web was built with VITE_API_URL
cd frontend-web
VITE_API_URL=http://162.55.219.151 npm run build

# Rebuild electron
cd ../frontend-electron
npm run copy:renderer
VITE_API_URL=http://162.55.219.151 npm run build:win
```

---

## 🎯 Quick Verification Checklist

Copy-paste this in your test document:

```
Date: ___________
Tester: ___________

WebSocket:
[ ] Status 101 in Network tab
[ ] Console: "Connected to realtime server"
[ ] Console: "transport: websocket"
[ ] No "falling back to polling"

DELETE Loops:
[ ] INIT SYNC has 0 DELETE operations
[ ] Total projects count stable after refresh
[ ] No "BULK_DELETE" in console
[ ] Backend logs: No "DELETE without sender"

Electron:
[ ] App loads (no white screen)
[ ] Console: API_URL logged
[ ] Console: INIT SYNC completes
[ ] Projects visible in UI
[ ] Can create/edit/delete projects
[ ] Realtime sync works

Performance:
[ ] Page load < 3 seconds
[ ] Sync complete < 5 seconds
[ ] WebSocket ping < 100ms
[ ] No errors in console

Overall:
[ ] All tests passed ✅
[ ] Ready for production ✅
```

---

## 📊 Success Metrics

### WebSocket:
- Connection Success: **>95%**
- Average Latency: **<50ms**
- Reconnect Time: **<2s**

### Sync:
- DELETE Operations in INIT: **0**
- Data Integrity: **100%**
- Sync Errors: **<1%**

### Electron:
- App Load Success: **100%**
- INIT SYNC Success: **>98%**
- API Calls Success: **>99%**

---

## 🚨 Red Flags (Stop & Fix Immediately)

❌ **WebSocket Red Flags:**
- Status 400/403/404 on socket.io connection
- "Falling back to polling" message
- Constant reconnect loops

❌ **DELETE Red Flags:**
- "BULK_DELETE" in INIT SYNC
- Projects disappear after refresh
- "DELETE without sender" in backend logs

❌ **Electron Red Flags:**
- White screen on launch
- No API_URL in console
- INIT SYNC fails
- No projects visible

---

## 🔧 Quick Fixes

### WebSocket Issues:
```bash
sudo nginx -t && sudo nginx -s reload
pm2 restart btp-backend
```

### DELETE Issues:
```bash
# Check sync controller
grep -A 5 "full sync requested" backend/src/controllers/sync.controller.pg.ts
# Line 192 should have: AND deleted_at IS NULL
```

### Electron Issues:
```bash
# Rebuild with correct env
cd frontend-web && VITE_API_URL=http://162.55.219.151 npm run build
cd ../frontend-electron && npm run copy:renderer && npm run build:win
```

---

## 📝 Test Report Template

```markdown
# Production Test Report
Date: 2025-01-14
Environment: http://162.55.219.151

## WebSocket Test
- Status Code: 101 ✅
- Transport: websocket ✅
- Latency: 23ms ✅
- Stability: Excellent ✅

## DELETE Test
- INIT SYNC DELETE count: 0 ✅
- Projects stable: Yes ✅
- Backend logs clean: Yes ✅

## Electron Test
- App loads: Yes ✅
- INIT SYNC: Success ✅
- Projects count: 6 ✅
- Realtime: Working ✅

## Overall
Status: ✅ PASSED
Ready for production: YES
Issues found: 0
```

---

**Run these tests immediately after deployment! ⚡**
