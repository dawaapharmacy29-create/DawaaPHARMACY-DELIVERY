import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/RiderCompensationCenter.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

const before = `      document.body.appendChild(report)\n      await document.fonts?.ready`
const after = `      document.body.appendChild(report)\n      await document.fonts?.ready\n\n      // Freeze all computed CSS as inline styles before html2canvas runs.\n      // This prevents the embedded <style> block from being rendered as visible text in the PDF.\n      const reportElements = [report, ...Array.from(report.querySelectorAll('*'))] as HTMLElement[]\n      reportElements.forEach(element => {\n        if (element.tagName === 'STYLE') return\n        const computed = window.getComputedStyle(element)\n        const frozen = Array.from(computed).map(property => \`${'${property}'}:${'${computed.getPropertyValue(property)}'};\`).join('')\n        element.style.cssText += frozen\n      })\n      report.querySelectorAll('style').forEach(styleElement => styleElement.remove())`

if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error('Rider PDF inline-style anchor not found')
  source = source.replace(before, after)
}

await writeFile(file, source, 'utf8')
console.log('Rider compensation PDF styles frozen inline before capture')
