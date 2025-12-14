# Quick Production Test Script
# Run: .\quick-production-test.ps1

param(
    [string]$ServerUrl = "http://162.55.219.151"
)

Write-Host "🚀 Starting Production Quick Test..." -ForegroundColor Cyan
Write-Host "Server: $ServerUrl" -ForegroundColor Yellow
Write-Host ""

$script:PassedTests = 0
$script:FailedTests = 0

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [string]$ExpectedStatus = "200"
    )
    
    Write-Host "Testing: $Name..." -NoNewline
    
    try {
        $response = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec 10 -UseBasicParsing
        
        if ($response.StatusCode -eq $ExpectedStatus) {
            Write-Host " ✅ PASSED" -ForegroundColor Green
            $script:PassedTests++
            return $true
        } else {
            Write-Host " ❌ FAILED (Status: $($response.StatusCode))" -ForegroundColor Red
            $script:FailedTests++
            return $false
        }
    } catch {
        Write-Host " ❌ FAILED (Error: $($_.Exception.Message))" -ForegroundColor Red
        $script:FailedTests++
        return $false
    }
}

function Test-WebSocket {
    Write-Host "Testing: WebSocket Support..." -NoNewline
    
    try {
        # Test if socket.io endpoint is accessible
        $response = Invoke-WebRequest -Uri "$ServerUrl/socket.io/?EIO=4&transport=polling" -Method Get -TimeoutSec 10 -UseBasicParsing
        
        if ($response.StatusCode -eq 200 -and $response.Content -like "*sid*") {
            Write-Host " ✅ PASSED" -ForegroundColor Green
            $script:PassedTests++
            return $true
        } else {
            Write-Host " ❌ FAILED (No socket.io response)" -ForegroundColor Red
            $script:FailedTests++
            return $false
        }
    } catch {
        Write-Host " ❌ FAILED (Error: $($_.Exception.Message))" -ForegroundColor Red
        $script:FailedTests++
        return $false
    }
}

function Test-NginxConfig {
    Write-Host "Testing: Nginx Configuration..." -NoNewline
    
    try {
        # Check if nginx is running
        $nginxProcess = Get-Process nginx -ErrorAction SilentlyContinue
        
        if ($nginxProcess) {
            Write-Host " ✅ PASSED (Nginx running)" -ForegroundColor Green
            $script:PassedTests++
            return $true
        } else {
            Write-Host " ⚠️  WARNING (Nginx not detected locally - might be on remote server)" -ForegroundColor Yellow
            return $true
        }
    } catch {
        Write-Host " ⚠️  WARNING (Cannot check Nginx locally)" -ForegroundColor Yellow
        return $true
    }
}

function Test-BackendHealth {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "Backend Health Checks" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    
    Test-Endpoint "API Health" "$ServerUrl/api/health" "200"
    Test-WebSocket
}

function Test-FrontendBuild {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "Frontend Build Checks" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    
    Write-Host "Checking: Frontend Web build..." -NoNewline
    if (Test-Path "frontend-web\dist\index.html") {
        Write-Host " ✅ PASSED" -ForegroundColor Green
        $script:PassedTests++
    } else {
        Write-Host " ❌ FAILED (dist not found)" -ForegroundColor Red
        $script:FailedTests++
    }
    
    Write-Host "Checking: Frontend Web assets..." -NoNewline
    if (Test-Path "frontend-web\dist\assets") {
        $assetCount = (Get-ChildItem "frontend-web\dist\assets" -File).Count
        Write-Host " ✅ PASSED ($assetCount files)" -ForegroundColor Green
        $script:PassedTests++
    } else {
        Write-Host " ❌ FAILED (assets not found)" -ForegroundColor Red
        $script:FailedTests++
    }
}

function Test-ElectronBuild {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "Electron Build Checks" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    
    Write-Host "Checking: Electron main process..." -NoNewline
    if (Test-Path "frontend-electron\dist\main\index.js") {
        Write-Host " ✅ PASSED" -ForegroundColor Green
        $script:PassedTests++
    } else {
        Write-Host " ❌ FAILED (main process not built)" -ForegroundColor Red
        $script:FailedTests++
    }
    
    Write-Host "Checking: Electron preload..." -NoNewline
    if (Test-Path "frontend-electron\dist\main\preload.js") {
        Write-Host " ✅ PASSED" -ForegroundColor Green
        $script:PassedTests++
    } else {
        Write-Host " ❌ FAILED (preload not built)" -ForegroundColor Red
        $script:FailedTests++
    }
    
    Write-Host "Checking: Electron renderer..." -NoNewline
    if (Test-Path "frontend-electron\dist\renderer\index.html") {
        Write-Host " ✅ PASSED" -ForegroundColor Green
        $script:PassedTests++
    } else {
        Write-Host " ❌ FAILED (renderer not copied)" -ForegroundColor Red
        $script:FailedTests++
    }
    
    Write-Host "Checking: Electron installer..." -NoNewline
    $installer = Get-ChildItem "frontend-electron\release\*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($installer) {
        $sizeMB = [math]::Round($installer.Length / 1MB, 2)
        Write-Host " ✅ PASSED ($sizeMB MB)" -ForegroundColor Green
        $script:PassedTests++
    } else {
        Write-Host " ❌ FAILED (installer not found)" -ForegroundColor Red
        $script:FailedTests++
    }
}

