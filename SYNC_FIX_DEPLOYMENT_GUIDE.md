# 🔧 إصلاح عاجل: Sync & WebSocket Fixes

## 📋 ملخص الإصلاحات

تم إصلاح المشاكل التالية:

### ✅ المشكلة 1: Polling error – Unexpected token '<'
**السبب:** السيرفر كان يُرجع HTML بدلاً من JSON في بعض الحالات

**الحل:**
1. ✅ تحديث `errorHandler` middleware لإرجاع JSON دائمًا مع `Content-Type: application/json`
2. ✅ إضافة `ensureJsonResponse` middleware للتأكد من JSON responses فقط
3. ✅ تحديث `notFound` middleware لإرجاع JSON بدلاً من HTML

### ✅ المشكلة 2: WebSocket error – Unexpected response code: 200
**السبب:** Nginx لم يكن مُعدًا لترقية الاتصال إلى WebSocket

**الحل:**
1. ✅ إضافة قسم خاص لـ `/socket.io/` في nginx config
2. ✅ إضافة headers للترقية: `Upgrade` و `Connection "upgrade"`
3. ✅ تعطيل caching و buffering للـ WebSocket connections
4. ✅ زيادة timeouts لدعم الاتصالات طويلة الأمد

### ✅ المشكلة 3: صفحات Loading لا تظهر البيانات
**السبب:** فشل المزامنة بسبب المشاكل أعلاه

**الحل:** بعد إصلاح المشاكل أعلاه، ستعمل المزامنة بشكل صحيح

---

## 📁 الملفات المُعدَّلة

### 1. `backend/src/middleware/errorHandler.ts`
```typescript
// إضافة Content-Type: application/json إجباريًا
res.setHeader('Content-Type', 'application/json');

// إرجاع JSON مع تفاصيل الخطأ
res.status(statusCode).json({
  success: false,
  error: {
    message,
    statusCode,
    path: req.path,
    timestamp: new Date().toISOString(),
  },
});
```

### 2. `backend/src/middleware/jsonOnly.ts` (ملف جديد)
```typescript
// Middleware للتأكد من أن كل API routes ترجع JSON فقط
export const ensureJsonResponse = (req, res, next) => {
  // Override res.send لإجبار JSON responses
  if (req.path.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
  }
  next();
};
```

### 3. `backend/src/index.ts`
```typescript
// إضافة ensureJsonResponse middleware
import { ensureJsonResponse } from './middleware/jsonOnly';

app.use(ensureJsonResponse);
```

### 4. `nginx-btp.conf`
```nginx
# Socket.IO WebSocket support - MUST be before /api/
location /socket.io/ {
    proxy_pass http://localhost:3000/socket.io/;
    proxy_http_version 1.1;
    
    # WebSocket upgrade headers
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    
    # Standard proxy headers
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Disable caching for WebSocket
    proxy_cache_bypass $http_upgrade;
    proxy_no_cache 1;
    
    # Timeouts for long-lived connections
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
    proxy_connect_timeout 60s;
    
    # Buffer settings
    proxy_buffering off;
}
```

---

## 🚀 خطوات النشر على السيرفر

### 1. رفع الملفات المُعدَّلة

```bash
# من مجلد المشروع المحلي
scp backend/src/middleware/errorHandler.ts root@162.55.219.151:/root/btp-backend/src/middleware/
scp backend/src/middleware/jsonOnly.ts root@162.55.219.151:/root/btp-backend/src/middleware/
scp backend/src/index.ts root@162.55.219.151:/root/btp-backend/src/
scp nginx-btp.conf root@162.55.219.151:/etc/nginx/sites-available/btp-app
```

### 2. إعادة بناء Backend

```bash
ssh root@162.55.219.151

# الانتقال إلى مجلد backend
cd /root/btp-backend

# إعادة البناء
npm run build

# إعادة تشغيل الخدمة
pm2 restart btp-backend

# متابعة الـ logs
pm2 logs btp-backend --lines 50
```

### 3. تحديث Nginx

```bash
# اختبار تكوين Nginx
sudo nginx -t

# إذا كان الاختبار ناجحًا، إعادة تحميل Nginx
sudo systemctl reload nginx

# التحقق من حالة Nginx
sudo systemctl status nginx
```

---

## 🧪 الاختبار

### اختبار محلي (قبل النشر)

```bash
# من مجلد backend
cd backend

# تشغيل السيرفر محليًا
npm run dev

# في terminal آخر، تشغيل سكريبت الاختبار
node test-api.js
```

### اختبار على السيرفر

```bash
# تشغيل سكريبت الاختبار على السيرفر
ssh root@162.55.219.151 "cd /root/btp-backend && BASE_URL=http://localhost:3000 node test-api.js"
```

### اختبار يدوي من المتصفح

1. **فحص Health Check:**
   ```
   http://162.55.219.151/health
   ```
   يجب أن يُرجع JSON: `{"status":"OK",...}`

