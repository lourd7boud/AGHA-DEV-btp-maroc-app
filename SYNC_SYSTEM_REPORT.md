# 📡 تقرير إصلاح نظام المزامنة الشامل

## نظرة عامة

تم تنفيذ إصلاح شامل لنظام المزامنة بين تطبيق Electron (React + Dexie/IndexedDB) والمتصفح وخادم PostgreSQL. يعتمد النظام الجديد على نمط **Ops-Log** (سجل العمليات) مع أرقام تسلسلية من الخادم (server sequence numbers) لضمان مزامنة موثوقة ومتسقة.

---

## 🎯 الأهداف المحققة

| الهدف | الحالة |
|-------|--------|
| مزامنة موثوقة بدون صفحات عالقة | ✅ |
| API مع endpoints للمزامنة | ✅ |
| آلية ops-log مع idempotency | ✅ |
| آلية retry مع exponential backoff | ✅ |
| حل التعارضات (LWW + UI للدمج اليدوي) | ✅ |
| اختبارات E2E | ✅ |
| أدوات مراقبة وتسجيل | ✅ |

---

## 📁 الملفات الجديدة والمعدلة

### الخادم (Backend)

| الملف | الوصف |
|-------|-------|
| [src/migrations/ops-log-migration.sql](backend/src/migrations/ops-log-migration.sql) | هجرة قاعدة البيانات لإنشاء جداول ops |
| [src/controllers/sync.controller.v2.ts](backend/src/controllers/sync.controller.v2.ts) | متحكم المزامنة المحسّن |
| [src/routes/sync.routes.v2.ts](backend/src/routes/sync.routes.v2.ts) | مسارات API الجديدة |
| [src/utils/syncMetrics.ts](backend/src/utils/syncMetrics.ts) | أدوات المراقبة والقياسات |
| [src/run-migration.js](backend/src/run-migration.js) | سكريبت تشغيل الهجرة |
| [tests/sync-e2e.test.js](backend/tests/sync-e2e.test.js) | اختبارات E2E |
| `src/index.ts` | **معدل** - استخدام sync.routes.v2 |

### العميل (Frontend)

| الملف | الوصف |
|-------|-------|
| [src/services/syncServiceV2.ts](frontend-web/src/services/syncServiceV2.ts) | خدمة المزامنة المحسّنة |
| [src/hooks/useSyncManagerV2.ts](frontend-web/src/hooks/useSyncManagerV2.ts) | Hook المزامنة المحسّن |
| [src/components/ConflictResolutionModal.tsx](frontend-web/src/components/ConflictResolutionModal.tsx) | واجهة حل التعارضات |
| `src/services/syncService.ts` | **معدل** - يعيد التصدير من v2 |
| `src/hooks/useSyncManager.ts` | **معدل** - يعيد التصدير من v2 |

---

## 🏗️ البنية الجديدة

### جدول العمليات (ops)

```sql
CREATE TABLE ops (
  server_seq BIGSERIAL PRIMARY KEY,  -- رقم تسلسلي من الخادم
  op_id UUID UNIQUE NOT NULL,        -- معرف العملية الفريد
  client_id TEXT NOT NULL,           -- معرف الجهاز
  user_id UUID,                      -- معرف المستخدم
  ts TIMESTAMPTZ NOT NULL,           -- الطابع الزمني
  entity TEXT NOT NULL,              -- نوع الكيان
  entity_id TEXT NOT NULL,           -- معرف الكيان
  op_type TEXT NOT NULL,             -- نوع العملية
  payload JSONB NOT NULL,            -- البيانات
  applied BOOLEAN DEFAULT FALSE,     -- هل تم التطبيق
  applied_at TIMESTAMPTZ             -- وقت التطبيق
);
```

### جداول إضافية

- **sync_clients**: تتبع حالة المزامنة لكل جهاز
- **sync_conflicts**: تخزين التعارضات غير المحلولة
- **entity_history**: سجل تاريخ التغييرات (للتراجع)

