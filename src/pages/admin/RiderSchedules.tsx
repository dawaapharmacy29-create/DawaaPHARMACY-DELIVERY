import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Upload, AlertTriangle, CheckCircle2, Download, Eye, EyeOff } from 'lucide-react'
import * as XLSX from 'xlsx'
import { getBranches, getRiders, upsertRiderScheduleTemplate } from '../../lib/delivery'
import { supabase } from '../../lib/supabase'
import { toast } from 'sonner'
import { parseScheduleTime, parseDayOfWeek } from '../../lib/utils'
import { GeneratedAccount } from '../../lib/types'

interface ParsedRiderRow {
  rider_name: string
  username: string
  branch_name: string
  day_of_week: number
  day_name_ar: string
  shift_start: string | null
  shift_end: string | null
  planned_hours: number
  crosses_midnight: boolean
  is_day_off: boolean
  warnings: string[]
  raw: Record<string, unknown>
}

const DAY_NAMES_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

function generateUsername(name: string): string {
  const arabicToEnglish: Record<string, string> = {
    'أ': 'a', 'ا': 'a', 'إ': 'i', 'آ': 'a',
    'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'g',
    'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'z',
    'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
    'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z',
    'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q',
    'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
    'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a',
    'ة': 'a', 'ء': 'a', 'ئ': 'y', 'ؤ': 'w',
  }
  const parts = name.trim().split(/\s+/)
  return parts.map(part =>
    part.split('').map(c => arabicToEnglish[c] || c).join('')
  ).join('.').toUpperCase().replace(/[^A-Z0-9.]/g, '').slice(0, 20) || 'RIDER'
}

function generatePin(): string {
  const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  const shuffled = digits.sort(() => Math.random() - 0.5)
  return shuffled.slice(0, 4).join('')
}

// تنظيف الوقت من الأقواس مثل (8H) (12H)
function cleanShiftValue(val: unknown): string {
  if (val === null || val === undefined) return ''
  const str = String(val).trim()
  // إزالة أي نص بين قوسين مثل (8H)
  const cleaned = str.replace(/\([^)]*\)/g, '').trim()
  return cleaned
}

function parseShiftDirect(start: string, end: string): { planned_hours: number; crosses_midnight: boolean } | null {
  if (!start || !end) return null
  const parseTime = (t: string): number | null => {
    const m = t.match(/^(\d{1,2}):?(\d{0,2})$/)
    if (!m) return null
    const h = parseInt(m[1])
    const min = m[2] ? parseInt(m[2]) : 0
    if (h < 0 || h > 23) return null
    return h * 60 + min
  }
  const startMin = parseTime(start)
  const endMin = parseTime(end)
  if (startMin === null || endMin === null) return null
  let diff = endMin - startMin
  const crossesMidnight = diff < 0
  if (crossesMidnight) diff += 24 * 60
  return {
    planned_hours: Math.round((diff / 60) * 100) / 100,
    crosses_midnight: crossesMidnight
  }
}

