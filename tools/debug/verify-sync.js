// 🔍 سكريبت فحص التزامن
// Sync Verification Script
// نفذ هذا في Console (F12) في كل من Electron والمتصفح

console.log('🔍 بدء فحص حالة التزامن...');
console.log('');

// 1. معلومات الجهاز
console.log('📱 معلومات الجهاز:');
const isElectron = window.navigator.userAgent.includes('Electron');
console.log('  النوع:', isElectron ? '⚡ Electron App' : '🌐 Web Browser');
console.log('  User Agent:', window.navigator.userAgent);
console.log('');

// 2. Device ID
console.log('🔑 Device ID:');
const electronId = localStorage.getItem('deviceId-electron');
const browserId = localStorage.getItem('deviceId-browser');
const oldId = localStorage.getItem('deviceId'); // القديم

if (isElectron) {
  console.log('  Electron ID:', electronId || '❌ غير موجود');
  if (oldId) console.warn('  ⚠️  Device ID قديم موجود:', oldId, '- يجب حذفه!');
} else {
  console.log('  Browser ID:', browserId || '❌ غير موجود');
  if (oldId) console.warn('  ⚠️  Device ID قديم موجود:', oldId, '- يجب حذفه!');
}
console.log('');

// 3. فحص IndexedDB
console.log('💾 فحص IndexedDB...');
const dbPromise = indexedDB.open('ProjetGestionDB');
dbPromise.onsuccess = async (event) => {
  const db = event.target.result;
  
  // المشاريع
  const projectStore = db.transaction('projects', 'readonly').objectStore('projects');
  const projectsRequest = projectStore.getAll();
  
  projectsRequest.onsuccess = () => {
    const projects = projectsRequest.result;
    const activeProjects = projects.filter(p => !p.deletedAt);
    const deletedProjects = projects.filter(p => p.deletedAt);
    
    console.log('  📁 المشاريع:');
    console.log('    الإجمالي:', projects.length);
    console.log('    النشطة:', activeProjects.length);
    console.log('    المحذوفة:', deletedProjects.length);
    console.log('');
    
    // تفاصيل المشاريع
    console.log('  📊 تفاصيل المشاريع النشطة:');
    console.table(activeProjects.map(p => ({
      ID: p.id,
      'رقم السوق': p.marcheNo,
      'العنوان': p.objet,
      'السنة': p.annee,
      'المبلغ': p.montant
    })));
    
    if (deletedProjects.length > 0) {
      console.log('  🗑️  المشاريع المحذوفة:');
      console.table(deletedProjects.map(p => ({
        ID: p.id,
        'رقم السوق': p.marcheNo,
        'العنوان': p.objet,
        'تاريخ الحذف': p.deletedAt
      })));
    }
  };
  
  // البرويون
  const bordereauStore = db.transaction('bordereaux', 'readonly').objectStore('bordereaux');
  const bordereauxRequest = bordereauStore.getAll();
  
  bordereauxRequest.onsuccess = () => {
    const bordereaux = bordereauxRequest.result;
    console.log('  📋 البرويون:', bordereaux.length);
    
    // حساب المبلغ الإجمالي
    let totalAmount = 0;
    bordereaux.forEach(b => {
      if (b.lignes && Array.isArray(b.lignes)) {
        b.lignes.forEach(ligne => {
          const montantHT = (ligne.quantite || 0) * (ligne.prixUnitaire || 0);
          totalAmount += montantHT * 1.2; // +20% TVA
        });
      }
    });
    
    console.log('  💰 المبلغ الإجمالي (TTC):', totalAmount.toLocaleString('fr-MA'), 'MAD');
    console.log('');
  };
  
  // عمليات المزامنة
  const syncStore = db.transaction('syncOperations', 'readonly').objectStore('syncOperations');
  const syncRequest = syncStore.getAll();
  
  syncRequest.onsuccess = () => {
    const operations = syncRequest.result;
    const pending = operations.filter(op => !op.synced);
    const synced = operations.filter(op => op.synced);
    
    console.log('  🔄 عمليات المزامنة:');
    console.log('    الإجمالي:', operations.length);
    console.log('    قيد الانتظار:', pending.length);
    console.log('    مزامنة:', synced.length);
    
    if (pending.length > 0) {
      console.log('  ⏳ عمليات قيد الانتظار:');
      console.table(pending.map(op => ({
        النوع: op.type,
        الكيان: op.entity,
        'ID': op.entityId,
        الوقت: new Date(op.timestamp).toLocaleString('ar-MA')
      })));
    }
    console.log('');
  };
};

// 4. آخر مزامنة
console.log('⏰ آخر مزامنة:');
const lastSync = localStorage.getItem('lastSyncTimestamp');
if (lastSync) {
  const lastSyncDate = new Date(parseInt(lastSync));
  console.log('  التاريخ:', lastSyncDate.toLocaleString('ar-MA'));
  const minutesAgo = Math.floor((Date.now() - parseInt(lastSync)) / 60000);
  console.log('  منذ:', minutesAgo, 'دقيقة');
} else {
  console.log('  ❌ لم يتم التزامن بعد');
}
console.log('');

// 5. التوصيات
console.log('💡 التوصيات:');
if (oldId) {
  console.warn('  ⚠️  يجب حذف Device ID القديم: localStorage.removeItem("deviceId")');
}
if (!electronId && !browserId) {
  console.warn('  ⚠️  لا يوجد Device ID صحيح! قم بإعادة تحميل الصفحة');
}
console.log('  ℹ️  للمزامنة يدوياً: اضغط زر Sync ↻ في الزاوية العليا');
console.log('  ℹ️  المزامنة التلقائية: كل 5 دقائق');
console.log('');

console.log('✅ اكتمل الفحص!');
console.log('');
console.log('📋 لمقارنة النتائج:');
console.log('  1. نفذ هذا السكريبت في Electron');
console.log('  2. نفذه في المتصفح');
console.log('  3. قارن الأرقام (يجب أن تكون متطابقة)');
