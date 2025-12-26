// 🔍 سكريبت فحص العمليات الفاشلة
// نفذ هذا في Console (F12) بعد فتح التطبيق

console.log('🔍 فحص العمليات الفاشلة...');
console.log('');

// فتح قاعدة البيانات
const dbRequest = indexedDB.open('ProjetGestionDB');

dbRequest.onsuccess = (event) => {
  const db = event.target.result;
  
  // الحصول على جميع عمليات المزامنة
  const transaction = db.transaction('syncOperations', 'readonly');
  const store = transaction.objectStore('syncOperations');
  const request = store.getAll();
  
  request.onsuccess = () => {
    const operations = request.result;
    const pending = operations.filter(op => !op.synced);
    
    console.log('📊 إحصائيات العمليات:');
    console.log('  الإجمالي:', operations.length);
    console.log('  قيد الانتظار:', pending.length);
    console.log('  مزامنة:', operations.filter(op => op.synced).length);
    console.log('');
    
    if (pending.length > 0) {
      console.log('⏳ العمليات قيد الانتظار:');
      console.table(pending.map(op => ({
        ID: op.id.substring(0, 8) + '...',
        النوع: op.type,
        الكيان: op.entity,
        'Entity ID': op.entityId.substring(0, 15) + '...',
        الوقت: new Date(op.timestamp).toLocaleString('ar-MA'),
        'Device ID': op.deviceId.substring(0, 15) + '...'
      })));
      
      console.log('');
      console.log('📋 تفاصيل كل عملية:');
      pending.forEach((op, index) => {
        console.log(`\n  عملية ${index + 1}:`);
        console.log('    ID:', op.id);
        console.log('    Type:', op.type);
        console.log('    Entity:', op.entity);
        console.log('    Entity ID:', op.entityId);
        console.log('    Device ID:', op.deviceId);
        console.log('    User ID:', op.userId);
        console.log('    Timestamp:', new Date(op.timestamp).toLocaleString('ar-MA'));
        console.log('    Data:', op.data);
      });
    } else {
      console.log('✅ لا توجد عمليات قيد الانتظار');
    }
    
    console.log('');
    console.log('💡 لحذف العمليات الفاشلة:');
    console.log('  نفذ: clearFailedOperations()');
  };
};

// دالة لحذف جميع العمليات قيد الانتظار
window.clearFailedOperations = async () => {
  const dbRequest = indexedDB.open('ProjetGestionDB');
  
  dbRequest.onsuccess = async (event) => {
    const db = event.target.result;
    const transaction = db.transaction('syncOperations', 'readwrite');
    const store = transaction.objectStore('syncOperations');
    
    const request = store.clear();
    
    request.onsuccess = () => {
      console.log('✅ تم حذف جميع عمليات المزامنة');
      console.log('💡 الآن جرب المزامنة مرة أخرى');
    };
    
    request.onerror = () => {
      console.error('❌ فشل في حذف العمليات');
    };
  };
};

console.log('✅ تم تحميل السكريبت!');
