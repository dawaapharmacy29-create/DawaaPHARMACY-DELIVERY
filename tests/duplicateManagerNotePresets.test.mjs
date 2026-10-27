import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../src/pages/admin/DuplicateInvoices.tsx', import.meta.url), 'utf8')
const presets = page.match(/const DUAL_VISIT_NOTE_PRESETS = \[([\s\S]*?)\n\]/)?.[1] || ''
const labels = [...presets.matchAll(/label: '([^']+)'/g)].map(match => match[1])
const notes = [...presets.matchAll(/note: '([^']+)'/g)].map(match => match[1])

test('manager has distinct complete quick confirmation notes for genuine second visits', () => {
  assert.equal(labels.length, 5)
  assert.equal(notes.length, labels.length)
  assert.equal(new Set(labels).size, labels.length)
  assert.equal(new Set(notes).size, notes.length)
  assert.ok(notes.every(note => note.trim().length >= 10))
  assert.ok(labels.includes('تأجيل الاستلام وإعادة الزيارة'))
  assert.ok(labels.includes('استكمال صنف ناقص'))
  assert.ok(labels.includes('استلام مرتجع منفصل'))
})

test('quick notes fill an editable field only for two-visit decisions; no automatic approval', () => {
  assert.match(page, /decisionChoice === 'both' && \(\s*<fieldset[^>]*>/)
  assert.match(page, /onClick=\{\(\) => setDecisionNote\(preset\.note\)\}/)
  assert.match(page, /aria-pressed=\{decisionNote === preset\.note\}/)
  assert.match(page, /disabled=\{savingPairDecision \|\| decisionUncertain\}/)
  assert.match(page, /<textarea value=\{decisionNote\} onChange=\{event => setDecisionNote\(event\.target\.value\)\}/)
  assert.match(page, /decisionNote\.trim\(\)\.length < 10/)
  assert.match(page, /onClick=\{\(\) => void saveUnifiedDecision\(\)\}/)
  assert.match(page, /اختار سببًا حصل فعلًا بعد مراجعة الزيارتين/)
})
