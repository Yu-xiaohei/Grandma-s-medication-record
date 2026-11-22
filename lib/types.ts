export type ItemKind = "food" | "med" | "water";

export type TaskItem = {
  id: string;
  kind: ItemKind;
  label: string;
  tag?: string | null;
};

export type Task = {
  id: string;
  time: string;
  title: string;
  period: "morning" | "noon" | "afternoon" | "evening";
  note?: string | null;
  items: TaskItem[];
};

export type ItemState = "done" | "skipped" | "none";

export type TaskRecord = {
  day: string;
  taskId: string;
  status: "done" | "missed";
  items: Record<string, ItemState>;
  vitals?: { hr?: number | null; sbp?: number | null; dbp?: number | null } | null;
  note?: string | null;
  source: "front" | "admin";
  updatedAt: string;
};

export type Settings = {
  dayStart: string;
  vitalsEnabled: boolean;
  pinEnabled: boolean;
  announcementEnabled: boolean;
  /** 距离下一项只剩这个百分比（默认 70%）还没打卡，就自动记为未完成 */
  autoSkipRemainPct: number;
};

export type Announcement = {
  id: number;
  title: string;
  body: string;
  activeFrom: string | null;
  activeTo: string | null;
  createdAt: string;
};

export type Bootstrap = {
  serverTime: string;
  day: string;
  tasks: Task[];
  settings: Settings;
  records: TaskRecord[];
  announcements: Announcement[];
  canEditToday: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  dayStart: "00:00",
  vitalsEnabled: false,
  pinEnabled: true,
  announcementEnabled: true,
  autoSkipRemainPct: 70,
};