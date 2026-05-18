import type { Invoice, Supplier, Medicine, DeadStockItem, Expense, Return, User, OperationLog, BranchSettings } from '@/types';

export const branches = ['فرع زكريا', 'فرع بيسيلة', 'فرع المنشية', 'فرع الفاروق', 'كل الفروع'];

export const invoices: Invoice[] = [
  { id: '1', invoiceNo: 'INV-2026-001', supplier: 'الشركة المصرية للأدوية', branch: 'فرع زكريا', date: '10/05/2026', value: 25000, returned: 0, remaining: 25000, paymentType: 'آجل', paymentStatus: 'غير مدفوع', reviewStatus: 'معتمد', enteredBy: 'محمد حسن' },
  { id: '2', invoiceNo: 'INV-2026-002', supplier: 'دار الشفاء للأدوية', branch: 'فرع بيسيلة', date: '08/05/2026', value: 18500, returned: 0, remaining: 10000, paymentType: 'جزئي', paymentStatus: 'مدفوع جزئياً', reviewStatus: 'معتمد', enteredBy: 'سارة أحمد' },
  { id: '3', invoiceNo: 'INV-2026-003', supplier: 'بيوفارما للاستيراد', branch: 'فرع زكريا', date: '12/05/2026', value: 42000, returned: 0, remaining: 42000, paymentType: 'آجل', paymentStatus: 'غير مدفوع', reviewStatus: 'انتظار مراجعة', enteredBy: 'محمد حسن' },
  { id: '4', invoiceNo: 'INV-2026-004', supplier: 'الشركة المصرية للأدوية', branch: 'فرع المنشية', date: '11/05/2026', value: 15000, returned: 500, remaining: 14500, paymentType: 'كاش', paymentStatus: 'مدفوع بالكامل', reviewStatus: 'معتمد', enteredBy: 'نور محمود' },
  { id: '5', invoiceNo: 'INV-2026-005', supplier: 'شركة الفاروق للتوزيع', branch: 'فرع بيسيلة', date: '14/05/2026', value: 35000, returned: 0, remaining: 35000, paymentType: 'آجل', paymentStatus: 'غير مدفوع', reviewStatus: 'انتظار مراجعة', enteredBy: 'سارة أحمد' },
  { id: '6', invoiceNo: 'INV-2026-006', supplier: 'الشركة المصرية للأدوية', branch: 'فرع المنشية', date: '15/05/2026', value: 28000, returned: 1000, remaining: 27000, paymentType: 'آجل', paymentStatus: 'غير مدفوع', reviewStatus: 'يحتاج تعديل', enteredBy: 'نور محمود' },
  { id: '7', invoiceNo: 'INV-2026-007', supplier: 'مجموعة النيل للصيدليات', branch: 'فرع بيسيلة', date: '14/05/2026', value: 55000, returned: 0, remaining: 55000, paymentType: 'آجل', paymentStatus: 'غير مدفوع', reviewStatus: 'انتظار مراجعة', enteredBy: 'سارة أحمد' },
];

export const suppliers: Supplier[] = [
  { id: '1', name: 'الشركة المصرية للأدوية', representative: 'أحمد محمد', phone: '01001234567', paymentType: 'آجل', creditDays: 30, totalInvoices: 24, totalPurchases: 485000, totalPaid: 320000, totalReturns: 15000, balance: 150000, lastPayment: '05/05/2026', lastReconciliation: '30/04/2026', hasOldDebt: true },
  { id: '2', name: 'دار الشفاء للأدوية', representative: 'محمد علي', phone: '01112345678', paymentType: 'آجل', creditDays: 45, totalInvoices: 18, totalPurchases: 320000, totalPaid: 200000, totalReturns: 8000, balance: 112000, lastPayment: '01/05/2026', lastReconciliation: '01/05/2026', hasOldDebt: true },
  { id: '3', name: 'بيوفارما للاستيراد', representative: 'كريم يوسف', phone: '01223456789', paymentType: 'آجل', creditDays: 60, totalInvoices: 30, totalPurchases: 480000, totalPaid: 120000, totalReturns: 12000, balance: 118000, lastPayment: '01/05/2026', lastReconciliation: '15/04/2026', hasOldDebt: true },
  { id: '4', name: 'شركة الفاروق للتوزيع', representative: 'سامي فاروق', phone: '01334567890', paymentType: 'تقسيط', totalInvoices: 8, totalPurchases: 245000, totalPaid: 130000, totalReturns: 5000, balance: 110000, lastPayment: '15/04/2026', lastReconciliation: '15/04/2026', hasOldDebt: true },
  { id: '5', name: 'مجموعة النيل للصيدليات', representative: 'سامي حسن', phone: '01222345678', paymentType: 'كاش', totalInvoices: 12, totalPurchases: 180000, totalPaid: 180000, totalReturns: 0, balance: 0, lastPayment: '10/05/2026', lastReconciliation: '10/05/2026', hasOldDebt: false },
];

