// Username generation utility for rider names
// Maps Arabic names to English usernames

interface NameMapping {
  [key: string]: string
}

const arabicToEnglishMap: NameMapping = {
  'أحمد': 'AHMED',
  'محمد': 'MOHAMED',
  'محمود': 'MAHMOUD',
  'إسلام': 'ESLAM',
  'يوسف': 'YOUSSEF',
  'مدحت': 'MEDHAT',
  'حسين': 'HUSSEIN',
  'مصطفى': 'MOSTAFA',
  'عبدالله': 'ABDULLAH',
  'عبدالرحمن': 'ABDULRAHMAN',
  'عمر': 'OMAR',
  'علي': 'ALI',
  'حسن': 'HASSAN',
  'خالد': 'KHALED',
  'سعيد': 'SAID',
  'طارق': 'TAREK',
  'كريم': 'KARIM',
  'أمير': 'AMIR',
  'فيصل': 'FAISAL',
  'ناصر': 'NASSER',
  'سامي': 'SAMI',
  'رامي': 'RAMI',
  'باسل': 'BASSEL',
  'عاصم': 'ASEM',
  'ماهر': 'MAHER',
  'عصام': 'ESSAM',
  'وجيه': 'WAGIH',
  'البطل': 'ELBATAL',
  'حافظ': 'HAFEZ',
  'شماتة': 'SHEMATA',
  'عيد': 'EID',
  'سالم': 'SALEM',
  'الشامي': 'ELSHAMY',
  'أبو العزم': 'ABOELAZM',
  'شكري': 'SHOKRY',
  'السيد': 'ELSAYED',
  'عبدالمنعم': 'ABDULMONEIM',
  'عبدالحميد': 'ABDULHAMID',
  'عبدالكريم': 'ABDULKARIM',
  'عبدالجواد': 'ABDULJAWAD',
  'عبدالفتاح': 'ABDULFATTAH',
  'عبدالمجيد': 'ABDULMAJID',
  'عبدالرؤوف': 'ABDULRAOUF',
  'عبدالسلام': 'ABDULSALAM',
  'عبدالعزيز': 'ABDULAZIZ',
  'عبداللطيف': 'ABDULLATIF',
  'عبدالمعطي': 'ABDULMUTI',
  'عبدالناصر': 'ABDULNASSER',
  'عبدالوهاب': 'ABDULWAHAB',
  'عبدالقادر': 'ABDULQADER',
  'عبدالرحيم': 'ABDULRAHIM',
  'عبدالستار': 'ABDULSATTAR',
  'عبدالباسط': 'ABDULBASIT',
  'عبدالمعين': 'ABDULMUIN',
  'عبدالموجود': 'ABDULMOJUD',
  'عبدالقاهر': 'ABDULQAHER',
  'عبدالصبور': 'ABDULSABUR',
  'عبدالغفور': 'ABDULGHAFUR',
  'عبدالغني': 'ABDULGHANI',
  'عبدالرزاق': 'ABDULRAZZAQ',
  'عبدالجبار': 'ABDULJABBAR',
  'عبدالملك': 'ABDULMALIK',
  'عبدالمتين': 'ABDULMATIN',
  'عبدالحليم': 'ABDULHALIM',
  'عبدالحفيظ': 'ABDULHAFIZ',
  'عبدالرشيد': 'ABDULRASHID',
  'عبدالصمد': 'ABDULSAMAD',
  'عبدالعليم': 'ABDULALIM',
  'عبدالباقي': 'ABDULBAQI',
  'عبدالحي': 'ABDULHAYY',
  'عبدالواحد': 'ABDULWAHID',
  'عبدالقوي': 'ABDULQAWI',
  'عبدالمتولي': 'ABDULMUTAWALLI',
  'عبدالباري': 'ABDULBARI',
  'عبدالكبير': 'ABDULKABIR',
  'عبدالمقيت': 'ABDULMUQIT',
  'عبدالحسيب': 'ABDULHASIB',
  'عبدالجليل': 'ABDULJALIL',
  'عبدالذو': 'ABDULDHU',
  'عبدالمطاع': 'ABDULMUTA',
  'عبدالسميع': 'ABDULSAMEE',
  'عبدالبصير': 'ABDULBASEER',
  'عبدالحكيم': 'ABDULHAKIM',
  'عبدالخبير': 'ABDULKHAIR',
  'عبدالعظيم': 'ABDULAZIM',
  'عبدالتواب': 'ABDULTAWAB',
  'عبدالقدوس': 'ABDULQUDDUS',
  'عبدالمؤمن': 'ABDULMUMIN',
  'عبدالمهيمن': 'ABDULMUHAYMIN',
  'عبدالمتكبر': 'ABDULMUTAKABBIR',
  'عبدالخالق': 'ABDULKHALEQ',
  'عبدالمصور': 'ABDULMUSAWWIR',
  'عبدالقهار': 'ABDULQAHHAR',
  'عبدالمعز': 'ABDULMUZZ',
}

// Common Arabic particles/prefixes to remove
const arabicPrefixes = [
  'أبو', 'أبو', 'ابو',
  'عبد', 'عبد',
  'ال', 'ال',
  'بن', 'بن',
  'ابن', 'ابن',
]

// Common Arabic suffixes to remove
const arabicSuffixes = [
  'الدين', 'الدين',
  'الإسلام', 'الإسلام',
  'الحق', 'الحق',
]

