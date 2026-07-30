import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/RiderCompensationCenter.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

source = source.replace(
  "function iso(date: Date) {\n  return date.toISOString().slice(0, 10)\n}",
  "function iso(date: Date) {\n  const year = date.getFullYear()\n  const month = String(date.getMonth() + 1).padStart(2, '0')\n  const day = String(date.getDate()).padStart(2, '0')\n  return `${year}-${month}-${day}`\n}",
)

if (!source.includes("import { jsPDF } from 'jspdf'")) {
  source = source.replace(
    "import { supabase } from '../../lib/supabase'",
    "import { supabase } from '../../lib/supabase'\nimport { jsPDF } from 'jspdf'\nimport html2canvas from 'html2canvas'",
  )
}

source = source.replace(
  /\s*const jspdfUrl = 'https:\/\/esm\.sh\/jspdf@2\.5\.2'[\s\S]*?const html2canvas = canvasModule\.default \|\| canvasModule\n/,
  '\n',
)

source = source.replace(
  /report\.style\.cssText = '[^']*'/,
  "report.style.cssText = 'position:fixed;left:0;top:0;width:1123px;height:794px;background:#fff;z-index:2147483647;opacity:0.01;visibility:visible;pointer-events:none;overflow:hidden;'",
)

source = source.replace(
  /const reportPage = report\.firstElementChild as HTMLElement \| null[\s\S]*?const pdf = new jsPDF\(\{ orientation: 'landscape', unit: 'mm', format: 'a4', compress: false \}\)/,
  `const reportPage = report.firstElementChild as HTMLElement | null
      if (!reportPage) throw new Error('تعذر إنشاء محتوى التقرير')
      reportPage.style.width = '1123px'
      reportPage.style.height = '794px'
      reportPage.style.display = 'block'
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const canvas = await html2canvas(reportPage, {
        scale: 1.25,
        backgroundColor: '#ffffff',
        useCORS: false,
        logging: false,
        width: 1123,
        height: 794,
        windowWidth: 1123,
        windowHeight: 794,
        scrollX: 0,
        scrollY: 0,
      })
      if (!canvas.width || !canvas.height) throw new Error('فشل إنشاء صورة التقرير')
      const imageData = canvas.toDataURL('image/png')
      if (!imageData.startsWith('data:image/png;base64,')) throw new Error('فشل تجهيز صورة التقرير')
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })`,
)

await writeFile(file, source, 'utf8')
console.log('Rider compensation stable dates and PDF generation applied without dimension checks')