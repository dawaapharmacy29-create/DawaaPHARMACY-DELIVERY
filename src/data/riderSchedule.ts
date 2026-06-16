export interface RiderScheduleDay {
  day: string
  shift: string
}

export interface RiderScheduleItem {
  branch: string
  name: string
  username: string
  level: 'junior' | 'mid' | 'senior'
  schedule: RiderScheduleDay[]
}

export const riderSchedule: RiderScheduleItem[] = [
  { branch: 'الشامي', name: 'مدحت', username: 'مدحت', level: 'senior', schedule: [
    { day: 'السبت', shift: '9 AM → 5PM (8h)' }, { day: 'الأحد', shift: '9 AM → 5PM (8h)' }, { day: 'الاثنين', shift: '9 AM → 5PM (8h)' }, { day: 'الثلاثاء', shift: '9 AM → 5PM (8h)' }, { day: 'الأربعاء', shift: '9 AM → 5PM (8h)' }, { day: 'الخميس', shift: '9 AM → 5PM (8h)' }, { day: 'الجمعة', shift: '9 AM → 5PM (8h)' }
  ]},
  { branch: 'الشامي', name: 'محمود', username: 'محمود', level: 'mid', schedule: [
    { day: 'السبت', shift: 'إجازة 🟡' }, { day: 'الأحد', shift: '1 PM → 9 PM (8h)' }, { day: 'الاثنين', shift: '1 PM → 9 PM (8h)' }, { day: 'الثلاثاء', shift: '1 PM → 9 PM (8h)' }, { day: 'الأربعاء', shift: '1 PM → 9 PM (8h)' }, { day: 'الخميس', shift: '1 PM → 9 PM (8h)' }, { day: 'الجمعة', shift: '1 PM → 9 PM (8h)' }
  ]},
  { branch: 'الشامي', name: 'احمد البطل', username: 'احمد.البطل', level: 'senior', schedule: [
    { day: 'السبت', shift: '5 PM → 12 AM (8h)' }, { day: 'الأحد', shift: '5 PM → 12 AM (8h)' }, { day: 'الاثنين', shift: '5 PM → 12 AM (8h)' }, { day: 'الثلاثاء', shift: 'إجازة 🟡' }, { day: 'الأربعاء', shift: '5 PM → 12 AM (8h)' }, { day: 'الخميس', shift: '5 PM → 12 AM (8h)' }, { day: 'الجمعة', shift: '5 PM → 12 AM (8h)' }
  ]},
  { branch: 'الشامي', name: 'مصطفي', username: 'مصطفي', level: 'junior', schedule: [
    { day: 'السبت', shift: '7 PM → 5 AM (12h)' }, { day: 'الأحد', shift: '7 PM → 5 AM (12h)' }, { day: 'الاثنين', shift: '7 PM → 5 AM (12h)' }, { day: 'الثلاثاء', shift: '7 PM → 5 AM (12h)' }, { day: 'الأربعاء', shift: '7 PM → 5 AM (12h)' }, { day: 'الخميس', shift: '7 PM → 5 AM (12h)' }, { day: 'الجمعة', shift: '7 PM → 5 AM (12h)' }
  ]},
  { branch: 'الشامي', name: 'محمد حافظ', username: 'محمد.حافظ', level: 'mid', schedule: [
    { day: 'السبت', shift: '9 PM → 4 AM (8h)' }, { day: 'الأحد', shift: '9 PM → 4 AM (8h)' }, { day: 'الاثنين', shift: '9 PM → 4 AM (8h)' }, { day: 'الثلاثاء', shift: '9 PM → 4 AM (8h)' }, { day: 'الأربعاء', shift: '9 PM → 4 AM (8h)' }, { day: 'الخميس', shift: 'إجازة 🟡' }, { day: 'الجمعة', shift: '9 PM → 4 AM (8h)' }
  ]},
  { branch: 'الشامي', name: 'يوسف عصام', username: 'يوسف.عصام', level: 'junior', schedule: [
    { day: 'السبت', shift: '10 PM → 4 AM (8h)' }, { day: 'الأحد', shift: '10 PM → 4 AM (8h)' }, { day: 'الاثنين', shift: '10 PM → 4 AM (8h)' }, { day: 'الثلاثاء', shift: '10 PM → 4 AM (8h)' }, { day: 'الأربعاء', shift: 'إجازة 🟡' }, { day: 'الخميس', shift: '10 PM → 4 AM (8h)' }, { day: 'الجمعة', shift: '10 PM → 4 AM (8h)' }
  ]},
  { branch: 'أبو العزم', name: 'احمد وجيه', username: 'احمد.وجيه', level: 'senior', schedule: [
    { day: 'السبت', shift: '9 AM → 9PM (8h)' }, { day: 'الأحد', shift: '9 AM → 9PM (8h)' }, { day: 'الاثنين', shift: '9 AM → 9PM (8h)' }, { day: 'الثلاثاء', shift: '9 AM → 9PM (8h)' }, { day: 'الأربعاء', shift: '9 AM → 9PM (8h)' }, { day: 'الخميس', shift: '9 AM → 9PM (8h)' }, { day: 'الجمعة', shift: '9 AM → 5 PM (8h)' }
  ]},
  { branch: 'أبو العزم', name: 'حسين', username: 'حسين', level: 'mid', schedule: [
    { day: 'السبت', shift: '1 PM → 9 PM (8h)' }, { day: 'الأحد', shift: '1 PM → 9 PM (8h)' }, { day: 'الاثنين', shift: 'إجازة 🟡' }, { day: 'الثلاثاء', shift: '1 PM → 9 PM (8h)' }, { day: 'الأربعاء', shift: '1 PM → 9 PM (8h)' }, { day: 'الخميس', shift: '1 PM → 9 PM (8h)' }, { day: 'الجمعة', shift: '1 PM → 9 PM (8h)' }
  ]},
  { branch: 'أبو العزم', name: 'محمد سالم', username: 'محمد.سالم', level: 'senior', schedule: [
    { day: 'السبت', shift: '3 PM → 11 PM (8h)' }, { day: 'الأحد', shift: '3 PM → 11 PM (8h)' }, { day: 'الاثنين', shift: '3 PM → 11 PM (8h)' }, { day: 'الثلاثاء', shift: '3 PM → 11 PM (8h)' }, { day: 'الأربعاء', shift: 'إجازة 🟡' }, { day: 'الخميس', shift: '3 PM → 11 PM (8h)' }, { day: 'الجمعة', shift: '3 PM → 11 PM (8h)' }
  ]},
  { branch: 'أبو العزم', name: 'يوسف ماهر', username: 'يوسف.ماهر', level: 'junior', schedule: [
    { day: 'السبت', shift: '5 PM → 1 AM (12h)' }, { day: 'الأحد', shift: 'إجازة 🟡' }, { day: 'الاثنين', shift: '5 PM → 1 AM (12h)' }, { day: 'الثلاثاء', shift: '5 PM → 1 AM (12h)' }, { day: 'الأربعاء', shift: '5 PM → 1 AM (12h)' }, { day: 'الخميس', shift: '5 PM → 1 AM (12h)' }, { day: 'الجمعة', shift: '5 PM → 1 AM (12h)' }
  ]},
  { branch: 'أبو العزم', name: 'يوسف عيد', username: 'يوسف.عيد', level: 'mid', schedule: [
    { day: 'السبت', shift: '8 PM → 4 AM (8h)' }, { day: 'الأحد', shift: '8 PM → 4 AM (8h)' }, { day: 'الاثنين', shift: '8 PM → 4 AM (8h)' }, { day: 'الثلاثاء', shift: '8 PM → 4 AM (8h)' }, { day: 'الأربعاء', shift: '8 PM → 4 AM (8h)' }, { day: 'الخميس', shift: '8 PM → 4 AM (8h)' }, { day: 'الجمعة', shift: '8 PM → 4 AM (8h)' }
  ]},
  { branch: 'أبو العزم', name: 'اسلام', username: 'اسلام', level: 'mid', schedule: [
    { day: 'السبت', shift: '9 PM → 4 AM (8h)' }, { day: 'الأحد', shift: '9 PM → 4 AM (8h)' }, { day: 'الاثنين', shift: '9 PM → 4 AM (8h)' }, { day: 'الثلاثاء', shift: '9 PM → 4 AM (8h)' }, { day: 'الأربعاء', shift: '9 PM → 4 AM (8h)' }, { day: 'الخميس', shift: '9 PM → 4 AM (8h)' }, { day: 'الجمعة', shift: 'إجازة 🟡' }
  ]},
  { branch: 'أبو العزم', name: 'محمد شماتة', username: 'محمد.شماتة', level: 'junior', schedule: [
    { day: 'السبت', shift: '12 PM → 8 AM (8h)' }, { day: 'الأحد', shift: '12 PM → 8 AM (8h)' }, { day: 'الاثنين', shift: '12 PM → 8 AM (8h)' }, { day: 'الثلاثاء', shift: '12 PM → 8 AM (8h)' }, { day: 'الأربعاء', shift: '12 PM → 8 AM (8h)' }, { day: 'الخميس', shift: '12 PM → 8 AM (8h)' }, { day: 'الجمعة', shift: '12 PM → 8 AM (8h)' }
  ]}
]

export function todayArabicName(date = new Date()) {
  const names = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
  return names[date.getDay()]
}

export function getTodayShift(name: string, date = new Date()) {
  const rider = riderSchedule.find((item) => item.name === name || item.username === name)
  const day = todayArabicName(date)
  return rider?.schedule.find((entry) => entry.day === day)?.shift ?? 'غير محدد'
}