/**
 * Convert Arabic name to English username
 * @param arabicName - The Arabic name to convert
 * @param existingUsernames - List of existing usernames to avoid duplicates
 * @returns Generated English username
 */
export function generateUsername(
  arabicName: string,
  existingUsernames: string[] = []
): string {
  // Remove extra spaces
  const cleanName = arabicName.trim().replace(/\s+/g, ' ')
  
  // Split into parts
  const parts = cleanName.split(' ')
  
  // Map each part to English
  const englishParts = parts.map(part => {
    // Remove common prefixes
    let cleanedPart = part
    arabicPrefixes.forEach(prefix => {
      if (cleanedPart.startsWith(prefix)) {
        cleanedPart = cleanedPart.substring(prefix.length)
      }
    })
    
    // Remove common suffixes
    arabicSuffixes.forEach(suffix => {
      if (cleanedPart.endsWith(suffix)) {
        cleanedPart = cleanedPart.substring(0, cleanedPart.length - suffix.length)
      }
    })
    
    // Look up in mapping
    return arabicToEnglishMap[cleanedPart] || cleanedPart.toUpperCase()
  })
  
  // Join with dots
  let username = englishParts.join('.')
  
  // Remove any remaining non-alphanumeric characters (except dots)
  username = username.replace(/[^A-Z0-9.]/g, '')
  
  // Ensure it's not empty
  if (!username) {
    username = 'RIDER'
  }
  
  // Handle duplicates
  let finalUsername = username
  let counter = 1
  while (existingUsernames.includes(finalUsername)) {
    finalUsername = `${username}${counter}`
    counter++
  }
  
  return finalUsername
}

/**
 * Parse a schedule time string like "9 AM - 5 PM" or "9:00 - 17:00"
 * @param timeString - The time string to parse
 * @returns Object with start and end time in HH:MM format
 */
export function parseScheduleTime(timeString: string): {
  start: string
  end: string
  crossesMidnight: boolean
  hours: number
} | null {
  if (!timeString || timeString.trim() === '' || timeString.toLowerCase() === 'إجازة') {
    return null
  }
  
  // Handle formats like "9 AM - 5 PM" or "9:00 AM - 5:00 PM"
  const timeMatch = timeString.match(/(\d{1,2}(?::\d{2})?)\s*(?:AM|PM)?\s*[-–to]\s*(\d{1,2}(?::\d{2})?)\s*(?:AM|PM)?/i)
  
  if (!timeMatch) {
    return null
  }
  
  let startTime = timeMatch[1]
  let endTime = timeMatch[2]
  
  // Convert to 24-hour format
  const to24Hour = (time: string, isPM: boolean): string => {
    let [hours, minutes] = time.split(':').map(Number)
    if (isNaN(minutes)) minutes = 0
    
    if (isPM && hours !== 12) {
      hours += 12
    } else if (!isPM && hours === 12) {
      hours = 0
    }
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  }
  
  // Check if times have AM/PM indicators
  const hasAMPM = /AM|PM/i.test(timeString)
  
  if (hasAMPM) {
    const parts = timeString.split(/[-–to]/i)
    const startPart = parts[0].trim()
    const endPart = parts[1].trim()
    
    const startIsPM = /PM/i.test(startPart)
    const endIsPM = /PM/i.test(endPart)
    
    startTime = to24Hour(startTime, startIsPM)
    endTime = to24Hour(endTime, endIsPM)
  } else {
    // Assume 24-hour format or convert simple times
    if (!startTime.includes(':')) startTime = `${startTime}:00`
    if (!endTime.includes(':')) endTime = `${endTime}:00`
  }
  
  // Calculate hours
  const [startHours, startMinutes] = startTime.split(':').map(Number)
  const [endHours, endMinutes] = endTime.split(':').map(Number)
  
  let startTotalMinutes = startHours * 60 + startMinutes
  let endTotalMinutes = endHours * 60 + endMinutes
  
  // Check if crosses midnight
  let crossesMidnight = false
  if (endTotalMinutes < startTotalMinutes) {
    crossesMidnight = true
    endTotalMinutes += 24 * 60 // Add 24 hours
  }
  
  const hours = (endTotalMinutes - startTotalMinutes) / 60
  
  return {
    start: startTime,
    end: endTime,
    crossesMidnight,
    hours: Math.round(hours * 100) / 100
  }
}

/**
 * Parse day name to day of week (0-6, 0 = Sunday)
 * @param dayName - Arabic day name
 * @returns Day of week number
 */
export function parseDayOfWeek(dayName: string): number {
  const dayMap: { [key: string]: number } = {
    'الأحد': 0,
    'الاحد': 0,
    'أحد': 0,
    'الإثنين': 1,
    'الاثنين': 1,
    'الثلاثاء': 2,
    'الأربعاء': 3,
    'الاربعاء': 3,
    'الخميس': 4,
    'الجمعة': 5,
    'السبت': 6,
  }
  
  return dayMap[dayName.trim()] || 0
}

/**
 * Get Arabic day name from day of week
 * @param dayOfWeek - Day of week number (0-6)
 * @returns Arabic day name
 */
export function getArabicDayName(dayOfWeek: number): string {
  const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
  return days[dayOfWeek] || 'غير محدد'
}
