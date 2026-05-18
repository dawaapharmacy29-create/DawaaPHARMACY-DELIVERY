import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { suppliers } from '@/data/mockData';
import { GitCompare, ChevronLeft, ChevronRight, CheckCircle, Upload, Link, BarChart2 } from 'lucide-react';
import { toast } from 'sonner';

const steps = [
  { num: 1, label: 'اختيار المورد' },
  { num: 2, label: 'رفع الملف' },
  { num: 3, label: 'ربط الأعمدة' },
  { num: 4, label: 'نتيجة المطابقة' },
  { num: 5, label: 'الاعتماد' },
];

const mockDiffs = [
  { invoiceNo: 'INV-2026-001', ourValue: 25000, supplierValue: 25000, diff: 0, status: 'متطابق' },
  { invoiceNo: 'INV-2026-002', ourValue: 18500, supplierValue: 18200, diff: 300, status: 'فرق' },
  { invoiceNo: 'INV-2026-003', ourValue: 42000, supplierValue: 42000, diff: 0, status: 'متطابق' },
  { invoiceNo: 'INV-2026-999', ourValue: 0, supplierValue: 5000, diff: 5000, status: 'مفقود عندنا' },
];

const fmt = (n: number) => n.toLocaleString('ar-EG') + ' ج.م';

