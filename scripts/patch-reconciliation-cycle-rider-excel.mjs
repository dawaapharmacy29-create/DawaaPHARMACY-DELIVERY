import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/Reconciliation.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

function replaceOnce(before, after, label) {
  if (source.includes(after)) return
  if (!source.includes(before)) throw new Error(`Rider cycle Excel export anchor not found: ${label}`)
  source = source.replace(before, after)
}

replaceOnce(
`  function printMonthlyReport() {`,
`  function exportRiderCycleApprovalXlsx() {
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
        return {
          rider,
          totalOrders,
          normal,
          multiplier,
          approvedOrders,
          approvedOrderUnits,
          allTrips,
          approvedTrips,
        }
      })
      .sort((a, b) => {
        const branchA = String((a.rider as any).branch_name || '')
        const branchB = String((b.rider as any).branch_name || '')
        const byBranch = branchA.localeCompare(branchB, 'ar')
        if (byBranch !== 0) return byBranch
        return String(a.rider.name || '').localeCompare(String(b.rider.name || ''), 'ar')
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
    }), {
      totalOrders: 0,
      normal: 0,
      multiplier: 0,
      approvedOrders: 0,
      approvedOrderUnits: 0,
      allTrips: 0,
      approvedTrips: 0,
    })

    const title = 'صيدليات دواء — تقرير اعتماد الدليفري للدورة'
    const cycleText = 'الدورة: ' + selectedFrom + ' إلى ' + selectedTo
    const generatedText = 'تاريخ التصدير: ' + new Date().toLocaleString('ar-EG')
    const headers = [
      'م',
      'اسم الدليفري',
      'الفرع',
      'عدد الأوردرات',
      'أوردرات معتمدة ×1',
      'أوردرات معتمدة ×1.5',
      'عدد الأوردرات المعتمدة فعليًا',
      'إجمالي وحدات الأوردرات المعتمدة',
      'عدد المشاوير',
      'إجمالي المشاوير المعتمدة',
    ]

    const dataRows = rows.map((row, index) => [
      index + 1,
      row.rider.name || '',
      (row.rider as any).branch_name || '',
      row.totalOrders,
      row.normal,
      row.multiplier,
      row.approvedOrders,
      row.approvedOrderUnits,
      row.allTrips,
      row.approvedTrips,
    ])

    const sheetData = [
      [title],
      [cycleText],
      [generatedText],
      [],
      ['عدد المناديب', '', 'الأوردرات المعتمدة', '', 'وحدات الأوردرات المعتمدة', '', 'المشاوير المعتمدة', '', 'إجمالي المشاوير', ''],
      [rows.length, '', total.approvedOrders, '', total.approvedOrderUnits, '', total.approvedTrips, '', total.allTrips, ''],
      [],
      headers,
      ...dataRows,
      [
        '',
        'الإجمالي العام',
        '',
        total.totalOrders,
        total.normal,
        total.multiplier,
        total.approvedOrders,
        total.approvedOrderUnits,
        total.allTrips,
        total.approvedTrips,
      ],
      [],
      ['ملاحظة: إجمالي وحدات الأوردرات المعتمدة = أوردر ×1 بوحدة واحدة + أوردر ×1.5 بوحدة ونصف. المشاوير المعتمدة تحسب فقط للحالات approved / completed.'],
    ]

    const worksheet = XLSX.utils.aoa_to_sheet(sheetData)
    const headerRowIndex = 7
    const firstDataRowIndex = 8
    const lastDataRowIndex = firstDataRowIndex + dataRows.length - 1
    const totalRowIndex = lastDataRowIndex + 1
    const noteRowIndex = totalRowIndex + 2

    worksheet['!merges'] = [
      XLSX.utils.decode_range('A1:J1'),
      XLSX.utils.decode_range('A2:J2'),
      XLSX.utils.decode_range('A3:J3'),
      XLSX.utils.decode_range('A5:B5'),
      XLSX.utils.decode_range('C5:D5'),
      XLSX.utils.decode_range('E5:F5'),
      XLSX.utils.decode_range('G5:H5'),
      XLSX.utils.decode_range('I5:J5'),
      XLSX.utils.decode_range('A6:B6'),
      XLSX.utils.decode_range('C6:D6'),
      XLSX.utils.decode_range('E6:F6'),
      XLSX.utils.decode_range('G6:H6'),
      XLSX.utils.decode_range('I6:J6'),
      XLSX.utils.decode_range('A' + (noteRowIndex + 1) + ':J' + (noteRowIndex + 1)),
    ]
    worksheet['!cols'] = [
      { wch: 6 },
      { wch: 24 },
      { wch: 18 },
      { wch: 18 },
      { wch: 21 },
      { wch: 23 },
      { wch: 30 },
      { wch: 32 },
      { wch: 18 },
      { wch: 27 },
    ]
    worksheet['!rows'] = [
      { hpt: 34 },
      { hpt: 25 },
      { hpt: 22 },
      { hpt: 9 },
      { hpt: 24 },
      { hpt: 34 },
      { hpt: 9 },
      { hpt: 38 },
    ]
    worksheet['!autofilter'] = { ref: 'A8:J' + (lastDataRowIndex + 1) }
    ;(worksheet as any)['!sheetViews'] = [{ rightToLeft: true }]
    ;(worksheet as any)['!freeze'] = { xSplit: 0, ySplit: 8, topLeftCell: 'A9', activePane: 'bottomLeft', state: 'frozen' }
    ;(worksheet as any)['!pageSetup'] = { orientation: 'landscape', fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
    ;(worksheet as any)['!margins'] = { left: 0.25, right: 0.25, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 }

    const thinBorder = {
      top: { style: 'thin', color: { rgb: 'CBD5E1' } },
      bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
      left: { style: 'thin', color: { rgb: 'CBD5E1' } },
      right: { style: 'thin', color: { rgb: 'CBD5E1' } },
    }
    const titleStyle = {
      font: { bold: true, sz: 20, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '073B4C' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    }
    const subtitleStyle = {
      font: { bold: true, sz: 12, color: { rgb: '0F172A' } },
      fill: { fgColor: { rgb: 'DFF7F5' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    }
    const kpiLabelStyle = {
      font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '0F766E' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: thinBorder,
    }
    const kpiValueStyle = {
      font: { bold: true, sz: 17, color: { rgb: '064E3B' } },
      fill: { fgColor: { rgb: 'ECFDF5' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: thinBorder,
      numFmt: '#,##0.##',
    }
    const headerStyle = {
      font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '0F766E' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: thinBorder,
    }
    const bodyStyleA = {
      font: { sz: 10, color: { rgb: '0F172A' } },
      fill: { fgColor: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: thinBorder,
      numFmt: '#,##0.##',
    }
    const bodyStyleB = {
      font: { sz: 10, color: { rgb: '0F172A' } },
      fill: { fgColor: { rgb: 'F8FAFC' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: thinBorder,
      numFmt: '#,##0.##',
    }
    const nameStyle = {
      font: { bold: true, sz: 10, color: { rgb: '0F172A' } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: thinBorder,
    }
    const multiplierStyle = {
      font: { bold: true, color: { rgb: '92400E' } },
      fill: { fgColor: { rgb: 'FEF3C7' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: thinBorder,
      numFmt: '#,##0',
    }
    const approvedStyle = {
      font: { bold: true, color: { rgb: '065F46' } },
      fill: { fgColor: { rgb: 'D1FAE5' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: thinBorder,
      numFmt: '#,##0.##',
    }
    const approvedUnitsStyle = {
      font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '059669' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: thinBorder,
      numFmt: '#,##0.##',
    }
    const approvedTripsStyle = {
      font: { bold: true, color: { rgb: '075985' } },
      fill: { fgColor: { rgb: 'E0F2FE' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: thinBorder,
      numFmt: '#,##0',
    }
    const totalStyle = {
      font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '064E3B' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: thinBorder,
      numFmt: '#,##0.##',
    }
    const noteStyle = {
      font: { bold: true, sz: 10, color: { rgb: '7C2D12' } },
      fill: { fgColor: { rgb: 'FFF7ED' } },
      alignment: { horizontal: 'right', vertical: 'center', wrapText: true },
      border: thinBorder,
    }

    if (worksheet.A1) (worksheet.A1 as any).s = titleStyle
    if (worksheet.A2) (worksheet.A2 as any).s = subtitleStyle
    if (worksheet.A3) (worksheet.A3 as any).s = subtitleStyle

    for (const cellAddress of ['A5','C5','E5','G5','I5']) {
      const cell = worksheet[cellAddress] as any
      if (cell) cell.s = kpiLabelStyle
    }
    for (const cellAddress of ['A6','C6','E6','G6','I6']) {
      const cell = worksheet[cellAddress] as any
      if (cell) cell.s = kpiValueStyle
    }

    for (let col = 0; col < headers.length; col += 1) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: headerRowIndex, c: col })] as any
      if (cell) cell.s = headerStyle
    }

    for (let rowIndex = firstDataRowIndex; rowIndex <= lastDataRowIndex; rowIndex += 1) {
      const baseStyle = (rowIndex - firstDataRowIndex) % 2 === 0 ? bodyStyleA : bodyStyleB
      for (let col = 0; col < headers.length; col += 1) {
        const cell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: col })] as any
        if (cell) cell.s = baseStyle
      }
      const nameCell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: 1 })] as any
      if (nameCell) nameCell.s = { ...baseStyle, ...nameStyle, fill: baseStyle.fill }
      const multiplierCell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: 5 })] as any
      if (multiplierCell) multiplierCell.s = multiplierStyle
      const approvedCell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: 6 })] as any
      if (approvedCell) approvedCell.s = approvedStyle
      const approvedUnitsCell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: 7 })] as any
      if (approvedUnitsCell) approvedUnitsCell.s = approvedUnitsStyle
      const approvedTripsCell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: 9 })] as any
      if (approvedTripsCell) approvedTripsCell.s = approvedTripsStyle
      ;(worksheet['!rows'] as any[])[rowIndex] = { hpt: 24 }
    }

    for (let col = 0; col < headers.length; col += 1) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: totalRowIndex, c: col })] as any
      if (cell) cell.s = totalStyle
    }
    ;(worksheet['!rows'] as any[])[totalRowIndex] = { hpt: 29 }

    const noteCell = worksheet[XLSX.utils.encode_cell({ r: noteRowIndex, c: 0 })] as any
    if (noteCell) noteCell.s = noteStyle
    ;(worksheet['!rows'] as any[])[noteRowIndex] = { hpt: 34 }

    const workbook = XLSX.utils.book_new()
    workbook.Props = {
      Title: title,
      Subject: cycleText,
      Author: 'Dawaa Pharmacy Delivery',
      CreatedDate: new Date(),
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, 'اعتماد الدليفري')

    const notes = XLSX.utils.aoa_to_sheet([
      ['شرح التقرير'],
      ['الدورة', selectedFrom + ' إلى ' + selectedTo],
      ['عدد الأوردرات المعتمدة فعليًا', 'عدد الأوردرات المقبولة بعد المطابقة بدون تأثير معامل ×1.5.'],
      ['إجمالي وحدات الأوردرات المعتمدة', 'أوردر ×1 = وحدة واحدة، وأوردر ×1.5 = 1.5 وحدة. هذا هو الرقم المرجعي للحساب.'],
      ['إجمالي المشاوير المعتمدة', 'المشاوير التي حالتها approved أو completed فقط.'],
      ['ملاحظة', 'الملف يعتمد على نفس بيانات دورة المطابقة المحددة في الصفحة وقت التصدير.'],
    ])
    notes['!cols'] = [{ wch: 34 }, { wch: 85 }]
    ;(notes as any)['!sheetViews'] = [{ rightToLeft: true }]
    for (let r = 0; r <= 5; r += 1) {
      for (let c = 0; c <= 1; c += 1) {
        const cell = notes[XLSX.utils.encode_cell({ r, c })] as any
        if (!cell) continue
        cell.s = r === 0
          ? { font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '073B4C' } }, alignment: { horizontal: 'center' } }
          : { font: { bold: c === 0, color: { rgb: '0F172A' } }, fill: { fgColor: { rgb: r % 2 === 0 ? 'F8FAFC' : 'FFFFFF' } }, alignment: { horizontal: c === 0 ? 'right' : 'right', wrapText: true }, border: thinBorder }
      }
    }
    XLSX.utils.book_append_sheet(workbook, notes, 'تعريف الأعمدة')

    const fileName = 'تقرير_اعتماد_الدليفري_' + selectedFrom + '_' + selectedTo + '.xlsx'
    XLSX.writeFile(workbook, fileName, { compression: true, cellStyles: true })
    toast.success('تم تصدير تقرير Excel المصمم: ' + rows.length + ' مندوب · ' + total.approvedOrderUnits + ' وحدة أوردر معتمدة · ' + total.approvedTrips + ' مشوار معتمد')
  }

  function printMonthlyReport() {`,
'cycle rider Excel export function',
)

replaceOnce(
`          <button onClick={printMonthlyReport} className="flex items-center gap-2 rounded-2xl bg-[#061827] px-5 py-3 font-black text-white shadow-sm hover:bg-[#0b2a42]">
            <Printer size={18} /> تصدير تقرير نهاية الدورة PDF
          </button>`,
`          <button onClick={exportRiderCycleApprovalXlsx} className="flex items-center gap-2 rounded-2xl bg-teal-700 px-5 py-3 font-black text-white shadow-lg ring-2 ring-teal-200 transition hover:bg-teal-800" title="تقرير Excel مصمم للدورة: أوردرات ×1 و×1.5 والمشاوير المعتمدة">
            <FileSpreadsheet size={19} /> Excel اعتماد الدورة — مصمم
          </button>
          <button onClick={printMonthlyReport} className="flex items-center gap-2 rounded-2xl bg-[#061827] px-5 py-3 font-black text-white shadow-sm hover:bg-[#0b2a42]">
            <Printer size={18} /> تصدير تقرير نهاية الدورة PDF
          </button>`,
'cycle rider Excel export button',
)

await writeFile(file, source, 'utf8')
console.log('Premium designed rider cycle Excel approval report added to reconciliation')
