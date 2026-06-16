export type CanonicalBranch = 'فرع الشامي' | 'فرع شكري'

export const CANONICAL_BRANCHES: CanonicalBranch[] = ['فرع الشامي', 'فرع شكري']

export function normalizeArabic(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/[\\u064B-\\u065F\\u0670]/g, '')
    .replace(/ـ/g, '')
    .replace(/أ|إ|آ/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\\s+/g, '')
    .toLowerCase()
}

export function canonicalBranchName(value: unknown): CanonicalBranch | null {
  const raw = String(value ?? '').trim()
  const latin = raw.toLowerCase().replace(/[^a-z0-9]/g, '')
  const v = normalizeArabic(raw)
  if (!v && !latin) return null

  if (
    v.includes('شامي') ||
    v.includes('الشامي') ||
    latin.includes('shamy') ||
    latin.includes('shami') ||
    latin.includes('elshamy') ||
    latin.includes('alshamy')
  ) return 'فرع الشامي'

  if (
    v.includes('شكري') ||
    v.includes('شكرى') ||
    latin.includes('shkri') ||
    latin.includes('shukri') ||
    latin.includes('shokry') ||
    latin.includes('shoukry')
  ) return 'فرع شكري'

  return null
}

export function displayBranchName(value: unknown, fallback = 'غير محدد') {
  return canonicalBranchName(value) || String(value ?? '').trim() || fallback
}

export function branchKeyFromRow(row: any, fallback?: unknown) {
  return displayBranchName(row?.branch_name || row?.branch || row?.branch_label || fallback)
}

export function isCanonicalBranch(value: unknown) {
  return !!canonicalBranchName(value)
}

export function uniqueCanonicalBranches(values: unknown[]) {
  const set = new Set<CanonicalBranch>()
  for (const v of values) {
    const c = canonicalBranchName(v)
    if (c) set.add(c)
  }
  return CANONICAL_BRANCHES.filter(b => set.has(b))
}
