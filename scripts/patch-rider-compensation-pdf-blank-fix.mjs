import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/RiderCompensationCenter.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

function replaceRequired(before, after, label) {
  if (source.includes(after)) return
  if (!source.includes(before)) throw new Error(`Rider PDF blank fix anchor not found: ${label}`)
  source = source.replace(before, after)
}

replaceRequired(
  "report.style.cssText = 'position:fixed;left:-20000px;top:0;width:1123px;height:794px;background:#fff;z-index:-1;'",
  "report.style.cssText = 'position:fixed;left:0;top:0;width:1123px;height:794px;background:#fff;z-index:2147483647;transform:translateX(-200vw);opacity:1;visibility:visible;pointer-events:none;'",
  'offscreen report visibility',
)

replaceRequired(
  "      const canvas = await html2canvas(report.firstElementChild, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false })\n      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })\n      pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, 297, 210, undefined, 'FAST')\n      pdf.save(`تقرير-مستحقات-${rider.name || rider.username || 'دليفري'}-${from}-${to}.pdf`)\n      report.remove()",
  "      const reportPage = report.firstElementChild as HTMLElement | null\n      if (!reportPage) throw new Error('تعذر إنشاء محتوى التقرير')\n      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))\n      const canvas = await html2canvas(reportPage, {\n        scale: 1.5,\n        backgroundColor: '#ffffff',\n        useCORS: true,\n        logging: false,\n        imageTimeout: 10000,\n        removeContainer: true,\n        windowWidth: 1123,\n        windowHeight: 794,\n        scrollX: 0,\n        scrollY: 0,\n      })\n      if (!canvas.width || !canvas.height) throw new Error('صورة التقرير غير صالحة')\n      const context = canvas.getContext('2d', { willReadFrequently: true })\n      if (!context) throw new Error('تعذر قراءة صورة التقرير')\n      const sample = context.getImageData(0, 0, canvas.width, canvas.height).data\n      let nonWhitePixels = 0\n      const step = Math.max(4, Math.floor(sample.length / 12000 / 4) * 4)\n      for (let index = 0; index < sample.length; index += step) {\n        if (sample[index] < 245 || sample[index + 1] < 245 || sample[index + 2] < 245) {\n          nonWhitePixels += 1\n          if (nonWhitePixels > 20) break\n        }\n      }\n      if (nonWhitePixels <= 20) throw new Error('صورة التقرير خرجت فارغة؛ لم يتم حفظ ملف غير صالح')\n      const imageData = canvas.toDataURL('image/png')\n      if (!imageData.startsWith('data:image/png;base64,') || imageData.length < 10000) throw new Error('فشل تجهيز صورة التقرير')\n      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: false })\n      pdf.addImage(imageData, 'PNG', 0, 0, 297, 210)\n      const blob = pdf.output('blob')\n      if (!blob || blob.size < 10000) throw new Error('ملف PDF الناتج غير صالح')\n      const downloadUrl = URL.createObjectURL(blob)\n      const link = document.createElement('a')\n      link.href = downloadUrl\n      link.download = `تقرير-مستحقات-${rider.name || rider.username || 'دليفري'}-${from}-${to}.pdf`\n      document.body.appendChild(link)\n      link.click()\n      link.remove()\n      setTimeout(() => URL.revokeObjectURL(downloadUrl), 30000)\n      report.remove()",
  'PNG PDF generation and validation',
)

replaceRequired(
  "    } catch (error: any) {\n      toast.error('تعذر تحميل ملف PDF: ' + (error?.message || 'خطأ غير معروف'))\n    } finally {\n      setPdfDownloading(false)\n    }",
  "    } catch (error: any) {\n      document.querySelectorAll('[data-rider-pdf-report]').forEach(element => element.remove())\n      toast.error('تعذر تحميل ملف PDF: ' + (error?.message || 'خطأ غير معروف'))\n    } finally {\n      setPdfDownloading(false)\n    }",
  'cleanup failed report',
)

replaceRequired(
  "      const report = document.createElement('div')\n      report.dir = 'rtl'",
  "      const report = document.createElement('div')\n      report.dataset.riderPdfReport = 'true'\n      report.dir = 'rtl'",
  'report cleanup marker',
)

await writeFile(file, source, 'utf8')
console.log('Rider compensation blank PDF generation fixed with validated PNG output')