---

## 🔄 بروتوكول المزامنة

### Push (دفع العمليات)

```
POST /api/sync/push
{
  "operations": [...],
  "deviceId": "device-uuid",
  "lastPushedSeq": 123  // اختياري
}

Response:
{
  "success": true,
  "data": {
    "ackOps": ["op-id-1", "op-id-2"],
    "serverSeq": 456,
    "remoteOps": [...],  // عمليات من أجهزة أخرى
    "errors": []
  }
}
```

### Pull (سحب التغييرات)

```
GET /api/sync/pull?since=123&deviceId=device-uuid

Response:
{
  "success": true,
  "data": {
    "operations": [...],
    "serverSeq": 456,
    "serverTime": 1702300800000
  }
}
```

---

## 🔁 آلية Retry مع Exponential Backoff

```typescript
const SYNC_CONFIG = {
  INITIAL_RETRY_DELAY: 1000,    // 1 ثانية
  MAX_RETRY_DELAY: 64000,       // 64 ثانية
  MAX_RETRIES: 10,
  JITTER_FACTOR: 0.3,           // 30% تباين عشوائي
};
```

### سلسلة المحاولات:
1s → 2s → 4s → 8s → 16s → 32s → 64s (max)

---

## ⚔️ استراتيجية حل التعارضات

### 1. Last Write Wins (LWW) - الافتراضي
- للحقول البسيطة (مثل الأرقام، النصوص)
- العملية الأحدث تفوز تلقائياً

### 2. حل يدوي عبر الواجهة
- للحالات المعقدة
- يظهر modal يعرض:
  - النسخة المحلية
  - النسخة البعيدة
  - خيار الدمج اليدوي

### 3. خيارات الحل:
- `local_wins`: الاحتفاظ بالنسخة المحلية
- `remote_wins`: الاحتفاظ بنسخة الخادم
- `merged`: دمج يدوي للحقول

---

## 🧪 تشغيل الاختبارات

```bash
# من مجلد backend
cd c:\4444\backend

# تشغيل اختبارات E2E
node tests/sync-e2e.test.js

# تشغيل مع خادم مخصص
API_URL=http://localhost:5000/api node tests/sync-e2e.test.js
```

### سيناريوهات الاختبار:
1. ✅ Push أساسي
2. ✅ Pull أساسي
3. ✅ Idempotency (عدم تكرار العمليات)
4. ✅ عمليات التحديث
5. ✅ عمليات الحذف
6. ✅ معالجة الدفعات الكبيرة (100 عملية)
7. ✅ تحديثات متزامنة من أجهزة مختلفة
8. ✅ حالة المزامنة
9. ✅ Pull بناءً على server_seq
10. ✅ محاكاة Offline → Online

---

## 📊 المراقبة والقياسات

### القياسات المتاحة:
- `pushAttempts` / `pushSuccesses` / `pushFailures`
- `pullAttempts` / `pullSuccesses` / `pullFailures`
- `avgPushLatency` / `avgPullLatency`
- `pendingOpsCount`
- `conflictsDetected` / `conflictsResolved`

### تنسيق Prometheus:
```
GET /api/metrics

btp_sync_push_total{user="xxx",result="success"} 150
btp_sync_push_total{user="xxx",result="failure"} 5
btp_sync_latency_seconds{user="xxx",operation="push"} 0.234
btp_sync_pending_ops{user="xxx"} 12
```

### التنبيهات:
- عدد العمليات المعلقة > 100
- معدل الأخطاء > 20%
- زمن الاستجابة > 10 ثواني
- تعارضات غير محلولة > 5

---

## 🚀 خطوات النشر

### 1. تشغيل الهجرة على قاعدة البيانات

```bash
cd c:\4444\backend

# باستخدام متغيرات البيئة
POSTGRES_HOST=162.55.219.151 \
POSTGRES_DB=btpdb \
POSTGRES_USER=btpuser \
POSTGRES_PASSWORD=BtpSecure2025! \
node src/run-migration.js
```

