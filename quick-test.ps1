# Quick Test Script - Run locally before deployment

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "=== Quick Pre-Deployment Test ===" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Check all modified files exist
Write-Host "✓ Checking modified files..." -ForegroundColor Yellow

$files = @(
    "backend\src\middleware\errorHandler.ts",
    "backend\src\middleware\jsonOnly.ts",
    "backend\src\index.ts",
    "nginx-btp.conf"
)

$allExist = $true
foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "  ✅ $file" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $file - NOT FOUND!" -ForegroundColor Red
        $allExist = $false
    }
}

if (-not $allExist) {
    Write-Host ""
    Write-Host "❌ Some files are missing! Cannot proceed." -ForegroundColor Red
    exit 1
}

Write-Host ""

# Test 2: Check TypeScript compilation
Write-Host "✓ Testing TypeScript compilation..." -ForegroundColor Yellow
Set-Location backend

$buildOutput = npm run build 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✅ TypeScript compiled successfully" -ForegroundColor Green
} else {
    Write-Host "  ❌ TypeScript compilation failed!" -ForegroundColor Red
    Write-Host $buildOutput
    Set-Location ..
    exit 1
}

Set-Location ..
Write-Host ""

# Test 3: Check if nginx config is valid syntax
Write-Host "✓ Checking nginx config syntax..." -ForegroundColor Yellow
$nginxContent = Get-Content "nginx-btp.conf" -Raw

$requiredPatterns = @(
    "location /socket.io/",
    "proxy_set_header Upgrade",
    "proxy_set_header Connection",
    "proxy_buffering off"
)

$allPatterns = $true
foreach ($pattern in $requiredPatterns) {
    if ($nginxContent -match [regex]::Escape($pattern)) {
        Write-Host "  ✅ Found: $pattern" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Missing: $pattern" -ForegroundColor Red
        $allPatterns = $false
    }
}

if (-not $allPatterns) {
    Write-Host ""
    Write-Host "❌ Nginx config is incomplete!" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Test 4: Check middleware imports
Write-Host "✓ Checking middleware imports..." -ForegroundColor Yellow
$indexContent = Get-Content "backend\src\index.ts" -Raw

if ($indexContent -match "import.*ensureJsonResponse") {
    Write-Host "  ✅ ensureJsonResponse imported" -ForegroundColor Green
} else {
    Write-Host "  ❌ ensureJsonResponse not imported!" -ForegroundColor Red
    exit 1
}

if ($indexContent -match "app\.use\(ensureJsonResponse\)") {
    Write-Host "  ✅ ensureJsonResponse middleware used" -ForegroundColor Green
} else {
    Write-Host "  ❌ ensureJsonResponse not used in middleware chain!" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Green
Write-Host "✅ ALL PRE-DEPLOYMENT CHECKS PASSED!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "You can now deploy using:" -ForegroundColor Cyan
Write-Host "  .\deploy-sync-fix.ps1" -ForegroundColor White
Write-Host ""
Write-Host "Or deploy manually following:" -ForegroundColor Cyan
Write-Host "  SYNC_FIX_DEPLOYMENT_GUIDE.md" -ForegroundColor White
Write-Host ""