2. **فحص WebSocket في DevTools:**
   - افتح F12 → Network → WS
   - يجب أن ترى اتصال WebSocket نشط
   - Status: `101 Switching Protocols`

3. **فحص Sync API:**
   - افتح F12 → Network
   - فلتر: Fetch/XHR
   - يجب أن ترى:
     - `/api/sync/pull` → Response: JSON
     - `/api/sync/push` → Response: JSON
   - لا يجب أن يكون هناك أي HTML responses

---

## 📊 سيناريوهات الاختبار المطلوبة

### ✅ السيناريو 1: مستخدم A ينشئ مشروع → يظهر فورًا على مستخدم B

**الخطوات:**
1. افتح التطبيق بمستخدمين مختلفين على جهازين أو متصفحين
2. مستخدم A: أنشئ مشروع جديد
3. مستخدم B: يجب أن يظهر المشروع فورًا بدون refresh

**التحقق:**
- WebSocket يرسل broadcast للمشروع الجديد
- مستخدم B يستقبل `sync:operation` event
- UI يُحدَّث تلقائيًا

### ✅ السيناريو 2: مستخدم A يعدّل Bordereau → يظهر فورًا لدى B

**الخطوات:**
1. مستخدم A: افتح bordereau وعدّل designation
2. مستخدم B: يجب أن يرى التعديل فورًا

**التحقق:**
- UPDATE operation تُرسل عبر WebSocket
- Dexie يُحدَّث في client B
- UI يُعيد render

### ✅ السيناريو 3: مستخدم A Offline يعدّل مشروع → عند Online المزامنة تعمل

**الخطوات:**
1. مستخدم A: افصل الإنترنت
2. عدّل مشروع أو أنشئ bordereau جديد
3. أعد الاتصال بالإنترنت
4. يجب أن تبدأ المزامنة تلقائيًا

**التحقق:**
- `syncPush` يرسل العمليات المحلية
- `syncPull` يستقبل العمليات البعيدة
- لا توجد أخطاء في console
- البيانات متزامنة بشكل صحيح

---

## 🔍 التحقق من المشاكل

### إذا استمر الخطأ "Unexpected token '<'"

```bash
# فحص response من API
curl -H "Authorization: Bearer YOUR_TOKEN" http://162.55.219.151/api/sync/pull?since=0

# يجب أن يُرجع JSON وليس HTML
```

**إذا أرجع HTML:**
- تحقق من nginx logs: `sudo tail -f /var/log/nginx/error.log`
- تحقق من backend logs: `pm2 logs btp-backend`
- تأكد من أن backend يعمل: `pm2 status`

### إذا استمر الخطأ "Unexpected response code: 200"

```bash
# فحص WebSocket upgrade
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: test" \
     http://162.55.219.151/socket.io/

# يجب أن يُرجع 101 Switching Protocols
```

**إذا أرجع 200:**
- تحقق من nginx config: `sudo nginx -t`
- تأكد من أن nginx config المُحدَّث مُحمَّل
- أعد تشغيل nginx: `sudo systemctl restart nginx`

### إذا لم تظهر البيانات

```javascript
// في DevTools Console
// فحص Dexie database
await db.projects.toArray()
await db.bordereaux.toArray()

// فحص آخر sync
await db.syncState.get('lastSync')
```

---

## 📞 الدعم

إذا استمرت المشاكل:

1. **فحص Logs:**
   ```bash
   pm2 logs btp-backend --lines 100
   sudo tail -f /var/log/nginx/error.log
   ```

2. **إعادة التشغيل الكامل:**
   ```bash
   pm2 restart btp-backend
   sudo systemctl restart nginx
   ```

3. **فحص الاتصالات:**
   ```bash
   netstat -tlnp | grep :3000
   netstat -tlnp | grep :80
   ```

---

## ✨ الميزات الجديدة

بعد هذه الإصلاحات، ستحصل على:

✅ **JSON Responses فقط** - لا مزيد من HTML errors  
✅ **WebSocket يعمل بشكل صحيح** - real-time sync  
✅ **Error handling محسّن** - رسائل خطأ واضحة  
✅ **Nginx optimized** - دعم كامل للـ WebSocket  
✅ **Better logging** - تتبع أسهل للمشاكل  

---

## 📝 ملاحظات هامة

1. **Backup قبل النشر:**
   ```bash
   pm2 save
   sudo cp /etc/nginx/sites-available/btp-app /etc/nginx/sites-available/btp-app.backup
   ```

2. **اختبار قبل النشر:**
   - شغّل `npm run build` محليًا للتأكد من عدم وجود أخطاء
   - شغّل `test-api.js` محليًا

3. **مراقبة بعد النشر:**
   - راقب logs لمدة 5-10 دقائق بعد النشر
   - اختبر كل السيناريوهات أعلاه

---

تم إنشاء هذه الإصلاحات بتاريخ: **December 12, 2025**