أو عبر SSH على الخادم:
```bash
ssh root@162.55.219.151
cd /var/www/btp/backend
node src/run-migration.js
```

### 2. إعادة تشغيل الخادم

```bash
# على الخادم
pm2 restart btp-backend
# أو
systemctl restart btp-backend
```

### 3. بناء ونشر الواجهة الأمامية

```powershell
cd c:\4444\frontend-web
npm run build

# نسخ للخادم
scp -r dist/* root@162.55.219.151:/var/www/btp/

# نسخ لـ Electron
Copy-Item -Recurse -Force dist\* c:\4444\frontend-electron\dist\renderer\
```

### 4. بناء تطبيق Electron

```powershell
cd c:\4444\frontend-electron
npm run build
```

---

## 🔧 استعادة النظام عند الخطأ

### 1. تفريغ قاعدة البيانات المحلية (Dexie)

في Console المتصفح أو Electron DevTools:
```javascript
// تفريغ البيانات المحلية
await indexedDB.deleteDatabase('ProjetGestionDB');
localStorage.clear();
location.reload();
```

### 2. إعادة المزامنة الكاملة

```javascript
// في التطبيق
const { forceFullSync } = useSyncManager(userId);
await forceFullSync();
```

### 3. استعادة نسخة احتياطية من PostgreSQL

```bash
# على الخادم
pg_restore -d btpdb backup_file.dump
```

### 4. مسح العمليات المعلقة

```sql
-- حذف العمليات القديمة غير المطبقة
DELETE FROM ops WHERE applied = FALSE AND ts < NOW() - INTERVAL '7 days';

-- مسح حالة عميل معين
DELETE FROM sync_clients WHERE client_id = 'device-id';
```

---

## 📋 قائمة التحقق للصيانة

### يومياً:
- [ ] مراجعة عدد العمليات المعلقة
- [ ] التحقق من معدل الأخطاء

### أسبوعياً:
- [ ] مراجعة التعارضات غير المحلولة
- [ ] تنظيف العمليات القديمة المزامنة

### شهرياً:
- [ ] نسخ احتياطي كامل لقاعدة البيانات
- [ ] مراجعة الأداء وتحسينه

---

## 🆘 المشاكل الشائعة والحلول

### صفحة فارغة أو loading لا نهائي

**السبب**: عدم تطبيق العمليات البعيدة محلياً
**الحل**: 
1. افتح DevTools (F12)
2. تحقق من وجود أخطاء في Console
3. شغل مزامنة يدوية:
```javascript
await sync();
```

### عمليات لا تصل للخادم

**السبب**: مشكلة في الشبكة أو التوثيق
**الحل**:
1. تحقق من اتصال الإنترنت
2. تحقق من صلاحية JWT token
3. أعد تسجيل الدخول

### تعارضات متكررة

**السبب**: أجهزة متعددة تعدل نفس البيانات
**الحل**:
1. حل التعارضات المعلقة عبر الواجهة
2. تنسيق العمل بين المستخدمين

---

## 📚 مراجع

- [Dexie.js Documentation](https://dexie.org/docs/)
- [PostgreSQL JSONB](https://www.postgresql.org/docs/current/datatype-json.html)
- [Conflict-free Replicated Data Types](https://crdt.tech/)
- [Exponential Backoff](https://cloud.google.com/iot/docs/how-tos/exponential-backoff)

---

## ✅ الخلاصة

تم تنفيذ نظام مزامنة متكامل يتميز بـ:
1. **الموثوقية**: أرقام تسلسلية من الخادم + idempotency
2. **المرونة**: يعمل offline وonline بسلاسة
3. **الاسترداد**: retry تلقائي مع backoff
4. **الشفافية**: واجهة لحل التعارضات
5. **المراقبة**: قياسات وتنبيهات شاملة

للأسئلة أو المشاكل، راجع الـ logs أو شغل اختبارات E2E للتحقق من سلامة النظام.
