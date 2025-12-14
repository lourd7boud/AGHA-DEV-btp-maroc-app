#!/bin/bash
# Deployment script for Sync & WebSocket fixes

set -e  # Exit on any error

SERVER="root@162.55.219.151"
REMOTE_BACKEND="/root/btp-backend"
REMOTE_NGINX="/etc/nginx/sites-available/btp-app"

echo ""
echo "=========================================="
echo "=== BTP Sync & WebSocket Deployment ==="
echo "=========================================="
echo ""

# Check if we're in the correct directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Must be run from project root directory"
    exit 1
fi

echo "📦 Step 1: Building backend locally..."
cd backend
npm run build
cd ..
echo "✅ Backend built successfully"
echo ""

echo "📤 Step 2: Uploading files to server..."

# Upload middleware files
echo "  → Uploading errorHandler.ts..."
scp backend/src/middleware/errorHandler.ts $SERVER:$REMOTE_BACKEND/src/middleware/

echo "  → Uploading jsonOnly.ts..."
scp backend/src/middleware/jsonOnly.ts $SERVER:$REMOTE_BACKEND/src/middleware/

echo "  → Uploading index.ts..."
scp backend/src/index.ts $SERVER:$REMOTE_BACKEND/src/

echo "  → Uploading nginx config..."
scp nginx-btp.conf $SERVER:$REMOTE_NGINX

echo "✅ Files uploaded successfully"
echo ""

echo "🔨 Step 3: Building backend on server..."
ssh $SERVER << 'ENDSSH'
cd /root/btp-backend
echo "  → Running npm install (if needed)..."
npm install --production=false
echo "  → Building TypeScript..."
npm run build
echo "✅ Backend built on server"
ENDSSH
echo ""

echo "🔄 Step 4: Restarting services..."
ssh $SERVER << 'ENDSSH'
# Test nginx config
echo "  → Testing nginx configuration..."
sudo nginx -t

if [ $? -eq 0 ]; then
    echo "  → Nginx config valid, reloading..."
    sudo systemctl reload nginx
    echo "✅ Nginx reloaded"
else
    echo "❌ Nginx config test failed!"
    exit 1
fi

# Restart backend
echo "  → Restarting backend with PM2..."
pm2 restart btp-backend
echo "✅ Backend restarted"
ENDSSH
echo ""

echo "⏳ Step 5: Waiting for services to stabilize..."
sleep 5
echo ""

echo "🧪 Step 6: Running health checks..."
ssh $SERVER << 'ENDSSH'
# Check if backend is running
if pm2 status | grep -q "online.*btp-backend"; then
    echo "✅ Backend is running"
else
    echo "❌ Backend is not running!"
    pm2 logs btp-backend --lines 20
    exit 1
fi

# Check nginx status
if sudo systemctl is-active --quiet nginx; then
    echo "✅ Nginx is running"
else
    echo "❌ Nginx is not running!"
    sudo systemctl status nginx
    exit 1
fi

# Test health endpoint
echo "  → Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s http://localhost:3000/health)
if echo "$HEALTH_RESPONSE" | grep -q '"status":"OK"'; then
    echo "✅ Health check passed"
else
    echo "❌ Health check failed!"
    echo "Response: $HEALTH_RESPONSE"
    exit 1
fi
ENDSSH
echo ""

echo "📊 Step 7: Showing recent logs..."
ssh $SERVER "pm2 logs btp-backend --lines 30 --nostream"
echo ""

echo "=========================================="
echo "✅ DEPLOYMENT COMPLETED SUCCESSFULLY!"
echo "=========================================="
echo ""
echo "📝 Next steps:"
echo "  1. Test WebSocket connection in browser DevTools"
echo "  2. Test sync push/pull operations"
echo "  3. Verify real-time updates between users"
echo ""
echo "🔍 Monitor logs with:"
echo "  ssh $SERVER 'pm2 logs btp-backend'"
echo ""
echo "🔄 If issues occur, rollback with:"
echo "  ssh $SERVER 'pm2 restart btp-backend'"
echo ""
