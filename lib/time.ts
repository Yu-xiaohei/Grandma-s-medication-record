const TZ = "Asia/Shanghai";

const dtf = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export type NowParts = {
  dateKey: string;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
};

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function nowParts(d: Date = new Date()): NowParts {
  const parts = dtf.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    hour,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAYS[d.getDay()],
  };
}

export function todayKey(d: Date = new Date()): string {
  return nowParts(d).dateKey;
}

export function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function nowMinutes(p: NowParts): number {
  return p.hour * 60 + p.minute + p.second / 60;
}

/** 秒为单位的差值：计划时间 - 现在 */
export function secondsUntil(hhmm: string, p: NowParts): number {
  return Math.round((minutesOfDay(hhmm) - nowMinutes(p)) * 60);
}

export function formatCountdown(sec: number): string {
  const abs = Math.max(0, Math.abs(sec));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  if (h > 0) return `${h} 小时 ${m} 分`;
  if (m > 0) return `${m} 分 ${String(s).padStart(2, "0")} 秒`;
  return `${s} 秒`;
}

export function clockText(p: NowParts): string {
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}:${String(
    p.second,
  ).padStart(2, "0")}`;
}

export function dayLabel(dateKey: string): string {
  const [, m, d] = dateKey.split("-").map(Number);
  return `${m} 月 ${d} 日`;
}

export function addDays(dateKey: string, delta: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + delta * 86400000;
  const nd = new Date(t);
  return `${nd.getUTCFullYear()}-${String(nd.getUTCMonth() + 1).padStart(2, "0")}-${String(
    nd.getUTCDate(),
  ).padStart(2, "0")}`;
}

export function isPastDay(dateKey: string, today: string): boolean {
  return dateKey < today;
}