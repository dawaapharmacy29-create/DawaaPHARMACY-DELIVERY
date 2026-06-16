export function parseScheduleTime(shift: string): { start: string; end: string; hours: number; crossesMidnight: boolean } | null {
  if (!shift) return null

  // Parse formats like "9 AM - 5 PM", "09:00 - 17:00", etc.
  const match = shift.match(/(\d{1,2}(?::\d{2})?)\s*(?:AM|PM)?\s*-\s*(\d{1,2}(?::\d{2})?)\s*(?:AM|PM)?/i)
  if (!match) return null

  let startTime = match[1]
  let endTime = match[2]

  // Convert to 24-hour format
  const start24 = convertTo24Hour(startTime)
  const end24 = convertTo24Hour(endTime)

  // Calculate hours
  const startParts = start24.split(':').map(Number)
  const endParts = end24.split(':').map(Number)
  let hours = endParts[0] + endParts[1] / 60 - (startParts[0] + startParts[1] / 60)
  const crossesMidnight = hours < 0
  if (crossesMidnight) hours += 24

  return {
    start: start24,
    end: end24,
    hours: Math.round(hours * 100) / 100,
    crossesMidnight
  }
}

function convertTo24Hour(time: string): string {
  const match = time.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i)
  if (!match) return time

  let hours = parseInt(match[1])
  const minutes = match[2] ? parseInt(match[2]) : 0
  const meridiem = match[3]?.toUpperCase()

  if (meridiem === 'PM' && hours !== 12) hours += 12
  if (meridiem === 'AM' && hours === 12) hours = 0

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

export function parseDayOfWeek(dayName: string): number {
  const dayMap: Record<string, number> = {
    'الأحد': 0,
    'الاثنين': 1,
    'الثلاثاء': 2,
    'الأربعاء': 3,
    'الخميس': 4,
    'الجمعة': 5,
    'السبت': 6,
    'Sunday': 0,
    'Monday': 1,
    'Tuesday': 2,
    'Wednesday': 3,
    'Thursday': 4,
    'Friday': 5,
    'Saturday': 6
  }
  return dayMap[dayName] ?? 0
}
