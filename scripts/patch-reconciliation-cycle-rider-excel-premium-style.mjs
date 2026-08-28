import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/Reconciliation.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

const start = source.indexOf('  function exportRiderCycleApprovalXlsx() {')
const end = source.indexOf('\n\n  function printMonthlyReport() {', start)

if (start < 0 || end < 0) {
  if (source.includes('async function exportRiderCycleApprovalXlsx()') && source.includes('xlsx-js-style@1.2.0')) {
    console.log('Premium styled rider Excel export already present')
    process.exit(0)
  }
  throw new Error('Premium styled rider Excel export anchor not found')
}

const replacement = `  async function loadStyledXlsx(): Promise<any> {
    const win = window as any
    if (win.XLSX?.style_version) return win.XLSX

    return await new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-dawaa-xlsx-style="1"]') as HTMLScriptElement | null
      if (existing) {
        if (win.XLSX?.style_version) return resolve(win.XLSX)
        existing.addEventListener('load', () => resolve(win.XLSX), { once: true })
        existing.addEventListener('error', () => reject(new Error('تعذر تحميل محرك Excel المصمم')), { once: true })
        return
      }

      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.min.js'
      script.async = true
      script.dataset.dawaaXlsxStyle = '1'
      script.onload = () => win.XLSX?.style_version ? resolve(win.XLSX) : reject(new Error('محرك Excel المصمم لم يبدأ بشكل صحيح'))
      script.onerror = () => reject(new Error('تعذر تحميل محرك Excel المصمم'))
      document.head.appendChild(script)
    })
  }

  async function exportRiderCycleApprovalXlsx() {
    try {
      const SX = await loadStyledXlsx()
      const activeSummary = buildRiderSummaryRows()
      const summaryByRider = new Map(activeSummary.map(row => [row.rider.id, row]))

      const rows = riders
        .map(rider => {
          const existing = summaryByRider.get(rider.id)
          const normal = Number(existing?.normal || 0)
          const multiplier = Number(existing?.multiplier || 0)
          const totalOrders = Number(existing?.totalOrders || 0)
          const approvedOrders = normal + multiplier
          const approvedOrderUnits = Number(existing?.countedUnits || 0)
          const allTrips = Number(existing?.allTrips || 0)
          const approvedTrips = Number(existing?.approvedTrips || 0)
          return { rider, totalOrders, normal, multiplier, approvedOrders, approvedOrderUnits, allTrips, approvedTrips }
        })
        .sort((a, b) => {
          const branchA = String((a.rider as any).branch_name || '')
          const branchB = String((b.rider as any).branch_name || '')
          const byBranch = branchA.localeCompare(branchB, 'ar')
          return byBranch !== 0 ? byBranch : String(a.rider.name || '').localeCompare(String(b.rider.name || ''), 'ar')
        })

      if (!rows.length) {
        toast.error('لا يوجد مندوبون لتصدير تقرير الدورة')
        return
      }

      const total = rows.reduce((acc, row) => ({
        totalOrders: acc.totalOrders + row.totalOrders,
        normal: acc.normal + row.normal,
        multiplier: acc.multiplier + row.multiplier,
        approvedOrders: acc.approvedOrders + row.approvedOrders,
        approvedOrderUnits: acc.approvedOrderUnits + row.approvedOrderUnits,
        allTrips: acc.allTrips + row.allTrips,
        approvedTrips: acc.approvedTrips + row.approvedTrips,
      }), { totalOrders: 0, normal: 0, multiplier: 0, approvedOrders: 0, approvedOrderUnits: 0, allTrips: 0, approvedTrips: 0 })

      const tripApprovalRate = total.allTrips ? total.approvedTrips / total.allTrips : 0
      const title = 'صيدليات دواء — تقرير اعتماد الدليفري'
      const cycleText = 'الدورة: ' + selectedFrom + ' إلى ' + selectedTo
      const generatedText = 'تاريخ التصدير: ' + new Date().toLocaleString('ar-EG')
      const headers = ['م','اسم الدليفري','الفرع','عدد الأوردرات','أوردرات معتمدة ×1','أوردرات معتمدة ×1.5','عدد الأوردرات المعتمدة فعليًا','إجمالي وحدات الأوردرات المعتمدة','عدد المشاوير','إجمالي المشاوير المعتمدة']

      const dataRows = rows.map((row, index) => [
        index + 1, row.rider.name || '', (row.rider as any).branch_name || '', row.totalOrders,
        row.normal, row.multiplier, row.approvedOrders, row.approvedOrderUnits, row.allTrips, row.approvedTrips,
      ])

      const totalRowNumber = 11 + dataRows.length
      const noteRowNumber = totalRowNumber + 2
      const sheetData = [
        [title], [cycleText], [generatedText], [],
        ['عدد المناديب','', 'الأوردرات المعتمدة فعليًا','', 'وحدات الأوردرات بعد ×1.5','', 'المشاوير المعتمدة','', 'نسبة اعتماد المشاوير',''],
        [rows.length,'', total.approvedOrders,'', total.approvedOrderUnits,'', total.approvedTrips,'', tripApprovalRate,''],
        [], ['ملخص المناديب للدورة'], [], headers,
        ...dataRows,
        ['', 'الإجمالي العام', '', total.totalOrders, total.normal, total.multiplier, total.approvedOrders, total.approvedOrderUnits, total.allTrips, total.approvedTrips],
        [],
        ['ملاحظة: إجمالي وحدات الأوردرات المعتمدة = أوردر ×1 بوحدة واحدة + أوردر ×1.5 بوحدة ونصف. المشاوير المعتمدة تشمل فقط الحالات approved / completed.'],
      ]

      const ws = SX.utils.aoa_to_sheet(sheetData)
      ws['!merges'] = [
        SX.utils.decode_range('A1:J1'), SX.utils.decode_range('A2:J2'), SX.utils.decode_range('A3:J3'),
        SX.utils.decode_range('A5:B5'), SX.utils.decode_range('A6:B6'), SX.utils.decode_range('C5:D5'), SX.utils.decode_range('C6:D6'),
        SX.utils.decode_range('E5:F5'), SX.utils.decode_range('E6:F6'), SX.utils.decode_range('G5:H5'), SX.utils.decode_range('G6:H6'),
        SX.utils.decode_range('I5:J5'), SX.utils.decode_range('I6:J6'), SX.utils.decode_range('A8:J8'),
        SX.utils.decode_range('A' + noteRowNumber + ':J' + noteRowNumber),
      ]
      ws['!cols'] = [{wch:6},{wch:24},{wch:17},{wch:16},{wch:20},{wch:22},{wch:28},{wch:30},{wch:17},{wch:25}]
      ws['!rows'] = [{hpt:34},{hpt:25},{hpt:22},{hpt:8},{hpt:23},{hpt:32},{hpt:8},{hpt:25},{hpt:8},{hpt:38}]
      ws['!autofilter'] = { ref: 'A10:J' + (totalRowNumber - 1) }
      ws['!margins'] = { left:0.25, right:0.25, top:0.35, bottom:0.35, header:0.15, footer:0.15 }

      const border = {
        top: { style:'thin', color:{ rgb:'D8E4E2' } }, bottom: { style:'thin', color:{ rgb:'D8E4E2' } },
        left: { style:'thin', color:{ rgb:'D8E4E2' } }, right: { style:'thin', color:{ rgb:'D8E4E2' } },
      }
      const center = { horizontal:'center', vertical:'center', wrapText:true }
      const titleStyle = { fill:{fgColor:{rgb:'073B3A'}}, font:{bold:true,color:{rgb:'FFFFFF'},sz:20}, alignment:center }
      const cycleStyle = { fill:{fgColor:{rgb:'0F766E'}}, font:{bold:true,color:{rgb:'FFFFFF'},sz:12}, alignment:center }
      const dateStyle = { fill:{fgColor:{rgb:'CCFBF1'}}, font:{bold:true,color:{rgb:'134E4A'},sz:10}, alignment:center }
      const kpiLabel = { fill:{fgColor:{rgb:'F0FDFA'}}, font:{bold:true,color:{rgb:'115E59'},sz:10}, alignment:center, border }
      const kpiValue = { fill:{fgColor:{rgb:'FFFFFF'}}, font:{bold:true,color:{rgb:'0F766E'},sz:18}, alignment:center, border }
      const sectionStyle = { fill:{fgColor:{rgb:'E6FFFB'}}, font:{bold:true,color:{rgb:'134E4A'},sz:13}, alignment:{horizontal:'right',vertical:'center'} }
      const headerStyle = { fill:{fgColor:{rgb:'0F766E'}}, font:{bold:true,color:{rgb:'FFFFFF'},sz:10}, alignment:center, border }
      const totalStyle = { fill:{fgColor:{rgb:'064E3B'}}, font:{bold:true,color:{rgb:'FFFFFF'},sz:11}, alignment:center, border }
      const noteStyle = { fill:{fgColor:{rgb:'FFFBEB'}}, font:{bold:true,color:{rgb:'92400E'},sz:10}, alignment:{horizontal:'right',vertical:'center',wrapText:true}, border:{top:{style:'thin',color:{rgb:'F59E0B'}},bottom:{style:'thin',color:{rgb:'F59E0B'}},left:{style:'thin',color:{rgb:'F59E0B'}},right:{style:'thin',color:{rgb:'F59E0B'}}} }

      const ensure = (addr: string) => { if (!ws[addr]) ws[addr] = { t:'s', v:'' }; return ws[addr] }
      const styleRange = (ref: string, style: any) => {
        const rg = SX.utils.decode_range(ref)
        for (let r = rg.s.r; r <= rg.e.r; r += 1) for (let c = rg.s.c; c <= rg.e.c; c += 1) ensure(SX.utils.encode_cell({r,c})).s = style
      }

      styleRange('A1:J1', titleStyle); styleRange('A2:J2', cycleStyle); styleRange('A3:J3', dateStyle)
      ;['A5:B5','C5:D5','E5:F5','G5:H5','I5:J5'].forEach(ref => styleRange(ref, kpiLabel))
      ;['A6:B6','C6:D6','E6:F6','G6:H6','I6:J6'].forEach(ref => styleRange(ref, kpiValue))
      styleRange('A8:J8', sectionStyle); styleRange('A10:J10', headerStyle)
      ensure('I6').z = '0.0%'

      const maxUnits = Math.max(...rows.map(r => r.approvedOrderUnits), 1)
      const maxTrips = Math.max(...rows.map(r => r.approvedTrips), 1)
      const heat = (value: number, max: number) => {
        const ratio = max ? value / max : 0
        if (ratio >= 0.80) return '99F6E4'
        if (ratio >= 0.60) return 'CCFBF1'
        if (ratio >= 0.40) return 'D1FAE5'
        if (ratio >= 0.20) return 'ECFDF5'
        return 'FFFFFF'
      }

      rows.forEach((row, idx) => {
        const excelRow = 11 + idx
        const altFill = idx % 2 === 0 ? 'FFFFFF' : 'F8FAFC'
        for (let c = 0; c < 10; c += 1) {
          const cell = ensure(SX.utils.encode_cell({ r: excelRow - 1, c }))
          cell.s = { fill:{fgColor:{rgb:altFill}}, font:{color:{rgb:'1E293B'},sz:10}, alignment:center, border:{bottom:{style:'hair',color:{rgb:'E2E8F0'}}} }
        }
        ensure('B' + excelRow).s.alignment = { horizontal:'right', vertical:'center' }
        const branch = String((row.rider as any).branch_name || '')
        ensure('C' + excelRow).s = branch.includes('الشامي')
          ? { fill:{fgColor:{rgb:'ECFEFF'}}, font:{bold:true,color:{rgb:'155E75'}}, alignment:center, border }
          : { fill:{fgColor:{rgb:'F5F3FF'}}, font:{bold:true,color:{rgb:'5B21B6'}}, alignment:center, border }
        ensure('F' + excelRow).s = { ...ensure('F' + excelRow).s, font:{bold:true,color:{rgb:'B45309'}}, alignment:center }
        ensure('G' + excelRow).s = { ...ensure('G' + excelRow).s, font:{bold:true,color:{rgb:'047857'}}, alignment:center }
        ensure('H' + excelRow).s = { ...ensure('H' + excelRow).s, fill:{fgColor:{rgb:heat(row.approvedOrderUnits,maxUnits)}}, font:{bold:true,color:{rgb:'047857'}}, alignment:center, border }
        ensure('J' + excelRow).s = { ...ensure('J' + excelRow).s, fill:{fgColor:{rgb:heat(row.approvedTrips,maxTrips)}}, font:{bold:true,color:{rgb:'047857'}}, alignment:center, border }
        ;['D','E','F','G','I','J'].forEach(col => ensure(col + excelRow).z = '#,##0')
        ensure('H' + excelRow).z = '#,##0.0'
      })

      styleRange('A' + totalRowNumber + ':J' + totalRowNumber, totalStyle)
      ;['D','E','F','G','I','J'].forEach(col => ensure(col + totalRowNumber).z = '#,##0')
      ensure('H' + totalRowNumber).z = '#,##0.0'
      styleRange('A' + noteRowNumber + ':J' + noteRowNumber, noteStyle)

      const wb = SX.utils.book_new()
      wb.Props = { Title:title, Subject:cycleText, Author:'Dawaa Pharmacy Delivery', CreatedDate:new Date() }
      SX.utils.book_append_sheet(wb, ws, 'اعتماد الدليفري')

      const notes = SX.utils.aoa_to_sheet([
        ['البند','التعريف'],
        ['الدورة','26 من الشهر السابق إلى 25 من الشهر الحالي.'],
        ['أوردرات معتمدة ×1','الأوردرات الصحيحة المعتمدة بمعامل 1.'],
        ['أوردرات معتمدة ×1.5','الأوردرات المعتمدة التي تستحق معامل 1.5.'],
        ['عدد الأوردرات المعتمدة فعليًا','عدد الأوردرات المقبولة بدون تأثير الوزن.'],
        ['إجمالي وحدات الأوردرات المعتمدة','×1 + (×1.5 × 1.5)، وهو الرقم المرجعي لحساب الوحدات.'],
        ['إجمالي المشاوير المعتمدة','المشاوير بحالة approved أو completed فقط.'],
      ])
      notes['!cols'] = [{wch:34},{wch:85}]
      const notesRange = SX.utils.decode_range('A1:B7')
      for (let r = notesRange.s.r; r <= notesRange.e.r; r += 1) for (let c = 0; c <= 1; c += 1) {
        const addr = SX.utils.encode_cell({r,c}); if (!notes[addr]) notes[addr] = {t:'s',v:''}
        notes[addr].s = r === 0 ? headerStyle : { fill:{fgColor:{rgb:r % 2 ? 'FFFFFF' : 'F8FAFC'}}, font:{color:{rgb:'334155'}}, alignment:{horizontal:c===0?'center':'right',vertical:'center',wrapText:true}, border }
      }
      SX.utils.book_append_sheet(wb, notes, 'تعريف الأعمدة')

      const fileName = 'تقرير_اعتماد_الدليفري_' + selectedFrom + '_' + selectedTo + '.xlsx'
      SX.writeFile(wb, fileName, { compression:true, cellStyles:true })
      toast.success('تم تصدير Excel احترافي: ' + total.approvedOrderUnits + ' وحدة أوردر معتمدة · ' + total.approvedTrips + ' مشوار معتمد')
    } catch (error: any) {
      console.error(error)
      toast.error(error?.message || 'تعذر تصدير ملف Excel المصمم')
    }
  }`

source = source.slice(0, start) + replacement + source.slice(end)
await writeFile(file, source, 'utf8')
console.log('Premium real-styled rider cycle Excel export applied')