export const medicines: Medicine[] = [
  { id: '1', code: 'MORPH-10', name: 'مورفين 10 مج حقن', category: 'مخدرات', branch: 'فرع زكريا', supplier: 'الشركة المصرية للأدوية', currentStock: 50, minStock: 30, maxStock: 100, unitPrice: 45, totalValue: 2250, status: 'طبيعي' },
  { id: '2', code: 'MID-5', name: 'ميدازولام 5 مج حقن', category: 'مهدئات', branch: 'فرع بيسيلة', supplier: 'دار الشفاء للأدوية', currentStock: 15, minStock: 10, maxStock: 50, unitPrice: 85, totalValue: 1275, status: 'منخفض' },
  { id: '3', code: 'TRAM-100', name: 'ترامادول 100 مج أمبولات', category: 'مسكنات قوية', branch: 'فرع زكريا', supplier: 'بيوفارما للاستيراد', currentStock: 20, minStock: 25, maxStock: 80, unitPrice: 50, totalValue: 1000, status: 'حرج' },
  { id: '4', code: 'DIAZ-10', name: 'ديازيبام 10 مج حقن', category: 'مهدئات', branch: 'فرع المنشية', supplier: 'الشركة المصرية للأدوية', currentStock: 35, minStock: 20, maxStock: 80, unitPrice: 35, totalValue: 1225, status: 'طبيعي' },
  { id: '5', code: 'PETH-50', name: 'بيثيدين 50 مج حقن', category: 'مخدرات', branch: 'فرع بيسيلة', supplier: 'مجموعة النيل للصيدليات', currentStock: 8, minStock: 15, maxStock: 60, unitPrice: 75, totalValue: 600, status: 'حرج' },
  { id: '6', code: 'VIT-B12', name: 'فيتامين ب12 حبوب', category: 'فيتامينات', branch: 'فرع زكريا', supplier: 'دار الشفاء للأدوية', currentStock: 60, minStock: 20, maxStock: 120, unitPrice: 25, totalValue: 1500, status: 'طبيعي' },
];

export const deadStockItems: DeadStockItem[] = [
  { id: '1', code: 'MED-001', name: 'أموكسيسيلين 250 مج - كبسولات', branch: 'فرع زكريا', supplier: 'الشركة المصرية للأدوية', quantity: 120, value: 3000, expiryDate: '30/09/2026', daysSinceSale: 67, status: 'راكد', suggestedAction: 'عرض أو تحويل للفروع الأخرى' },
  { id: '2', code: 'VIT-002', name: 'فيتامين ب12 حبوب', branch: 'فرع بيسيلة', supplier: 'دار الشفاء للأدوية', quantity: 80, value: 2400, expiryDate: '31/08/2026', daysSinceSale: 91, status: 'قريب الانتهاء', suggestedAction: 'إرجاع للمورد أو تخفيض السعر' },
  { id: '3', code: 'CALC-500', name: 'كالسيوم 500 مج أقراص', branch: 'فرع المنشية', supplier: 'بيوفارما للاستيراد', quantity: 200, value: 4000, expiryDate: '15/07/2026', daysSinceSale: 45, status: 'قريب الانتهاء', suggestedAction: 'خصومات ترويجية' },
];

export const expenses: Expense[] = [
  { id: '1', date: '01/05/2026', branch: 'فرع زكريا', category: 'إيجار', description: 'إيجار شهر مايو', amount: 8000, paymentMethod: 'bank_transfer', responsible: undefined, status: 'معتمد' },
  { id: '2', date: '02/05/2026', branch: 'فرع بيسيلة', category: 'كهرباء', description: 'فاتورة كهرباء أبريل', amount: 1200, paymentMethod: 'cash', status: 'معتمد' },
  { id: '3', date: '05/05/2026', branch: 'فرع المنشية', category: 'صيانة', description: 'صيانة التكييفات', amount: 2500, paymentMethod: 'cash', status: 'معتمد' },
  { id: '4', date: '07/05/2026', branch: 'فرع زكريا', category: 'إنترنت', description: 'اشتراك إنترنت شهري', amount: 450, paymentMethod: 'bank_transfer', status: 'معتمد' },
  { id: '5', date: '10/05/2026', branch: 'فرع بيسيلة', category: 'مستلزمات', description: 'مستلزمات مكتبية', amount: 350, paymentMethod: 'cash', status: 'انتظار' },
];

export const returns: Return[] = [
  { id: '1', returnNo: 'RET-2026-001', date: '15/05/2026', supplier: 'الشركة المصرية للأدوية', branch: 'فرع المنشية', medicineCode: 'AMOX-500', medicineName: 'أموكسيسيلين 500 مج', quantity: 20, value: 1500, reason: 'قريب الانتهاء', status: 'معتمد' },
  { id: '2', returnNo: 'RET-2026-002', date: '09/05/2026', supplier: 'دار الشفاء للأدوية', branch: 'فرع بيسيلة', medicineCode: 'VIT-D3', medicineName: 'فيتامين د3', quantity: 15, value: 2250, reason: 'راكد', status: 'معلق' },
  { id: '3', returnNo: 'RET-2026-003', date: '11/05/2026', supplier: 'شركة الفاروق للتوزيع', branch: 'فرع زكريا', medicineCode: 'PARA-1', medicineName: 'باراسيتامول 1 جم', quantity: 50, value: 3000, reason: 'فرق سعر', status: 'تحت المراجعة' },
];

