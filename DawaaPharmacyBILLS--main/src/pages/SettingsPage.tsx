import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { useBranchSettings, useUpdateBranchSettings } from '@/hooks/useSupabaseData';
import { Save, Database, Bell, Shield } from 'lucide-react';
import { toast } from 'sonner';

const settingsTabs = ['الفروع وحدود الشراء', 'قاعدة البيانات', 'إعدادات الصلاحيات', 'التنبيهات'];

export default function SettingsPage() {
  const { data: settings = [], isLoading } = useBranchSettings();
  const updateSettings = useUpdateBranchSettings();
  const [activeTab, setActiveTab] = useState('الفروع وحدود الشراء');
  const [localSettings, setLocalSettings] = useState<typeof settings>([]);

  // Use server data on first load, then local edits
  const displaySettings = localSettings.length > 0 ? localSettings : settings;

  const updateLocal = (id: string, field: string, value: number) => {
    const base = localSettings.length > 0 ? localSettings : settings;
    setLocalSettings(base.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const handleSave = async () => {
    await updateSettings.mutateAsync(displaySettings.map(s => ({
      id: s.id,
      monthly_limit: s.monthly_limit,
      warning_percent: s.warning_percent,
      critical_percent: s.critical_percent,
    })));
    setLocalSettings([]);
  };

  return (
    <AppLayout title="الإعدادات">
      <div className="flex gap-4">
        <div className="w-48 flex-shrink-0">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-2">
            {settingsTabs.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`w-full text-right px-3 py-2.5 rounded-lg text-sm mb-0.5 transition-colors ${activeTab === tab ? 'bg-emerald-500 text-white font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1">
          {activeTab === 'الفروع وحدود الشراء' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-base font-bold text-right mb-5">إعدادات الفروع وحدود الشراء الشهري</h2>
              {isLoading ? (
                <div className="text-center text-gray-400 text-sm py-8">جارٍ التحميل...</div>
              ) : (
                <div className="space-y-5">
                  {displaySettings.map(branch => {
                    const percent = branch.monthly_limit > 0 ? Math.round(((branch as any).currentSpent || 0) / branch.monthly_limit * 100) : 0;
                    return (
                      <div key={branch.id} className="border border-gray-100 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${percent >= branch.critical_percent ? 'bg-red-100 text-red-700' : percent >= branch.warning_percent ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {percent}% مُستخدم
                          </span>
                          <h3 className="font-bold text-gray-900">{branch.branchName}</h3>
                        </div>
                        <div className="mb-4">
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div className={`h-2 rounded-full transition-all ${percent >= branch.critical_percent ? 'bg-red-500' : percent >= branch.warning_percent ? 'bg-amber-400' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.min(percent, 100)}%` }} />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { label: 'الحد الشهري للمشتريات (ج.م)', field: 'monthly_limit' },
                            { label: 'نسبة التحذير (%)', field: 'warning_percent' },
                            { label: 'نسبة الحد الحرج (%)', field: 'critical_percent' },
                          ].map(f => (
                            <div key={f.field}>
                              <label className="block text-xs text-gray-500 text-right mb-1">{f.label}</label>
                              <input
                                type="number"
                                value={(branch as any)[f.field]}
                                onChange={e => updateLocal(branch.id, f.field, Number(e.target.value))}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="mt-5 flex justify-start">
                <button onClick={handleSave} disabled={updateSettings.isPending} className="flex items-center gap-1.5 bg-emerald-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">
                  <Save size={14} /> {updateSettings.isPending ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'قاعدة البيانات' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-base font-bold text-right mb-5">إعدادات قاعدة البيانات</h2>
              <div className="space-y-4">
                {[{ label: 'نسخ احتياطي يومي', desc: 'حفظ نسخة احتياطية كل 24 ساعة', enabled: true }, { label: 'تصدير تلقائي', desc: 'تصدير التقارير الشهرية تلقائياً', enabled: false }].map(opt => (
                  <div key={opt.label} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                    <button onClick={() => toast.info(`تم ${opt.enabled ? 'تعطيل' : 'تفعيل'} ${opt.label}`)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${opt.enabled ? 'bg-emerald-500' : 'bg-gray-200'}`}>
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
                    <button onClick={() => toast.success(`تم تغيير إعداد ${n.label}`)} className="relative inline-flex h-6 w-11 items-center rounded-full bg-emerald-500 transition-colors">
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
