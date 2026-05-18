import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { branchSettings } from '@/data/mockData';
import { Settings, Database, Bell, Shield, Save } from 'lucide-react';
import { toast } from 'sonner';

const settingsTabs = ['الفروع وحدود الشراء', 'قاعدة البيانات', 'إعدادات الصلاحيات', 'التنبيهات'];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('الفروع وحدود الشراء');
  const [branches, setBranches] = useState(branchSettings);

  const updateBranch = (id: string, field: string, value: number) => {
    setBranches(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b));
  };

  const getSpentPercent = (branch: typeof branchSettings[0]) =>
    Math.round((branch.currentSpent / branch.monthlyLimit) * 100);

  return (
    <AppLayout title="الإعدادات">
      <div className="flex gap-4">
        {/* Settings sidebar */}
        <div className="w-48 flex-shrink-0">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-2">
            {settingsTabs.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`w-full text-right px-3 py-2.5 rounded-lg text-sm mb-0.5 transition-colors ${activeTab === tab ? 'bg-emerald-500 text-white font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1">
          {activeTab === 'الفروع وحدود الشراء' && (
            <div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <h2 className="text-base font-bold text-right mb-5">إعدادات الفروع وحدود الشراء الشهري</h2>
                <div className="space-y-5">
                  {branches.map(branch => {
                    const percent = getSpentPercent(branch);
                    return (
                      <div key={branch.id} className="border border-gray-100 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${percent >= branch.criticalPercent ? 'bg-red-100 text-red-700' : percent >= branch.warningPercent ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {percent}% مُستخدم
                            </span>
                          </div>
                          <h3 className="font-bold text-gray-900">{branch.name}</h3>
                        </div>

                        {/* Progress bar */}
                        <div className="mb-4">
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>{branch.currentSpent.toLocaleString('ar-EG')} ج.م</span>
                            <span>من {branch.monthlyLimit.toLocaleString('ar-EG')} ج.م</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${percent >= branch.criticalPercent ? 'bg-red-500' : percent >= branch.warningPercent ? 'bg-amber-400' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.min(percent, 100)}%` }}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 text-right mb-1">الحد الشهري للمشتريات (ج.م)</label>
                            <input
                              type="number"
                              value={branch.monthlyLimit}
                              onChange={e => updateBranch(branch.id, 'monthlyLimit', Number(e.target.value))}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 text-right mb-1">نسبة التحذير (%)</label>
                            <input
                              type="number"
                              value={branch.warningPercent}
                              onChange={e => updateBranch(branch.id, 'warningPercent', Number(e.target.value))}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 text-right mb-1">نسبة الحد الحرج (%)</label>
                            <input
                              type="number"
                              value={branch.criticalPercent}
                              onChange={e => updateBranch(branch.id, 'criticalPercent', Number(e.target.value))}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-5 flex justify-start">
                  <button
                    onClick={() => toast.success('تم حفظ الإعدادات بنجاح')}
                    className="flex items-center gap-1.5 bg-emerald-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-600"
                  >
                    <Save size={14} /> حفظ الإعدادات
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'قاعدة البيانات' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-base font-bold text-right mb-5">إعدادات قاعدة البيانات</h2>
              <div className="space-y-4">
                {[{ label: 'نسخ احتياطي يومي', desc: 'حفظ نسخة احتياطية كل 24 ساعة', enabled: true }, { label: 'تصدير تلقائي', desc: 'تصدير التقارير الشهرية تلقائياً', enabled: false }].map(opt => (
                  <div key={opt.label} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                    <button
                      onClick={() => toast.info(`تم ${opt.enabled ? 'تعطيل' : 'تفعيل'} ${opt.label}`)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${opt.enabled ? 'bg-emerald-500' : 'bg-gray-200'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${opt.enabled ? 'translate-x-1' : 'translate-x-6'}`} />
                    </button>
                    <div className="text-right">
                      <div className="font-medium text-gray-800 text-sm">{opt.label}</div>
                      <div className="text-xs text-gray-500">{opt.desc}</div>
                    </div>
                  </div>
                ))}
                <button onClick={() => toast.success('جارٍ إنشاء نسخة احتياطية...')} className="w-full border border-gray-200 text-gray-600 py-2.5 rounded-lg text-sm hover:bg-gray-50 flex items-center justify-center gap-2">
                  <Database size={14} /> إنشاء نسخة احتياطية الآن
                </button>
              </div>
            </div>
          )}

          {activeTab === 'التنبيهات' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-base font-bold text-right mb-5">إعدادات التنبيهات</h2>
              <div className="space-y-3">
                {[
                  { label: 'تنبيهات الفواتير المعلقة', desc: 'إشعار عند وجود فواتير لم تُراجع بعد 24 ساعة' },
                  { label: 'تنبيهات حد الشراء', desc: 'تحذير عند اقتراب الفرع من حد الشراء الشهري' },
                  { label: 'تنبيهات المخزون الحرج', desc: 'إشعار عند نقص مخزون أدوية الستة' },
                  { label: 'تنبيهات الراكد', desc: 'تقرير أسبوعي بالأصناف الراكدة' },
                  { label: 'تنبيهات الموردين', desc: 'إشعار عند تجاوز حد الائتمان' },
                ].map(n => (
                  <div key={n.label} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                    <button
                      onClick={() => toast.success(`تم تغيير إعداد ${n.label}`)}
                      className="relative inline-flex h-6 w-11 items-center rounded-full bg-emerald-500 transition-colors"
                    >
                      <span className="inline-block h-4 w-4 transform rounded-full bg-white shadow translate-x-1" />
                    </button>
                    <div className="text-right">
                      <div className="font-medium text-gray-800 text-sm">{n.label}</div>
                      <div className="text-xs text-gray-500">{n.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'إعدادات الصلاحيات' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-base font-bold text-right mb-5">إعدادات الصلاحيات المتقدمة</h2>
              <div className="space-y-3">
                {[
                  { label: 'حد الفاتورة لمراجعة مدير الفرع', value: '50,000 ج.م' },
                  { label: 'حد الفاتورة لمراجعة المدير العام', value: '100,000 ج.م' },
                  { label: 'مدة تأمين الجلسة', value: '8 ساعات' },
                ].map(s => (
                  <div key={s.label} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                    <input defaultValue={s.value} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none w-32" />
                    <div className="font-medium text-gray-800 text-sm">{s.label}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => toast.success('تم حفظ إعدادات الصلاحيات')} className="mt-4 flex items-center gap-1.5 bg-emerald-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-600">
                <Save size={14} /> حفظ
              </button>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
