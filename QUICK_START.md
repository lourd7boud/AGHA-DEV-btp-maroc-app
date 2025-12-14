# دليل التشغيل السريع - نظام Super Admin

## المتطلبات

1. **Node.js** (v18 أو أحدث)
2. **CouchDB** (v3.3 أو أحدث)
   - عبر Docker (موصى به)
   - أو تثبيت محلي

## الخطوات

### 1. تشغيل CouchDB

#### باستخدام Docker (موصى به):

```powershell
# تشغيل Docker Desktop أولاً

# إنشاء وتشغيل CouchDB
docker run -d --name couchdb `
  -p 5984:5984 `
  -e COUCHDB_USER=admin `
  -e COUCHDB_PASSWORD=password `
  couchdb:3.3

# التحقق من أن CouchDB يعمل
curl http://localhost:5984
# يجب أن يعرض: {"couchdb":"Welcome","version":"3.3.X",...}
```

#### إنشاء قاعدة البيانات:

```powershell
# إنشاء قاعدة البيانات
curl -X PUT http://admin:password@localhost:5984/projet_gestion

# التحقق
curl http://admin:password@localhost:5984/projet_gestion
```

### 2. تشغيل Backend

```powershell
cd C:\4444\backend

# تثبيت الحزم (إذا لم يتم من قبل)
npm install

# تشغيل الخادم في وضع Development
npm run dev
```

سترى رسالة:
```
🚀 Server running on port 5000
✅ CouchDB connected successfully
```

### 3. إنشاء Super Admin

في terminal جديد:

```powershell
cd C:\4444\backend

# تشغيل سكريبت إنشاء Super Admin
npm run create-super-admin
```

ستحصل على:
```
✅ Super Admin created successfully!

📧 Email: admin@agriculture.gov.ma
🔑 Password: Admin@2024
👤 Name: Super Admin
🔐 Role: super_admin

⚠️  IMPORTANT: Please change the password after first login!
```

### 4. تشغيل Frontend

في terminal جديد:

```powershell
cd C:\4444\frontend-web

# تثبيت الحزم (إذا لم يتم من قبل)
npm install

# تشغيل التطبيق
npm run dev
```

سيفتح التطبيق على: `http://localhost:3002`

### 5. تسجيل الدخول كـ Super Admin

1. افتح المتصفح: `http://localhost:3002`
2. سجل الدخول بالبيانات:
   - **Email**: `admin@agriculture.gov.ma`
   - **Password**: `Admin@2024`
3. ستجد في القائمة الجانبية أيقونة **Administration** 🛡️

### 6. إنشاء أول مستخدم

1. اذهب إلى: **Administration → Gérer les utilisateurs**
2. اضغط **Nouvel Utilisateur**
3. املأ البيانات:
   ```
   Prénom: محمد
   Nom: العلوي
   Email: m.alaoui@agriculture.gov.ma
   Password: User@2024
   Rôle: Utilisateur
   ☑️ Période d'essai: 30 jours
   ```
4. اضغط **Créer**

## استكشاف الأخطاء

### CouchDB لا يعمل

```powershell
# التحقق من Docker
docker ps

# إعادة تشغيل CouchDB
docker restart couchdb

# عرض logs
docker logs couchdb
```

### Backend لا يتصل بـ CouchDB

تحقق من `.env`:
```env
COUCHDB_URL=http://admin:password@localhost:5984
COUCHDB_DB_NAME=projet_gestion
```

### Frontend لا يتصل بـ Backend

تحقق من `frontend-web/.env`:
```env
VITE_API_BASE_URL=http://localhost:5000
```

### Super Admin موجود بالفعل

إذا حصلت على:
```
❌ Super Admin user already exists!
```

يمكنك:
1. استخدام الحساب الموجود
2. أو حذفه من CouchDB:

```powershell
# البحث عن المستخدم
curl http://admin:password@localhost:5984/projet_gestion/_design/users/_view/by_email?key="admin@agriculture.gov.ma"

# حذف المستخدم (استبدل USER_ID و REV)
curl -X DELETE http://admin:password@localhost:5984/projet_gestion/USER_ID?rev=REV
```

## الترتيب الصحيح للتشغيل

```
1. Docker Desktop (إذا كنت تستخدم Docker)
2. CouchDB (عبر Docker أو محلي)
3. Backend (npm run dev)
4. Frontend (npm run dev)
5. إنشاء Super Admin (npm run create-super-admin)
```

## روابط سريعة

- **Frontend**: http://localhost:3002
- **Backend API**: http://localhost:5000
- **CouchDB**: http://localhost:5984
- **CouchDB Admin Panel**: http://localhost:5984/_utils

## مصادر إضافية

- [دليل Super Admin الكامل](./SUPER_ADMIN_GUIDE.md)
- [Backend API Documentation](./backend/README.md)
- [Frontend Documentation](./frontend-web/README.md)
