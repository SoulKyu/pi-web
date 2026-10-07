function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isNewDay(prev: number | undefined, next: number | undefined, locale: string): string | null {
  if (next === undefined) return null;
  const day = new Date(next);
  if (prev !== undefined && sameLocalDay(new Date(prev), day)) return null;
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(day.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  }).format(day);
}
