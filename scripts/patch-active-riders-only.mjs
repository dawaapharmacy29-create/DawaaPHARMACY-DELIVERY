import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/RiderCompensationCenter.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

const before = "supabase.from('riders').select('*').order('name', { ascending: true })"
const after = "supabase.from('riders').select('*').eq('status', 'active').order('name', { ascending: true })"

if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error('Active riders filter anchor not found')
  source = source.replace(before, after)
}

await writeFile(file, source, 'utf8')
console.log('Rider compensation now lists active riders only')
