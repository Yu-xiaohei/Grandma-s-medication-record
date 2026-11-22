import type { NowParts } from "./time";
import { minutesOfDay, nowMinutes, secondsUntil } from "./time";
import type { Task, TaskRecord } from "./types";

export type Phase = "done" | "missed" | "upcoming" | "due" | "overdue";

/** 到达时间前 5 分钟及更早，点“已完成”要二次确认 */
export const EARLY_CONFIRM_SEC = 5 * 60;
/** 超过时间 5 分钟后，才允许点“未完成” */
export const MISSED_UNLOCK_SEC = 5 * 60;

/**
 * 「一直没点完成，就自动让位给下一项」的阈值。
 * 0.7 = 距离下一项只剩 70% 的间隔时间（也就是这一项已经过去 30% 的间隔）
 * 还没打卡，就当它没做，主卡直接显示下一项。
 * 想改成「只剩 30% 才跳过」，把这个数改成 0.3 即可。
 */
export const AUTO_MISS_REMAIN_PCT = 70;

/**
 * task 后面紧接着是 next。
 * 距离下一项只剩 remainPct%（默认 70%）的间隔还没打卡，就算这一项没做。
 * 至少也要过 5 分钟，不然跟「未完成」按钮的解锁时间打架。
 */
export function autoMissedAt(
  task: Task,
  next: Task | null,
  p: NowParts,
  remainPct: number = AUTO_MISS_REMAIN_PCT,
): boolean {
  if (!next) return false;
  const start = minutesOfDay(task.time);
  const end = minutesOfDay(next.time);
  if (end <= start) return false;
  const gap = end - start;
  const pct = Math.min(95, Math.max(30, Number(remainPct) || AUTO_MISS_REMAIN_PCT));
  const elapsedNeeded = Math.max(MISSED_UNLOCK_SEC / 60, gap * (1 - pct / 100));
  return nowMinutes(p) >= start + elapsedNeeded;
}

export function phaseOf(task: Task, record: TaskRecord | undefined, p: NowParts): Phase {
  if (record?.status === "done") return "done";
  if (record?.status === "missed") return "missed";
  const sec = secondsUntil(task.time, p);
  if (sec > 0) return "upcoming";
  if (sec > -MISSED_UNLOCK_SEC) return "due";
  return "overdue";
}

/** 点“已完成”时是否需要二次提醒 */
export function needsEarlyConfirm(sec: number): boolean {
  return sec > EARLY_CONFIRM_SEC;
}

/** “未完成”按钮是否可用 */
export function canMarkMissed(sec: number): boolean {
  return sec <= -MISSED_UNLOCK_SEC;
}

export type Settled = { done: number; skipped: number; none: number; total: number };

export function tally(
  task: Task,
  items: Record<string, "done" | "skipped" | "none"> | undefined,
): Settled {
  let done = 0;
  let skipped = 0;
  let none = 0;
  for (const item of task.items) {
    const st = items?.[item.id] ?? "none";
    if (st === "done") done += 1;
    else if (st === "skipped") skipped += 1;
    else none += 1;
  }
  return { done, skipped, none, total: task.items.length };
}

/** 全部勾完（含暂缓）才允许硬确认 */
export function canConfirm(task: Task, items: Record<string, "done" | "skipped" | "none"> | undefined) {
  return tally(task, items).none === 0;
}

export function emptyItems(): Record<string, "done" | "skipped" | "none"> {
  return {};
}

export function allItems(task: Task): Record<string, "done" | "skipped" | "none"> {
  const out: Record<string, "done" | "skipped" | "none"> = {};
  for (const item of task.items) out[item.id] = "done";
  return out;
}