export default function Reconciliation() {
  const [step, setStep] = useState(1);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [fromDate, setFromDate] = useState('04/30/2026');
  const [toDate, setToDate] = useState('05/17/2026');
  const [fileUploaded, setFileUploaded] = useState(false);
  const [columnsLinked, setColumnsLinked] = useState(false);

  const canNext = () => {
    if (step === 1) return selectedSupplier !== '';
    if (step === 2) return fileUploaded;
    if (step === 3) return columnsLinked;
    return true;
  };

  return (
    <AppLayout title="مطابقة كشف المورد">
      {/* Stepper */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
        <div className="flex items-center justify-between">
          {steps.map((s, i) => (
            <div key={s.num} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${step > s.num ? 'bg-emerald-500 text-white' : step === s.num ? 'bg-emerald-500 text-white ring-4 ring-emerald-100' : 'bg-gray-100 text-gray-400'}`}>
                  {step > s.num ? <CheckCircle size={18} /> : s.num}
                </div>
                <div className={`text-xs mt-1.5 text-center ${step >= s.num ? 'text-emerald-700 font-medium' : 'text-gray-400'}`}>{s.label}</div>
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 mt-[-16px] ${step > s.num ? 'bg-emerald-400' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        {step === 1 && (
          <div>
            <h2 className="text-lg font-bold text-right mb-5">الخطوة 1: اختيار المورد والفترة</h2>
            <div className="space-y-4 max-w-lg mr-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 text-right mb-1.5">المورد *</label>
                <select value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300">
                  <option value="">اختر المورد</option>
                  {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 text-right mb-1.5">إلى تاريخ</label>
                  <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 text-right mb-1.5">من تاريخ</label>
                  <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-lg font-bold text-right mb-5">الخطوة 2: رفع ملف كشف المورد</h2>
            <div
              onClick={() => { setFileUploaded(true); toast.success('تم رفع الملف بنجاح'); }}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${fileUploaded ? 'border-emerald-400 bg-emerald-50' : 'border-gray-300 hover:border-emerald-400 hover:bg-emerald-50'}`}
            >
              {fileUploaded ? (
                <div>
                  <CheckCircle size={40} className="text-emerald-500 mx-auto mb-2" />
                  <div className="text-emerald-700 font-medium">تم رفع الملف: كشف_المورد.xlsx</div>
                  <div className="text-sm text-gray-500 mt-1">انقر لاستبدال الملف</div>
                </div>
              ) : (
                <div>
                  <Upload size={40} className="text-gray-400 mx-auto mb-2" />
                  <div className="text-gray-600 font-medium">انقر لرفع ملف Excel أو CSV</div>
                  <div className="text-sm text-gray-400 mt-1">يدعم: .xlsx, .xls, .csv</div>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="text-lg font-bold text-right mb-5">الخطوة 3: ربط الأعمدة</h2>
            <div className="space-y-4 max-w-lg mr-auto">
              {[
                { label: 'عمود رقم الفاتورة', options: ['Column A', 'Column B', 'Column C'] },
                { label: 'عمود القيمة', options: ['Column A', 'Column B', 'Column C'] },
                { label: 'عمود التاريخ', options: ['Column A', 'Column B', 'Column C'] },
              ].map(field => (
                <div key={field.label}>
                  <label className="block text-sm font-medium text-gray-700 text-right mb-1">{field.label}</label>
                  <select onChange={() => setColumnsLinked(true)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300">
                    <option>اختر العمود</option>
                    {field.options.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <h2 className="text-lg font-bold text-right mb-2">الخطوة 4: نتيجة المطابقة</h2>
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-emerald-600">2</div>
                <div className="text-xs text-emerald-700">متطابق تماماً</div>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-orange-600">1</div>
                <div className="text-xs text-orange-700">فروق بسيطة</div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-red-600">1</div>
                <div className="text-xs text-red-700">مفقود</div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-gray-50">
                  <tr>
                    {['رقم الفاتورة', 'قيمتنا', 'قيمة المورد', 'الفرق', 'الحالة'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-xs font-semibold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {mockDiffs.map(d => (
                    <tr key={d.invoiceNo} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium">{d.invoiceNo}</td>
                      <td className="px-4 py-2.5">{d.ourValue > 0 ? fmt(d.ourValue) : '—'}</td>
                      <td className="px-4 py-2.5">{d.supplierValue > 0 ? fmt(d.supplierValue) : '—'}</td>
                      <td className={`px-4 py-2.5 font-bold ${d.diff > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {d.diff > 0 ? fmt(d.diff) : '✓'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${d.status === 'متطابق' ? 'bg-emerald-100 text-emerald-700' : d.status === 'فرق' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                          {d.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="text-center py-8">
            <CheckCircle size={64} className="text-emerald-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">تم اعتماد المطابقة بنجاح!</h2>
            <p className="text-gray-500 mb-4">
              تمت مطابقة كشف حساب <strong>{selectedSupplier}</strong> للفترة {fromDate} — {toDate}
            </p>
            <div className="bg-gray-50 rounded-xl p-4 max-w-xs mx-auto text-right space-y-2">
              <div className="flex justify-between text-sm"><span className="text-gray-500">فواتير متطابقة</span><span className="font-bold text-emerald-600">2</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">فواتير بفروق</span><span className="font-bold text-orange-600">1</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">فواتير مفقودة</span><span className="font-bold text-red-600">1</span></div>
            </div>
            <button onClick={() => { setStep(1); setSelectedSupplier(''); setFileUploaded(false); setColumnsLinked(false); }} className="mt-6 bg-emerald-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-600">
              بدء مطابقة جديدة
            </button>
          </div>
        )}
      </div>

      {/* Navigation */}
      {step < 5 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setStep(s => Math.max(1, s - 1))}
            disabled={step === 1}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight size={16} /> السابق
          </button>
          <span className="text-sm text-gray-400">الخطوة {step} من {steps.length}</span>
          <button
            onClick={() => {
              if (!canNext()) { toast.error('يرجى إكمال هذه الخطوة أولاً'); return; }
              if (step === 4) toast.success('تم الاعتماد');
              setStep(s => Math.min(5, s + 1));
            }}
            className="flex items-center gap-1.5 bg-emerald-500 text-white px-4 py-2.5 rounded-lg text-sm hover:bg-emerald-600"
          >
            {step === 4 ? 'اعتماد المطابقة' : 'التالي'} <ChevronLeft size={16} />
          </button>
        </div>
      )}
    </AppLayout>
  );
}
