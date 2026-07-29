import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/RiderCompensationCenter.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

const before = "      if (canvas.width < 1000 || canvas.height < 700) throw new Error('تعذر تجهيز أبعاد التقرير')\n      const imageData = canvas.toDataURL('image/png')"
const after = "      if (!canvas.width || !canvas.height) throw new Error('تعذر إنشاء صورة التقرير')\n      const imageData = canvas.toDataURL('image/png')"

if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error('Rider PDF dimension guard anchor not found')
  source = source.replace(before, after)
}

await writeFile(file, source, 'utf8')
console.log('Rider PDF accepts valid canvas dimensions on all displays')
