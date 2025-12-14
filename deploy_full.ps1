# PowerShell Deployment Script for Full System (Frontend + Backend)
# Requires SSH key to be loaded or passwordless access to the server

$ErrorActionPreference = "Stop"

$SERVER = "root@162.55.219.151"
$REMOTE_BACKEND = "/root/btp-backend"
$REMOTE_FRONTEND = "/var/www/btp-app"
$LOCAL_FRONTEND = "frontend-web"
$LOCAL_BACKEND = "backend"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Blue
Write-Host "=== BTP FULL SYSTEM DEPLOYMENT ===" -ForegroundColor Blue
Write-Host "==========================================" -ForegroundColor Blue
Write-Host ""

# Check location
if (-not (Test-Path "$LOCAL_BACKEND/package.json")) {
    Write-Host "[ERROR] Run from project root" -ForegroundColor Red
    exit 1
}

# ==================== FRONTEND ====================

Write-Host "[FRONTEND] Step 1: Building Frontend Web..." -ForegroundColor Cyan
Set-Location $LOCAL_FRONTEND
try {
    npm run build
}
catch {
    Write-Host "[ERROR] Frontend build failed!" -ForegroundColor Red
    exit 1
}
Set-Location ..
Write-Host "[OK] Frontend built successfully" -ForegroundColor Green
Write-Host ""

Write-Host "[FRONTEND] Step 2: Uploading Frontend..." -ForegroundColor Cyan
# Clean remote directory first (Optional but recommended)
ssh $SERVER "rm -rf $REMOTE_FRONTEND/*"
scp -r "$LOCAL_FRONTEND/dist/*" "${SERVER}:${REMOTE_FRONTEND}/"
Write-Host "[OK] Frontend uploaded" -ForegroundColor Green
Write-Host ""


# ==================== BACKEND ====================

Write-Host "[BACKEND] Step 3: Building Backend locally (Verification)..." -ForegroundColor Cyan
Set-Location $LOCAL_BACKEND
try {
    npm run build
}
catch {
    Write-Host "[ERROR] Backend local build failed!" -ForegroundColor Red
    exit 1
}
Set-Location ..
Write-Host "[OK] Backend local build verified" -ForegroundColor Green
Write-Host ""

Write-Host "[BACKEND] Step 4: Uploading Backend Source..." -ForegroundColor Cyan

$BACKEND_FILES = @("src", "package.json", "tsconfig.json", "docker-compose-server.yml", "nginx-btp.conf")

foreach ($file in $BACKEND_FILES) {
    Write-Host "  -> Uploading $file..."
    if (Test-Path "$LOCAL_BACKEND/$file") {
        scp -r "$LOCAL_BACKEND/$file" "${SERVER}:${REMOTE_BACKEND}/"
    }
    else {
        Write-Host "[WARN] $file not found" -ForegroundColor Yellow
    }
}
Write-Host "[OK] Backend source uploaded" -ForegroundColor Green
Write-Host ""


# ==================== SERVER OPS ====================

Write-Host "[SERVER] Step 5: Remote Build and Restart..." -ForegroundColor Cyan

$commands = @"
set -e

echo '  -> Cleaning up Docker...'
docker system prune -f

cd $REMOTE_BACKEND

echo '  -> Installing dependencies...'
npm install --production=false --quiet

echo '  -> Building Backend...'
npm run build

echo '  -> Updating Nginx Config...'
cp nginx-btp.conf /etc/nginx/sites-available/btp-app
ln -sf /etc/nginx/sites-available/btp-app /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx

echo '  -> Restarting Backend Service (PM2)...'

if [ -f "docker-compose-server.yml" ]; then
    echo '  -> Found docker-compose-server.yml, restarting via Docker...'
    docker-compose -f docker-compose-server.yml down
    docker-compose -f docker-compose-server.yml up -d --build
else
    echo '  -> No docker-compose-server.yml found, using PM2...'
    # Use || for fallback
    pm2 restart btp-backend || pm2 start dist/index.js --name btp-backend
fi
"@

# Execute remote commands
ssh $SERVER $commands

Write-Host "[OK] Remote operations complete" -ForegroundColor Green

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "DEPLOYMENT FINISHED!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host "Verify at http://162.55.219.151"
