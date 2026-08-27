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
    ]

    const worksheet = XLSX.utils.aoa_to_sheet(sheetData)
    const lastDataRow = 5 + dataRows.length
    const totalRow = lastDataRow + 1

    worksheet['!merges'] = [
      XLSX.utils.decode_range('A1:J1'),
      XLSX.utils.decode_range('A2:J2'),
      XLSX.utils.decode_range('A3:J3'),
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
      { hpt: 30 },
      { hpt: 24 },
      { hpt: 22 },
      { hpt: 8 },
      { hpt: 34 },
    ]
    worksheet['!autofilter'] = { ref: 'A5:J' + lastDataRow }
    ;(worksheet as any)['!sheetViews'] = [{ rightToLeft: true }]
    ;(worksheet as any)['!freeze'] = { xSplit: 0, ySplit: 5, topLeftCell: 'A6', activePane: 'bottomLeft', state: 'frozen' }

    const titleStyle = {
      font: { bold: true, sz: 18, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '0F766E' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    }
    const subtitleStyle = {
      font: { bold: true, sz: 12, color: { rgb: '0F172A' } },
      fill: { fgColor: { rgb: 'CCFBF1' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    }
    const headerStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '0F766E' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: {
        top: { style: 'thin', color: { rgb: 'D1D5DB' } },
        bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
        left: { style: 'thin', color: { rgb: 'D1D5DB' } },
        right: { style: 'thin', color: { rgb: 'D1D5DB' } },
      },
    }
    const approvedStyle = {
      font: { bold: true, color: { rgb: '065F46' } },
      fill: { fgColor: { rgb: 'D1FAE5' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    }
    const totalStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '064E3B' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    }

    if (worksheet.A1) (worksheet.A1 as any).s = titleStyle
    if (worksheet.A2) (worksheet.A2 as any).s = subtitleStyle
    if (worksheet.A3) (worksheet.A3 as any).s = subtitleStyle
    for (let col = 0; col < headers.length; col += 1) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: 4, c: col })] as any
      if (cell) cell.s = headerStyle
    }
    for (let rowIndex = 5; rowIndex < lastDataRow; rowIndex += 1) {
      for (const colIndex of [6, 7, 9]) {
        const cell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })] as any
        if (cell) cell.s = approvedStyle
      }
    }
    for (let col = 0; col < headers.length; col += 1) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: totalRow - 1, c: col })] as any
      if (cell) cell.s = totalStyle
    }

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
    XLSX.utils.book_append_sheet(workbook, notes, 'تعريف الأعمدة')

    const fileName = 'تقرير_اعتماد_الدليفري_' + selectedFrom + '_' + selectedTo + '.xlsx'
    XLSX.writeFile(workbook, fileName, { compression: true, cellStyles: true })
    toast.success('تم تصدير تقرير الدورة: ' + rows.length + ' مندوب · ' + total.approvedOrderUnits + ' وحدة أوردر معتمدة · ' + total.approvedTrips + ' مشوار معتمد')
  }

  function printMonthlyReport() {`,
'cycle rider Excel export function',
)

replaceOnce(
`          <button onClick={printMonthlyReport} className="flex items-center gap-2 rounded-2xl bg-[#061827] px-5 py-3 font-black text-white shadow-sm hover:bg-[#0b2a42]">
            <Printer size={18} /> تصدير تقرير نهاية الدورة PDF
          </button>`,
`          <button onClick={exportRiderCycleApprovalXlsx} className="flex items-center gap-2 rounded-2xl bg-teal-700 px-5 py-3 font-black text-white shadow-lg ring-2 ring-teal-200 transition hover:bg-teal-800" title="تقرير Excel كامل لكل المناديب: الأوردرات ×1 و×1.5 والمشاوير المعتمدة">
            <FileSpreadsheet size={19} /> Excel اعتماد الدورة
          </button>
          <button onClick={printMonthlyReport} className="flex items-center gap-2 rounded-2xl bg-[#061827] px-5 py-3 font-black text-white shadow-sm hover:bg-[#0b2a42]">
            <Printer size={18} /> تصدير تقرير نهاية الدورة PDF
          </button>`,
'cycle rider Excel export button',
)

await writeFile(file, source, 'utf8')
console.log('Premium rider cycle Excel approval report added to reconciliation')
