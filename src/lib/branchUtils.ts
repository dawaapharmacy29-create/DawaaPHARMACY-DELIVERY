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
  const v = normalizeArabic(value)
  if (!v) return null
  if (v.includes('شامي') || v.includes('الشامي')) return 'فرع الشامي'
  if (v.includes('شكري') || v.includes('شكرى')) return 'فرع شكري'
  return null
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
