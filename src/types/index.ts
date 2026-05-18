export interface Invoice {
  id: string;
  invoiceNo: string;
  supplier: string;
  branch: string;
  date: string;
  value: number;
  returned: number;
  remaining: number;
  paymentType: 'آجل' | 'كاش' | 'جزئي';
  paymentStatus: 'غير مدفوع' | 'مدفوع جزئياً' | 'مدفوع بالكامل';
  reviewStatus: 'معتمد' | 'انتظار مراجعة' | 'يحتاج تعديل' | 'مرفوض';
  enteredBy: string;
  notes?: string;
}

export interface Supplier {
  id: string;
  name: string;
  representative: string;
  phone: string;
  paymentType: 'كاش' | 'آجل' | 'تقسيط';
  creditDays?: number;
  totalInvoices: number;
  totalPurchases: number;
  totalPaid: number;
  totalReturns: number;
  balance: number;
  lastPayment: string;
  lastReconciliation: string;
  hasOldDebt: boolean;
}

export interface Medicine {
  id: string;
  code: string;
  name: string;
  category: string;
  branch: string;
  supplier: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  unitPrice: number;
  totalValue: number;
  status: 'طبيعي' | 'منخفض' | 'حرج';
  expiryDate?: string;
}

export interface DeadStockItem {
  id: string;
  code: string;
  name: string;
  branch: string;
  supplier: string;
  quantity: number;
  value: number;
  expiryDate: string;
  daysSinceSale: number;
  status: 'راكد' | 'قريب الانتهاء' | 'منتهي الصلاحية';
  suggestedAction: string;
}

export interface Expense {
  id: string;
  date: string;
  branch: string;
  category: 'إيجار' | 'كهرباء' | 'صيانة' | 'إنترنت' | 'مستلزمات' | 'أخرى';
  description: string;
  amount: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'check';
  responsible?: string;
  status: 'معتمد' | 'انتظار' | 'مرفوض';
}

export interface Return {
  id: string;
  returnNo: string;
  date: string;
  supplier: string;
  branch: string;
  medicineCode: string;
  medicineName: string;
  quantity: number;
  value: number;
  reason: 'قريب الانتهاء' | 'راكد' | 'فرق سعر' | 'تالف' | 'خطأ توريد';
  status: 'معتمد' | 'معلق' | 'تحت المراجعة';
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'مدير عام' | 'مدير فرع' | 'محاسب' | 'مسؤول مشتريات' | 'مراجع فواتير' | 'مشاهد';
  branch: string;
  status: 'نشط' | 'موقف';
  addedDate: string;
}

export interface OperationLog {
  id: string;
  dateTime: string;
  user: string;
  role: string;
  department: string;
  operation: string;
  branch: string;
  details: string;
}

export interface BranchSettings {
  id: string;
  name: string;
  monthlyLimit: number;
  warningPercent: number;
  criticalPercent: number;
  currentSpent: number;
}
