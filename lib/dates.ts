export function getTodayInTimezone(timeZone: string, date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

export function daysBetween(earlierIsoDate: string, laterIsoDate: string): number {
  const earlier = new Date(`${earlierIsoDate}T00:00:00Z`);
  const later = new Date(`${laterIsoDate}T00:00:00Z`);
  return Math.round((later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24));
}
