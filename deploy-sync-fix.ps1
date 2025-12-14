# PowerShell Deployment Script for Sync & WebSocket fixes

$ErrorActionPreference = "Stop"

$SERVER = "root@162.55.219.151"
$REMOTE_BACKEND = "/root/btp-backend"
$REMOTE_NGINX = "/etc/nginx/sites-available/btp-app"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Blue
Write-Host "=== BTP Sync & WebSocket Deployment ===" -ForegroundColor Blue
Write-Host "==========================================" -ForegroundColor Blue
Write-Host ""

# Check if we're in the correct directory
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Error: Must be run from project root directory" -ForegroundColor Red
    exit 1
}

Write-Host "📦 Step 1: Building backend locally..." -ForegroundColor Cyan
Set-Location backend
npm run build
Set-Location ..
Write-Host "✅ Backend built successfully" -ForegroundColor Green
Write-Host ""

Write-Host "📤 Step 2: Uploading files to server..." -ForegroundColor Cyan

# Upload middleware files
Write-Host "  → Uploading errorHandler.ts..."
scp backend/src/middleware/errorHandler.ts "${SERVER}:${REMOTE_BACKEND}/src/middleware/"

Write-Host "  → Uploading jsonOnly.ts..."
scp backend/src/middleware/jsonOnly.ts "${SERVER}:${REMOTE_BACKEND}/src/middleware/"

Write-Host "  → Uploading index.ts..."
scp backend/src/index.ts "${SERVER}:${REMOTE_BACKEND}/src/"

Write-Host "  → Uploading nginx config..."
scp nginx-btp.conf "${SERVER}:${REMOTE_NGINX}"

Write-Host "✅ Files uploaded successfully" -ForegroundColor Green
Write-Host ""

Write-Host "🔨 Step 3: Building backend on server..." -ForegroundColor Cyan
ssh $SERVER @"
cd /root/btp-backend
echo '  → Running npm install (if needed)...'
npm install --production=false
echo '  → Building TypeScript...'
npm run build
echo '✅ Backend built on server'
"@
Write-Host ""

Write-Host "🔄 Step 4: Restarting services..." -ForegroundColor Cyan
ssh $SERVER @"
# Test nginx config
echo '  → Testing nginx configuration...'
sudo nginx -t

if [ \$? -eq 0 ]; then
    echo '  → Nginx config valid, reloading...'
    sudo systemctl reload nginx
    echo '✅ Nginx reloaded'
else
    echo '❌ Nginx config test failed!'
    exit 1
fi

# Restart backend
echo '  → Restarting backend with PM2...'
pm2 restart btp-backend
echo '✅ Backend restarted'
"@
Write-Host ""

Write-Host "⏳ Step 5: Waiting for services to stabilize..." -ForegroundColor Cyan
Start-Sleep -Seconds 5
Write-Host ""

Write-Host "🧪 Step 6: Running health checks..." -ForegroundColor Cyan
ssh $SERVER @"
# Check if backend is running
if pm2 status | grep -q 'online.*btp-backend'; then
    echo '✅ Backend is running'
else
    echo '❌ Backend is not running!'
    pm2 logs btp-backend --lines 20
    exit 1
fi

# Check nginx status
if sudo systemctl is-active --quiet nginx; then
    echo '✅ Nginx is running'
else
    echo '❌ Nginx is not running!'
    sudo systemctl status nginx
    exit 1
fi

# Test health endpoint
echo '  → Testing health endpoint...'
HEALTH_RESPONSE=\$(curl -s http://localhost:3000/health)
if echo \"\$HEALTH_RESPONSE\" | grep -q '\"status\":\"OK\"'; then
    echo '✅ Health check passed'
else
    echo '❌ Health check failed!'
    echo \"Response: \$HEALTH_RESPONSE\"
    exit 1
fi
"@
Write-Host ""

Write-Host "📊 Step 7: Showing recent logs..." -ForegroundColor Cyan
ssh $SERVER "pm2 logs btp-backend --lines 30 --nostream"
Write-Host ""

Write-Host "==========================================" -ForegroundColor Green
Write-Host "✅ DEPLOYMENT COMPLETED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Next steps:"
Write-Host "  1. Test WebSocket connection in browser DevTools"
Write-Host "  2. Test sync push/pull operations"
Write-Host "  3. Verify real-time updates between users"
Write-Host ""
Write-Host "🔍 Monitor logs with:"
Write-Host "  ssh $SERVER 'pm2 logs btp-backend'"
Write-Host ""
Write-Host "🔄 If issues occur, rollback with:"
Write-Host "  ssh $SERVER 'pm2 restart btp-backend'"
Write-Host ""