export default function RiderSchedules() {
  const navigate = useNavigate()
  const [activePanel, setActivePanel] = useState<'import' | 'preview' | 'accounts'>('import')
  const [file, setFile] = useState<File | null>(null)
  const [previewData, setPreviewData] = useState<ParsedRiderRow[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [branches, setBranches] = useState<any[]>([])
  const [riders, setRiders] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [createAccounts, setCreateAccounts] = useState(false)
  const [generatedAccounts, setGeneratedAccounts] = useState<GeneratedAccount[]>([])
  const [showPins, setShowPins] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [branchesData, ridersData] = await Promise.allSettled([getBranches(), getRiders()])
      if (branchesData.status === 'fulfilled') setBranches(branchesData.value)
      if (ridersData.status === 'fulfilled') setRiders(ridersData.value)
    } catch (error) {
      console.error(error)
      toast.error('فشل تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }

  function findBranchByName(name: string) {
    const n = name?.trim().toLowerCase()
    return branches.find(b =>
      b.name?.toLowerCase() === n ||
      b.code?.toLowerCase() === n ||
      b.name?.toLowerCase().includes(n) ||
      n.includes(b.name?.toLowerCase())
    )
  }

  function findRiderByName(name: string) {
    const n = name?.trim()
    return riders.find(r => r.name === n || r.username === n)
  }

  async function parseFile(f: File): Promise<void> {
    setLoading(true)
    try {
      const arrayBuffer = await f.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })

      const parsed: ParsedRiderRow[] = []
      const globalWarnings: string[] = []
      const seenRiders = new Set<string>()

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const rowWarnings: string[] = []

        // استخراج الاسم
        const name = String(row['rider_name'] || row['اسم الدليفري'] || row['الاسم'] || row['Name'] || '').trim()
        if (!name) continue

        // استخراج الفرع
        const branchRaw = String(row['branch_name'] || row['الفرع'] || row['Branch'] || '').trim()
        const branch = findBranchByName(branchRaw)
        if (branchRaw && !branch) rowWarnings.push(`الفرع "${branchRaw}" غير معروف`)

        // يوم الأسبوع
        const dayRaw = String(row['day_name_ar'] || row['اليوم'] || row['Day'] || '').trim()
        const dayOfWeek = parseDayOfWeek(dayRaw)
        const dayNameAr = DAY_NAMES_AR[dayOfWeek] || dayRaw || 'غير محدد'

        // الإجازة
        const isDayOff = String(row['is_day_off'] || row['إجازة'] || '').trim().toLowerCase() === 'true' ||
          String(row['is_day_off'] || row['إجازة'] || '').trim() === '1' ||
          dayRaw.includes('إجازة') || dayRaw.includes('اجازة') || dayRaw.includes('off')

        // الوقت — نظف من الأقواس أولاً
        const shiftStartRaw = cleanShiftValue(row['shift_start'] || row['بداية الشيفت'] || row['Start'] || '')
        const shiftEndRaw = cleanShiftValue(row['shift_end'] || row['نهاية الشيفت'] || row['End'] || '')

        // حاول parse الوقت
        let parsedStart: string | null = null
        let parsedEnd: string | null = null
        let plannedHours = 0
        let crossesMidnight = false

        if (!isDayOff && (shiftStartRaw || shiftEndRaw)) {
          const fromUtils = parseScheduleTime(`${shiftStartRaw} - ${shiftEndRaw}`)
          if (fromUtils) {
            parsedStart = fromUtils.start
            parsedEnd = fromUtils.end
            plannedHours = fromUtils.hours
            crossesMidnight = fromUtils.crossesMidnight
          } else {
            // حاول parse مباشر (HH:MM)
            const direct = parseShiftDirect(shiftStartRaw, shiftEndRaw)
            if (direct) {
              parsedStart = shiftStartRaw
              parsedEnd = shiftEndRaw
              plannedHours = direct.planned_hours
              crossesMidnight = direct.crosses_midnight
            } else if (shiftStartRaw || shiftEndRaw) {
              rowWarnings.push(`ميعاد غير مفهوم: "${shiftStartRaw} - ${shiftEndRaw}"`)
            }
          }
        }

        if (plannedHours > 14) {
          rowWarnings.push(`الشيفت طويل جداً: ${plannedHours.toFixed(1)} ساعة`)
        }

        // تحقق من التكرار
        const riderKey = `${name}-${dayOfWeek}`
        if (seenRiders.has(riderKey)) {
          rowWarnings.push(`دليفري مكرر: ${name} يوم ${dayNameAr}`)
        } else {
          seenRiders.add(riderKey)
        }

        // username
        const usernameRaw = String(row['username'] || row['Username'] || '').trim()
        const username = usernameRaw || generateUsername(name)

        parsed.push({
          rider_name: name,
          username,
          branch_name: branch?.name || branchRaw || '',
          day_of_week: dayOfWeek,
          day_name_ar: dayNameAr,
          shift_start: parsedStart,
          shift_end: parsedEnd,
          planned_hours: plannedHours,
          crosses_midnight: crossesMidnight,
          is_day_off: isDayOff,
          warnings: rowWarnings,
          raw: row
        })
      }

      const totalWarnings = parsed.reduce((acc, r) => acc + r.warnings.length, 0)
      if (totalWarnings > 0) globalWarnings.push(`⚠️ ${totalWarnings} تحذير في البيانات — راجعها قبل الاعتماد`)

      setPreviewData(parsed)
      setWarnings(globalWarnings)
      setActivePanel('preview')

      if (parsed.length === 0) {
        toast.error('الملف فارغ أو لا يحتوي بيانات مفهومة')
      } else {
        toast.success(`تم قراءة ${parsed.length} صف من الملف`)
      }
    } catch (err) {
      console.error(err)
      toast.error('فشل قراءة الملف — تأكد أنه Excel صحيح (.xlsx أو .xls أو .csv)')
    } finally {
      setLoading(false)
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    await parseFile(f)
  }

  async function handleImport() {
    if (previewData.length === 0) return
    setImporting(true)
    let successCount = 0
    let updateCount = 0
    let accountCount = 0
    let scheduleCount = 0
    const errors: string[] = []
    const generated: GeneratedAccount[] = []

    try {
      // جمع الأسماء الفريدة للدليفري
      const uniqueRiders = new Map<string, { name: string; username: string; branch_name: string }>()
      for (const row of previewData) {
        if (!uniqueRiders.has(row.rider_name)) {
          uniqueRiders.set(row.rider_name, {
            name: row.rider_name,
            username: row.username,
            branch_name: row.branch_name
          })
        }
      }

      // upsert branches
      for (const branchName of new Set([...uniqueRiders.values()].map(r => r.branch_name).filter(Boolean))) {
        const existing = findBranchByName(branchName)
        if (!existing) {
          await supabase.from('branches').upsert({
            name: branchName,
            code: branchName.replace(/\s/g, '_').toUpperCase(),
            active: true
          }, { onConflict: 'code' })
        }
      }

      // reload branches
      const freshBranches = await getBranches()
      setBranches(freshBranches)

      // upsert riders AND rider_accounts
      for (const [, riderInfo] of uniqueRiders) {
        const branch = freshBranches.find(b =>
          b.name === riderInfo.branch_name || b.name?.includes(riderInfo.branch_name) || riderInfo.branch_name?.includes(b.name)
        )
        const existing = findRiderByName(riderInfo.name)
        const pin = createAccounts ? generatePin() : null

        if (existing) {
          // Update rider
          await supabase.from('riders').update({
            branch_id: branch?.id || existing.branch_id,
            branch_name: branch?.name || riderInfo.branch_name,
            username: riderInfo.username || existing.username,
            updated_at: new Date().toISOString(),
            ...(createAccounts && pin ? { pin, pin_enabled: true, pin_changed_at: new Date().toISOString() } : {})
          }).eq('id', existing.id)

          // Update or create rider_accounts
          if (createAccounts && pin) {
            const { data: existingAccount } = await supabase
              .from('rider_accounts')
              .select('*')
              .eq('rider_id', existing.id)
              .single()

            if (existingAccount) {
              await supabase.from('rider_accounts').update({
                username: riderInfo.username,
                pin_plain: pin,
                pin_enabled: true,
                status: 'active',
                updated_at: new Date().toISOString()
              }).eq('id', existingAccount.id)
            } else {
              await supabase.from('rider_accounts').insert({
                rider_id: existing.id,
                username: riderInfo.username,
                pin_plain: pin,
                pin_enabled: true,
                must_change_pin: true,
                status: 'active'
              })
            }
            accountCount++
            generated.push({ rider_name: riderInfo.name, username: riderInfo.username, pin, branch_name: branch?.name || riderInfo.branch_name, status: 'updated' })
          }
          updateCount++
        } else {
          // Insert new rider
          const { data: newRider, error: riderError } = await supabase.from('riders').insert({
            name: riderInfo.name,
            username: riderInfo.username,
            branch_id: branch?.id || null,
            branch_name: branch?.name || riderInfo.branch_name,
            status: 'active',
            order_rate: 10,
            trip_rate: 10,
            level: 'junior',
            hourly_rate: 19.25,
            monthly_incentive_base: 750,
            quarterly_incentive_base: 750,
            pin_enabled: createAccounts && !!pin,
            ...(createAccounts && pin ? { pin, pin_changed_at: new Date().toISOString() } : {})
          }).select().single()

          if (riderError) {
            errors.push(`فشل إنشاء الدليفري ${riderInfo.name}: ${riderError.message}`)
            continue
          }

          // Create rider_accounts
          if (createAccounts && pin && newRider) {
            const { error: accountError } = await supabase.from('rider_accounts').insert({
              rider_id: newRider.id,
              username: riderInfo.username,
              pin_plain: pin,
              pin_enabled: true,
              must_change_pin: true,
              status: 'active'
            })

            if (accountError) {
              errors.push(`فشل إنشاء حساب ${riderInfo.name}: ${accountError.message}`)
            } else {
              accountCount++
              generated.push({ rider_name: riderInfo.name, username: riderInfo.username, pin, branch_name: branch?.name || riderInfo.branch_name, status: 'new' })
            }
          }
          successCount++
        }
      }

      // reload riders بعد upsert
      const freshRiders = await getRiders()
      setRiders(freshRiders)

      // upsert schedules
      for (const row of previewData) {
        const rider = freshRiders.find(r => r.name === row.rider_name)
        const branch = freshBranches.find(b => b.name === row.branch_name || b.name?.includes(row.branch_name))
        if (!rider) continue

        try {
          await upsertRiderScheduleTemplate({
            rider_id: rider.id,
            branch_id: branch?.id || rider.branch_id || null,
            branch_name: branch?.name || row.branch_name,
            day_of_week: row.day_of_week,
            day_name_ar: row.day_name_ar,
            is_day_off: row.is_day_off,
            shift_start: row.shift_start || null,
            shift_end: row.shift_end || null,
            planned_hours: row.planned_hours,
            crosses_midnight: row.crosses_midnight,
            status: 'active',
            effective_from: new Date().toISOString().slice(0, 10)
          } as any)
          scheduleCount++
        } catch (err) {
          errors.push(`فشل حفظ جدول ${row.rider_name} يوم ${row.day_name_ar}`)
        }
      }

      if (createAccounts && generated.length > 0) {
        setGeneratedAccounts(generated)
        setActivePanel('accounts')
      }

      // Show success message with stats
      toast.success(`✅ تم حفظ الجداول وإنشاء الحسابات بنجاح`)
      
      // Show detailed stats
      if (errors.length > 0) {
        toast.error(`⚠️ ${errors.length} أخطاء: ${errors.slice(0, 2).join(', ')}${errors.length > 2 ? '...' : ''}`)
      }
      
      console.log('Import stats:', {
        riders: { new: successCount, updated: updateCount },
        accounts: accountCount,
        schedules: scheduleCount,
        errors
      })
    } catch (err) {
      console.error(err)
      toast.error('حصلت مشكلة أثناء الاستيراد')
    } finally {
      setImporting(false)
    }
  }

  function exportAccountsCSV() {
    const header = 'اسم الدليفري,username,رقم سري,الفرع,الحالة'
    const body = generatedAccounts.map(a =>
      `${a.rider_name},${a.username},${a.pin},${a.branch_name},${a.status === 'new' ? 'جديد' : 'محدّث'}`
    ).join('\n')
    const blob = new Blob(['\uFEFF' + header + '\n' + body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dawaa-accounts-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const rowsWithWarnings = previewData.filter(r => r.warnings.length > 0)

  return (
    <div className="min-h-screen bg-[#F3F7F8]" dir="rtl">
      <header className="bg-gradient-to-l from-[#061827] to-[#008E92] p-4 text-white">
        <div className="mx-auto flex max-w-4xl items-center gap-4">
          <button onClick={() => navigate('/admin')} className="rounded-xl bg-white/10 p-2 hover:bg-white/20">
            <ArrowLeft size={22} />
          </button>
          <img src="/logo.png" className="h-10 w-10 rounded-xl bg-white object-contain p-1" alt="دواء" />
          <div>
            <h1 className="text-xl font-black">استيراد جدول الدليفري</h1>
            <p className="text-xs text-teal-100">رفع Excel أو CSV لجداول الدليفري والمواعيد</p>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 bg-white px-4">
        {(['import', 'preview', 'accounts'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActivePanel(tab)}
            className={`px-4 py-3 text-sm font-bold transition-colors ${
              activePanel === tab
                ? 'border-b-2 border-[#008E92] text-[#008E92]'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab === 'import' ? '📂 رفع الملف' :
             tab === 'preview' ? `👁️ معاينة (${previewData.length})` :
             `🔑 الحسابات (${generatedAccounts.length})`}
          </button>
        ))}
      </div>

      <main className="mx-auto max-w-4xl p-4 space-y-4">

        {/* ===== Import Tab ===== */}
        {activePanel === 'import' && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-2 text-lg font-black text-[#061827]">رفع ملف Excel أو CSV</h2>
              <p className="mb-4 text-sm text-slate-500">
                الملف لازم يحتوي أعمدة: <b>rider_name</b> أو اسم الدليفري، <b>branch_name</b> أو الفرع،
                <b> day_name_ar</b> أو اليوم، <b>shift_start</b> بداية الشيفت، <b>shift_end</b> نهاية الشيفت
              </p>
              <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center hover:border-[#008E92] transition-colors">
                <Upload size={32} className="mx-auto text-slate-300 mb-3" />
                <p className="font-bold text-slate-500 mb-3">اسحب الملف هنا أو اضغط للاختيار</p>
                <label className="cursor-pointer">
                  <span className="rounded-2xl bg-[#008E92] px-6 py-3 font-black text-white hover:bg-[#05777B]">
                    {loading ? 'جاري القراءة...' : 'اختر ملف'}
                  </span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={loading}
                  />
                </label>
                {file && <p className="mt-3 text-sm text-slate-400">📄 {file.name}</p>}
              </div>
            </div>

            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
              <h3 className="font-black text-amber-900 mb-2">⚠️ مهم — قراءة الوقت</h3>
              <ul className="text-sm text-amber-800 space-y-1">
                <li>• نتجاهل أي نص بين قوسين مثل <code>(8H)</code> أو <code>(12H)</code></li>
                <li>• نعتمد فقط على وقت البداية ووقت النهاية</li>
                <li>• 9 AM → 9 PM = 12 ساعة</li>
                <li>• 5 PM → 1 AM = 8 ساعات (يعبر منتصف الليل)</li>
              </ul>
            </div>
          </div>
        )}

        {/* ===== Preview Tab ===== */}
        {activePanel === 'preview' && (
          <div className="space-y-4">
            {warnings.length > 0 && (
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
                {warnings.map((w, i) => <p key={i} className="text-sm font-bold text-amber-800">{w}</p>)}
              </div>
            )}

            {rowsWithWarnings.length > 0 && (
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <h3 className="mb-3 font-black text-amber-700">⚠️ صفوف بها تحذيرات ({rowsWithWarnings.length})</h3>
                <div className="space-y-2">
                  {rowsWithWarnings.map((r, i) => (
                    <div key={i} className="rounded-xl bg-amber-50 p-3 text-sm">
                      <span className="font-black">{r.rider_name}</span> — {r.day_name_ar}
                      <ul className="mt-1 text-amber-700">
                        {r.warnings.map((w, j) => <li key={j}>• {w}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Options */}
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createAccounts}
                  onChange={e => setCreateAccounts(e.target.checked)}
                  className="h-5 w-5 rounded"
                />
                <div>
                  <p className="font-bold text-[#061827]">إنشاء حسابات للدليفري من الملف</p>
                  <p className="text-xs text-slate-500">سيتم توليد username ورمز سري من 4 أرقام لكل دليفري جديد</p>
                </div>
              </label>
            </div>

            {/* Data table */}
            <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#061827] text-white">
                    <tr>
                      <th className="px-3 py-2 text-right">الدليفري</th>
                      <th className="px-3 py-2 text-right">Username</th>
                      <th className="px-3 py-2 text-right">الفرع</th>
                      <th className="px-3 py-2 text-right">اليوم</th>
                      <th className="px-3 py-2 text-center">بداية</th>
                      <th className="px-3 py-2 text-center">نهاية</th>
                      <th className="px-3 py-2 text-center">ساعات</th>
                      <th className="px-3 py-2 text-center">حالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((row, i) => (
                      <tr key={i} className={`border-b border-slate-50 ${row.warnings.length > 0 ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
                        <td className="px-3 py-2 font-bold">{row.rider_name}</td>
                        <td className="px-3 py-2 font-mono text-slate-400">{row.username}</td>
                        <td className="px-3 py-2">{row.branch_name || <span className="text-red-400">غير محدد</span>}</td>
                        <td className="px-3 py-2">{row.day_name_ar}</td>
                        <td className="px-3 py-2 text-center">{row.shift_start || '—'}</td>
                        <td className="px-3 py-2 text-center">{row.shift_end || '—'}</td>
                        <td className="px-3 py-2 text-center">
                          {row.is_day_off
                            ? <span className="text-amber-600">إجازة</span>
                            : row.planned_hours > 0 ? `${row.planned_hours.toFixed(1)}h` : '—'
                          }
                          {row.crosses_midnight && <span className="text-purple-500 mr-1">🌙</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.warnings.length > 0
                            ? <AlertTriangle size={14} className="text-amber-500 mx-auto" />
                            : <CheckCircle2 size={14} className="text-emerald-500 mx-auto" />
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleImport}
                disabled={importing || previewData.length === 0}
                className="flex-1 rounded-2xl bg-[#008E92] py-3 font-black text-white hover:bg-[#05777B] disabled:opacity-50"
              >
                {importing ? 'جاري الاعتماد...' : `✅ اعتماد واستيراد (${previewData.length} صف)`}
              </button>
              <button
                onClick={() => setActivePanel('import')}
                className="rounded-2xl border border-slate-200 px-5 py-3 font-bold text-slate-600 hover:bg-slate-50"
              >
                رجوع
              </button>
            </div>
          </div>
        )}

        {/* ===== Accounts Tab ===== */}
        {activePanel === 'accounts' && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
              <p className="font-black text-amber-900">⚠️ سجّل هذه الأرقام الآن — لن تظهر مرة ثانية بعد الإغلاق</p>
            </div>

            <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-slate-100">
                <h3 className="font-black text-[#061827]">الحسابات المنشأة ({generatedAccounts.length})</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowPins(!showPins)}
                    className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
                  >
                    {showPins ? <EyeOff size={14} /> : <Eye size={14} />}
                    {showPins ? 'إخفاء' : 'إظهار'}
                  </button>
                  <button
                    onClick={exportAccountsCSV}
                    className="flex items-center gap-1 rounded-xl bg-[#008E92]/10 px-3 py-1.5 text-sm font-bold text-[#008E92] hover:bg-[#008E92]/20"
                  >
                    <Download size={14} />
                    CSV
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2 text-right font-bold">الدليفري</th>
                      <th className="px-4 py-2 text-right font-bold">Username</th>
                      <th className="px-4 py-2 text-center font-bold">رمز سري</th>
                      <th className="px-4 py-2 text-right font-bold">الفرع</th>
                      <th className="px-4 py-2 text-center font-bold">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {generatedAccounts.map((acc, i) => (
                      <tr key={i} className="border-t border-slate-50">
                        <td className="px-4 py-2 font-bold">{acc.rider_name}</td>
                        <td className="px-4 py-2 font-mono text-xs text-slate-600">{acc.username}</td>
                        <td className="px-4 py-2 text-center font-mono font-black text-[#008E92] text-lg">
                          {showPins ? acc.pin : '••••'}
                        </td>
                        <td className="px-4 py-2 text-slate-500">{acc.branch_name}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            acc.status === 'new' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {acc.status === 'new' ? 'جديد' : 'محدّث'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
