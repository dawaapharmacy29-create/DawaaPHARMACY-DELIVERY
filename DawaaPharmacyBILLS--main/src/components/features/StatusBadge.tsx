interface StatusBadgeProps {
  status: string;
  type?: 'review' | 'payment' | 'general' | 'return';
}

const reviewColors: Record<string, string> = {
  'معتمد': 'bg-emerald-100 text-emerald-700',
  'انتظار مراجعة': 'bg-yellow-100 text-yellow-700',
  'يحتاج تعديل': 'bg-orange-100 text-orange-700',
  'مرفوض': 'bg-red-100 text-red-700',
  'تحت المراجعة': 'bg-blue-100 text-blue-700',
  'معلق': 'bg-yellow-100 text-yellow-700',
};

const paymentColors: Record<string, string> = {
  'غير مدفوع': 'bg-orange-100 text-orange-700',
  'مدفوع جزئياً': 'bg-blue-100 text-blue-700',
  'مدفوع بالكامل': 'bg-emerald-100 text-emerald-700',
};

const stockColors: Record<string, string> = {
  'طبيعي': 'bg-emerald-100 text-emerald-700',
  'منخفض': 'bg-yellow-100 text-yellow-700',
  'حرج': 'bg-red-100 text-red-700',
};

const generalColors: Record<string, string> = {
  'نشط': 'bg-emerald-100 text-emerald-700',
  'موقف': 'bg-red-100 text-red-700',
  'راكد': 'bg-red-100 text-red-700',
  'قريب الانتهاء': 'bg-orange-100 text-orange-700',
  'منتهي الصلاحية': 'bg-red-200 text-red-800',
  'بطيء الحركة': 'bg-yellow-100 text-yellow-700',
  'معتمد': 'bg-emerald-100 text-emerald-700',
  'انتظار': 'bg-yellow-100 text-yellow-700',
  'مرفوض': 'bg-red-100 text-red-700',
  'مديونية كبيرة': 'bg-red-100 text-red-700',
  'مديونية': 'bg-orange-100 text-orange-700',
  'بمديونية': 'bg-orange-100 text-orange-700',
  'كاش': 'bg-emerald-100 text-emerald-700',
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const allColors = { ...reviewColors, ...paymentColors, ...stockColors, ...generalColors };
  const color = allColors[status] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}