function Test-ConfigFiles {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "Configuration Checks" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    
    Write-Host "Checking: nginx-realtime.conf..." -NoNewline
    if (Test-Path "nginx-realtime.conf") {
        $content = Get-Content "nginx-realtime.conf" -Raw
        
        $hasWebSocketSupport = $content -match "proxy_set_header Upgrade"
        $hasBufferingOff = $content -match "proxy_buffering off"
        
        if ($hasWebSocketSupport -and $hasBufferingOff) {
            Write-Host " ✅ PASSED (WebSocket config OK)" -ForegroundColor Green
            $script:PassedTests++
        } else {
            Write-Host " ⚠️  WARNING (Missing critical config)" -ForegroundColor Yellow
            if (-not $hasWebSocketSupport) { Write-Host "  - Missing: Upgrade header" -ForegroundColor Yellow }
            if (-not $hasBufferingOff) { Write-Host "  - Missing: proxy_buffering off" -ForegroundColor Yellow }
        }
    } else {
        Write-Host " ❌ FAILED (config not found)" -ForegroundColor Red
        $script:FailedTests++
    }
    
    Write-Host "Checking: sync.controller.pg.ts..." -NoNewline
    if (Test-Path "backend\src\controllers\sync.controller.pg.ts") {
        $content = Get-Content "backend\src\controllers\sync.controller.pg.ts" -Raw
        
        # Check for the critical fix: deleted_at IS NULL in full sync
        $hasDeleteFix = $content -match "WHERE user_id = \$\d+ AND deleted_at IS NULL"
        
        if ($hasDeleteFix) {
            Write-Host " ✅ PASSED (DELETE fix applied)" -ForegroundColor Green
            $script:PassedTests++
        } else {
            Write-Host " ❌ FAILED (DELETE fix NOT applied)" -ForegroundColor Red
            Write-Host "  - Missing: AND deleted_at IS NULL in full sync query" -ForegroundColor Red
            $script:FailedTests++
        }
    } else {
        Write-Host " ❌ FAILED (file not found)" -ForegroundColor Red
        $script:FailedTests++
    }
    
    Write-Host "Checking: preload.ts..." -NoNewline
    if (Test-Path "frontend-electron\src\main\preload.ts") {
        $content = Get-Content "frontend-electron\src\main\preload.ts" -Raw
        
        $hasApiUrl = $content -match "apiUrl:"
        
        if ($hasApiUrl) {
            Write-Host " ✅ PASSED (API URL exposed)" -ForegroundColor Green
            $script:PassedTests++
        } else {
            Write-Host " ❌ FAILED (API URL NOT exposed)" -ForegroundColor Red
            $script:FailedTests++
        }
    } else {
        Write-Host " ❌ FAILED (file not found)" -ForegroundColor Red
        $script:FailedTests++
    }
}

function Show-Summary {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "Test Summary" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Passed: " -NoNewline
    Write-Host $script:PassedTests -ForegroundColor Green
    Write-Host "Failed: " -NoNewline
    Write-Host $script:FailedTests -ForegroundColor Red
    Write-Host ""
    
    $total = $script:PassedTests + $script:FailedTests
    $percentage = if ($total -gt 0) { [math]::Round(($script:PassedTests / $total) * 100, 2) } else { 0 }
    
    Write-Host "Success Rate: " -NoNewline
    if ($percentage -ge 90) {
        Write-Host "$percentage%" -ForegroundColor Green
    } elseif ($percentage -ge 70) {
        Write-Host "$percentage%" -ForegroundColor Yellow
    } else {
        Write-Host "$percentage%" -ForegroundColor Red
    }
    
    Write-Host ""
    if ($script:FailedTests -eq 0) {
        Write-Host "✅ All tests passed! Ready for production." -ForegroundColor Green
    } elseif ($script:FailedTests -le 2) {
        Write-Host "⚠️  Some tests failed. Review and fix issues." -ForegroundColor Yellow
    } else {
        Write-Host "❌ Multiple tests failed. NOT ready for production!" -ForegroundColor Red
    }
    Write-Host ""
}

function Show-NextSteps {
    if ($script:FailedTests -gt 0) {
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
        Write-Host "Recommended Actions" -ForegroundColor Yellow
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "1. Review CRITICAL_FIXES_DEPLOYMENT.md" -ForegroundColor Yellow
        Write-Host "2. Check QUICK_TEST_GUIDE.md for detailed steps" -ForegroundColor Yellow
        Write-Host "3. Fix failed tests before deployment" -ForegroundColor Yellow
        Write-Host ""
    } else {
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
        Write-Host "Ready to Deploy!" -ForegroundColor Green
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next Steps:" -ForegroundColor Green
        Write-Host "1. Deploy backend: cd backend && npm run build && pm2 restart btp-backend" -ForegroundColor Cyan
        Write-Host "2. Update nginx: sudo cp nginx-realtime.conf /etc/nginx/sites-available/default && sudo nginx -s reload" -ForegroundColor Cyan
        Write-Host "3. Deploy frontend: cd frontend-web && sudo cp -r dist/* /var/www/btp/" -ForegroundColor Cyan
        Write-Host "4. Test with QUICK_TEST_GUIDE.md" -ForegroundColor Cyan
        Write-Host ""
    }
}

# Run all tests
Test-NginxConfig
Test-BackendHealth
Test-FrontendBuild
Test-ElectronBuild
Test-ConfigFiles

# Show results
Show-Summary
Show-NextSteps

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "Test completed at: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
