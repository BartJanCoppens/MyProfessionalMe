// A one-event calendar file for a webinar, read from the text of its date ("Fri 4 Dec 2026 · 12:30–13:30 CET · online").
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const TIME = /(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4}) · (\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/;
const two = (n: number | string) => String(n).padStart(2, '0');
const escape = (t: string) => t.replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n');

// null when the date cannot be read, so the app offers no calendar file instead of a wrong one.
export function webinarIcs(title: string, when: string, stamp = new Date()): string | null {
  const m = when.match(TIME), month = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
  if (!m || month < 0) return null;
  const day = `${m[3]}${two(month + 1)}${two(m[1])}`;
  const utc = stamp.toISOString().replace(/[-:]|\.\d{3}/g, '');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MyProfessionalMe//Learning//EN', 'BEGIN:VEVENT',
    `UID:${day}-${two(m[4])}${m[5]}@myprofessionalme`, `DTSTAMP:${utc}`,
    `DTSTART;TZID=Europe/Brussels:${day}T${two(m[4])}${m[5]}00`, `DTEND;TZID=Europe/Brussels:${day}T${two(m[6])}${m[7]}00`,
    `SUMMARY:${escape(title)}`, `DESCRIPTION:${escape(when)}`, 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}
