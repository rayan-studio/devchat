const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const fullFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short" });

export const formatTime = (iso: string) => timeFmt.format(new Date(iso));
export const formatFull = (iso: string) => fullFmt.format(new Date(iso));

export function formatDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === yesterday.toDateString()) return "Hier";
  const s = dayFmt.format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();
