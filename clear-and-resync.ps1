# 🔄 سكريبت التنظيف والمزامنة الكاملة
# Clear and Resync Script for BTP Application

Write-Host "🔄 بدء عملية التنظيف والمزامنة الكاملة..." -ForegroundColor Cyan
Write-Host ""

# المرحلة 1: تنظيف Electron
Write-Host "📱 المرحلة 1: تنظيف تطبيق Electron..." -ForegroundColor Yellow
Write-Host "⚠️  يرجى إغلاق التطبيق Electron إذا كان مفتوحاً..." -ForegroundColor Red
Pause

$electronDataPath = "$env:APPDATA\Gestion de Projets"
if (Test-Path $electronDataPath) {
    Remove-Item "$electronDataPath\*" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "✅ تم مسح بيانات Electron" -ForegroundColor Green
} else {
    Write-Host "ℹ️  لا توجد بيانات Electron لمسحها" -ForegroundColor Gray
}

Write-Host ""

# المرحلة 2: إعادة بناء الملفات
Write-Host "🔨 المرحلة 2: إعادة بناء Frontend..." -ForegroundColor Yellow
Set-Location c:\4444\frontend-web
Write-Host "⏳ جاري البناء... (قد يستغرق 20-30 ثانية)" -ForegroundColor Gray

npm run build 2>&1 | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ تم بناء Frontend بنجاح" -ForegroundColor Green
} else {
    Write-Host "❌ فشل بناء Frontend" -ForegroundColor Red
    exit 1
}

Write-Host ""

# المرحلة 3: نشر التحديثات
Write-Host "🚀 المرحلة 3: نشر التحديثات..." -ForegroundColor Yellow

# نسخ إلى Electron
Write-Host "📋 نسخ إلى Electron..." -ForegroundColor Gray
Copy-Item -Recurse -Force c:\4444\frontend-web\dist\* c:\4444\electron-app\renderer\
Write-Host "✅ تم نسخ الملفات إلى Electron" -ForegroundColor Green

# نسخ إلى الخادم
Write-Host "🌐 نسخ إلى الخادم..." -ForegroundColor Gray
scp -r c:\4444\frontend-web\dist\* root@162.55.219.151:/var/www/btp/ 2>&1 | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ تم نشر التحديثات على الخادم" -ForegroundColor Green
} else {
    Write-Host "⚠️  تحذير: قد تكون هناك مشكلة في النشر على الخادم" -ForegroundColor Yellow
}

Write-Host ""

# المرحلة 4: التعليمات النهائية
Write-Host "✅ اكتملت عملية التنظيف والتحديث!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 الخطوات التالية:" -ForegroundColor Cyan
Write-Host ""
Write-Host "   1️⃣  شغل تطبيق Electron من جديد:" -ForegroundColor White
Write-Host "      cd c:\4444\frontend-electron" -ForegroundColor Gray
Write-Host "      npm run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "   2️⃣  في المتصفح (http://162.55.219.151):" -ForegroundColor White
Write-Host "      • اضغط F12 لفتح Developer Tools" -ForegroundColor Gray
Write-Host "      • في Console، نفذ الأوامر التالية:" -ForegroundColor Gray
Write-Host ""
Write-Host "      localStorage.clear()" -ForegroundColor Magenta
Write-Host "      indexedDB.deleteDatabase('ProjetGestionDB')" -ForegroundColor Magenta
Write-Host "      caches.keys().then(names => names.forEach(name => caches.delete(name)))" -ForegroundColor Magenta
Write-Host ""
Write-Host "      • أعد تحميل الصفحة: Ctrl+Shift+R" -ForegroundColor Gray
Write-Host ""
Write-Host "   3️⃣  سجل الدخول في كلا الطرفين واضغط Sync ↻" -ForegroundColor White
Write-Host ""
Write-Host "   4️⃣  تحقق من تطابق البيانات!" -ForegroundColor White
Write-Host ""
Write-Host "📄 راجع ملف CLEAR_AND_RESYNC.md للتفاصيل الكاملة" -ForegroundColor Cyan
Write-Host ""
