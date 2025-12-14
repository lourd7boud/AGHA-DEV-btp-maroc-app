# نظام التحديث التلقائي (Auto-Update System)

## نظرة عامة

تم تطبيق نظام تحديث تلقائي متكامل في تطبيق Electron باستخدام مكتبة `electron-updater`. النظام يسمح بـ:

- ✅ اكتشاف التحديثات الجديدة تلقائياً
- ✅ إشعار المستخدم بوجود تحديث متاح
- ✅ تحميل التحديث في الخلفية
- ✅ عرض تقدم التحميل
- ✅ تثبيت التحديث بنقرة واحدة

## البنية التقنية

### 1. Backend (Electron Main Process)

**الملف**: `frontend-electron/src/main/index.ts`

```typescript
// إعدادات electron-updater
autoUpdater.autoDownload = false;      // عدم التحميل التلقائي
autoUpdater.autoInstallOnAppQuit = true; // التثبيت عند إغلاق التطبيق

// الأحداث المُعالجة:
- update-available: عند توفر تحديث
- update-not-available: عندما لا يوجد تحديث
- download-progress: تقدم التحميل
- update-downloaded: اكتمال التحميل
- error: عند حدوث خطأ
```

### 2. Preload API

**الملف**: `frontend-electron/src/main/preload.ts`

يوفر واجهة آمنة للتواصل بين Main Process و Renderer:

```typescript
window.electron = {
  // وظائف التحديث
  checkForUpdates(): Promise<Result>
  downloadUpdate(): Promise<Result>
  installUpdate(): Promise<void>
  
  // مستمعي الأحداث
  onUpdateAvailable(callback)
  onDownloadProgress(callback)
  onUpdateDownloaded(callback)
  onUpdateError(callback)
}
```

### 3. Frontend Components

#### Store (Zustand)
**الملف**: `frontend-web/src/store/updateStore.ts`

إدارة حالة التحديثات:
- معلومات التحديث المتاح
- حالة التحميل والتقدم
- الأخطاء
- حالة التثبيت

#### Hook
**الملف**: `frontend-web/src/hooks/useAutoUpdater.ts`

Hook مخصص لربط أحداث Electron بـ React Store.

#### Component
**الملف**: `frontend-web/src/components/UpdateNotification/UpdateNotification.tsx`

واجهة مستخدم جميلة لعرض:
- إشعار بوجود تحديث
- زر التحميل
- شريط التقدم
- زر التثبيت

## الإعداد والتكوين

### 1. إعدادات electron-builder

**الملف**: `frontend-electron/package.json`

```json
{
  "build": {
    "publish": {
      "provider": "github",
      "owner": "YOUR_GITHUB_USERNAME",
      "repo": "btp-maroc-app"
    },
    "win": {
      "target": ["nsis"],
      "publisherName": "BTP Maroc"
    }
  }
}
```

**ملاحظة هامة**: يجب تغيير `YOUR_GITHUB_USERNAME` إلى اسم المستخدم الفعلي على GitHub.

### 2. طرق النشر المدعومة

#### أ) GitHub Releases (موصى به)

1. أنشئ repository على GitHub
2. اضبط `publish.provider` إلى `"github"`
3. أضف GitHub Token إلى المتغيرات البيئية:
   ```bash
   set GH_TOKEN=your_github_token
   ```

#### ب) خادم خاص

```json
{
  "publish": {
    "provider": "generic",
    "url": "https://your-server.com/updates/"
  }
}
```

### 3. البناء والنشر

```bash
# بناء التطبيق
cd frontend-electron
npm run build:win

# نشر التحديث (ينشر تلقائياً إلى GitHub Releases)
npm run build:win -- --publish always
```

## سير عمل التحديث

```
1. تشغيل التطبيق
   ↓
2. بعد 3 ثواني: التحقق من التحديثات
   ↓
3. إذا وُجد تحديث → عرض إشعار
   ↓
4. المستخدم يضغط "تحميل التحديث"
   ↓
5. التحميل في الخلفية + عرض التقدم
   ↓
6. بعد اكتمال التحميل → عرض زر "إعادة التشغيل والتثبيت"
   ↓
7. المستخدم يضغط الزر → إغلاق التطبيق وتثبيت التحديث
   ↓
8. إعادة تشغيل التطبيق بالنسخة الجديدة
```

## الاستخدام في التطبيق

### دمج النظام في App.tsx

```tsx
import { useAutoUpdater } from './hooks/useAutoUpdater';
import { UpdateNotification } from './components/UpdateNotification';

function App() {
  // تفعيل نظام التحديث
  useAutoUpdater();
  
  return (
    <>
      <UpdateNotification />
      {/* باقي المكونات */}
    </>
  );
}
```

### التحقق اليدوي من التحديثات

```typescript
// في أي مكان في التطبيق
if (window.electron) {
  const result = await window.electron.checkForUpdates();
  if (result.success) {
    console.log('Checking for updates...');
  }
}
```

## التخصيص

### تغيير فترة التحقق من التحديثات

في `index.ts`:
```typescript
setTimeout(() => {
  checkForUpdates();
}, 3000); // 3 ثواني (يمكن التعديل)
```

### التحقق الدوري من التحديثات

```typescript
// التحقق كل ساعة
setInterval(() => {
  checkForUpdates();
}, 60 * 60 * 1000);
```

### تخصيص واجهة الإشعار

عدّل ملف `UpdateNotification.tsx` لتغيير:
- الألوان
- النصوص
- الأيقونات
- المظهر العام

## الأمان

- ✅ استخدام HTTPS لتحميل التحديثات
- ✅ التحقق من التوقيعات الرقمية (تلقائي في electron-updater)
- ✅ التحقق من صحة الملفات المحملة
- ✅ عدم تشغيل أكواد غير موثوقة

## اختبار النظام

### 1. اختبار في بيئة التطوير

```bash
# تعطيل التحديثات في Development
if (process.env.NODE_ENV !== 'development') {
  checkForUpdates();
}
```

### 2. اختبار التحديثات

1. أنشئ إصدار v1.0.0
2. انشر التطبيق
3. زد رقم الإصدار إلى v1.0.1
4. أنشئ تحديثات جديدة
5. انشر الإصدار الجديد
6. شغّل النسخة القديمة
7. يجب أن يظهر إشعار التحديث

## استكشاف الأخطاء

### لا يظهر إشعار التحديث

- تأكد من أن `NODE_ENV !== 'development'`
- تحقق من إعدادات `publish` في package.json
- تأكد من وجود إصدار أحدث في GitHub Releases

### خطأ في التحميل

- تحقق من الاتصال بالإنترنت
- تأكد من صحة `GH_TOKEN`
- راجع console logs في DevTools

### خطأ في التثبيت

- تأكد من صلاحيات الكتابة على القرص
- أغلق برامج الحماية مؤقتاً للاختبار
- تحقق من مساحة القرص المتاحة

## الإصدارات المستقبلية

### ميزات مخطط لها:

- [ ] إشعارات push للتحديثات المهمة
- [ ] تحديثات تلقائية كاملة (بدون تفاعل المستخدم)
- [ ] نظام rollback للعودة للنسخة السابقة
- [ ] إحصائيات التحديثات
- [ ] تحديثات جزئية (delta updates)

## الموارد

- [electron-updater Documentation](https://www.electron.build/auto-update)
- [Code Signing Guide](https://www.electron.build/code-signing)
- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github)

---

**الإصدار**: 1.0.0  
**التاريخ**: ديسمبر 2025  
**المطور**: BTP Maroc