export const users: User[] = [
  { id: '1', name: 'أحمد علي', email: 'ahmed@dawaa.com', role: 'مدير عام', branch: 'كل الفروع', status: 'نشط', addedDate: '٢٠٢٤/١/١' },
  { id: '2', name: 'محمد حسن', email: 'mohamed@dawaa.com', role: 'مسؤول مشتريات', branch: 'فرع زكريا', status: 'نشط', addedDate: '٢٠٢٤/١/١٥' },
  { id: '3', name: 'سارة أحمد', email: 'sara@dawaa.com', role: 'مسؤول مشتريات', branch: 'فرع بيسيلة', status: 'نشط', addedDate: '٢٠٢٤/٢/١' },
  { id: '4', name: 'نور محمود', email: 'nour@dawaa.com', role: 'مدير فرع', branch: 'فرع المنشية', status: 'نشط', addedDate: '٢٠٢٤/٢/١٥' },
  { id: '5', name: 'كريم سامي', email: 'karim@dawaa.com', role: 'مراجع فواتير', branch: 'كل الفروع', status: 'نشط', addedDate: '٢٠٢٤/٣/١' },
  { id: '6', name: 'هند صلاح', email: 'hend@dawaa.com', role: 'محاسب', branch: 'كل الفروع', status: 'موقف', addedDate: '٢٠٢٤/٣/١٠' },
];

export const operationsLog: OperationLog[] = [
  { id: '1', dateTime: '15/05/2026 ١:٠٠ م', user: 'نور محمود', role: 'مدير فرع', department: 'مشتريات', operation: 'إضافة مرتجع', branch: 'فرع المنشية', details: 'return_no: RET-2026-001 amount: 1500' },
  { id: '2', dateTime: '14/05/2026 م٢:٠٠ م', user: 'سارة أحمد', role: 'مسؤول مشتريات', department: 'الفواتير', operation: 'إضافة فاتورة', branch: 'فرع بيسيلة', details: 'invoice_no: INV-2026-007 amount: 55000' },
  { id: '3', dateTime: '12/05/2026 م١٢:٠٠ م', user: 'محمد حسن', role: 'مسؤول مشتريات', department: 'الفواتير', operation: 'إضافة فاتورة', branch: 'فرع زكريا', details: 'invoice_no: INV-2026-003 amount: 42000' },
  { id: '4', dateTime: '10/05/2026 م١:٠٠ م', user: 'أحمد علي', role: 'مدير عام', department: 'الفواتير', operation: 'اعتماد فاتورة', branch: 'فرع زكريا', details: 'invoice_no: INV-2026-001 amount: 25000' },
  { id: '5', dateTime: '05/05/2026 م١:٠٠ م', user: 'أحمد علي', role: 'مدير عام', department: 'المدفوعات', operation: 'تسجيل دفعة', branch: 'فرع زكريا', details: 'amount: 50000 supplier: الشركة المصرية للأدوية' },
];

export const branchSettings: BranchSettings[] = [
  { id: '1', name: 'فرع زكريا', monthlyLimit: 150000, warningPercent: 80, criticalPercent: 100, currentSpent: 127500 },
  { id: '2', name: 'فرع بيسيلة', monthlyLimit: 120000, warningPercent: 80, criticalPercent: 100, currentSpent: 102000 },
  { id: '3', name: 'فرع المنشية', monthlyLimit: 100000, warningPercent: 80, criticalPercent: 100, currentSpent: 43000 },
  { id: '4', name: 'فرع الفاروق', monthlyLimit: 80000, warningPercent: 80, criticalPercent: 100, currentSpent: 38000 },
];

export const dashboardStats = {
  totalInvoices: 7,
  totalPurchases: 550000,
  totalPaid: 172000,
  totalExpenses: 12500,
  totalReturns: 7250,
  netPurchases: 48250,
  pendingReview: 3,
  suppliersWithDebt: 4,
  totalSupplierDebt: 495000,
  unmatchedStatements: 1,
};

export const monthlyTrend = [
  { month: 'يناير', purchases: 180000, paid: 120000, returns: 5000 },
  { month: 'فبراير', purchases: 195000, paid: 145000, returns: 8000 },
  { month: 'مارس', purchases: 220000, paid: 180000, returns: 12000 },
  { month: 'أبريل', purchases: 245000, paid: 172000, returns: 9000 },
  { month: 'مايو', purchases: 216000, paid: 172000, returns: 7250 },
];

export const supplierDistribution = [
  { name: 'الشركة المصرية', value: 485000, percent: 30 },
  { name: 'دار الشفاء', value: 320000, percent: 20 },
  { name: 'بيوفارما', value: 480000, percent: 29 },
  { name: 'الفاروق للتوزيع', value: 245000, percent: 14 },
  { name: 'مجموعة النيل', value: 180000, percent: 10 },
  { name: 'أخرى', value: 50000, percent: 3 },
];
