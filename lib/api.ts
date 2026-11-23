"use client";

import type { Announcement, Bootstrap, Settings, Task, TaskRecord } from "./types";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");

/** 前台与后台各存各的 token：后台退出/过期绝不能把前台的登录态一起清掉 */
const TOKEN_KEYS: Record<Role, string> = {
  family: "gmr.token.family.v1",
  admin: "gmr.token.admin.v1",
};
const LEGACY_TOKEN_KEY = "gmr.token.v1";
const LEGACY_ROLE_KEY = "gmr.role.v1";
const CACHE_KEY = "gmr.cache.v1";
const QUEUE_KEY = "gmr.queue.v1";

export type Role = "family" | "admin";

/* ---------- 网络活动计数：给顶部的细进度条用 ---------- */
let activeRequests = 0;
const activityListeners = new Set<(n: number) => void>();

export function subscribeActivity(fn: (n: number) => void) {
  activityListeners.add(fn);
  fn(activeRequests);
  return () => {
    activityListeners.delete(fn);
  };
}

function beginActivity() {
  activeRequests += 1;
  activityListeners.forEach((f) => f(activeRequests));
}

function endActivity() {
  activeRequests = Math.max(0, activeRequests - 1);
  activityListeners.forEach((f) => f(activeRequests));
}

export type ApiError = { ok: false; error: string; message: string; lockedUntil?: string };

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 配额满时忽略，不影响主流程 */
  }
}

/** 旧版把前后台 token 存在同一个键里，首次读取时就地迁移 */
function migrateLegacy(role: Role): string | null {
  if (typeof window === "undefined") return null;
  const legacyRole = readJson<Role | null>(LEGACY_ROLE_KEY, null);
  const legacyToken = readJson<string | null>(LEGACY_TOKEN_KEY, null);
  if (!legacyToken || legacyRole !== role) return null;
  writeJson(TOKEN_KEYS[role], legacyToken);
  window.localStorage.removeItem(LEGACY_TOKEN_KEY);
  window.localStorage.removeItem(LEGACY_ROLE_KEY);
  return legacyToken;
}

export function getToken(role: Role = "family"): string | null {
  return readJson<string | null>(TOKEN_KEYS[role], null) ?? migrateLegacy(role);
}
/** token 里的到期时间；格式是 v1.<role>.<exp>.<sig> */
function tokenExpiresAt(token: string): number | null {
  const parts = token.split(".");
  if (parts.length < 4) return null;
  const exp = Number(parts[2]);
  return Number.isFinite(exp) ? exp * 1000 : null;
}
/** 离线时也要判断：过期了就当没有，不能让旧 token 一直开着口令门 */
export function hasSession(role: Role): boolean {
  const token = getToken(role);
  if (!token) return false;
  const expiresAt = tokenExpiresAt(token);
  if (expiresAt !== null && expiresAt <= Date.now()) {
    clearSession(role);
    return false;
  }
  return true;
}
export function setSession(token: string, role: Role) {
  writeJson(TOKEN_KEYS[role], token);
}
export function clearSession(role: Role) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEYS[role]);
  // 清掉同角色的旧键，避免迁移逻辑把刚退出的 token 又搬回来
  if (readJson<Role | null>(LEGACY_ROLE_KEY, null) === role) {
    window.localStorage.removeItem(LEGACY_TOKEN_KEY);
    window.localStorage.removeItem(LEGACY_ROLE_KEY);
  }
}

export function readCache(): Bootstrap | null {
  return readJson<Bootstrap | null>(CACHE_KEY, null);
}
export function writeCache(data: Bootstrap) {
  writeJson(CACHE_KEY, data);
}
/** 记录在云端被删掉时，本机缓存也要一起清掉，别刷新后又冒出来 */
export function dropCachedRecord(day: string, taskId: string) {
  const cache = readCache();
  if (!cache) return;
  writeCache({
    ...cache,
    records: cache.records.filter((r) => !(r.day === day && r.taskId === taskId)),
  });
}

export type QueuedWrite =
  | { kind: "record"; payload: RecordPayload; at: string }
  | { kind: "task"; payload: Task[]; at: string }
  | { kind: "settings"; payload: Settings; at: string }
  | { kind: "announcement"; payload: Omit<Announcement, "id" | "createdAt">; at: string };

export function readQueue(): QueuedWrite[] {
  return readJson<QueuedWrite[]>(QUEUE_KEY, []);
}
export function pushQueue(item: QueuedWrite) {
  const q = readQueue();
  q.push(item);
  writeJson(QUEUE_KEY, q);
}
export function clearQueue() {
  writeJson(QUEUE_KEY, []);
}

export type RecordPayload = {
  day: string;
  taskId: string;
  status: "done" | "missed";
  items: Record<string, "done" | "skipped" | "none">;
  vitals?: { hr?: number | null; sbp?: number | null; dbp?: number | null } | null;
  note?: string | null;
  source?: "front" | "admin";
};

async function request<T>(
  path: string,
  init: RequestInit = {},
  role: Role = "family",
): Promise<{ ok: true; data: T } | ApiError> {
  // 没配后端地址时给一句人话，别让老人对着「网络请求失败」发愁
  if (!API_BASE) {
    return { ok: false, error: "unconfigured", message: "网站还没连上后台，请让家里人配置一次" };
  }
  const token = getToken(role);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers.authorization = `Bearer ${token}`;
  beginActivity();
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
    // 管理员 12 小时滑动续期：后端把新 token 放在响应头里
    const renewed = res.headers.get("x-renew-token");
    if (renewed && role === "admin") setSession(renewed, "admin");

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && path !== "/api/auth/pin" && path !== "/api/auth/admin") {
        clearSession(role);
      }
      return {
        ok: false,
        error: data.error || `http_${res.status}`,
        message: data.message || "网络请求失败",
        lockedUntil: data.lockedUntil,
      };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "offline", message: "当前没有网络" };
  } finally {
    endActivity();
  }
}

export const api = {
  async pin(pin: string) {
    return request<{ token: string; role: Role; expiresAt: string }>("/api/auth/pin", {
      method: "POST",
      body: JSON.stringify({ pin }),
    });
  },

  async admin(username: string, password: string) {
    return request<{ token: string; role: Role; expiresAt: string }>("/api/auth/admin", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  async bootstrap(day: string, role: Role = "family") {
    return request<Bootstrap>(`/api/bootstrap?day=${encodeURIComponent(day)}`, {}, role);
  },

  async saveRecord(payload: RecordPayload, role: Role = "family") {
    return request<{ record: TaskRecord }>(
      "/api/records",
      { method: "PUT", body: JSON.stringify(payload) },
      role,
    );
  },

  async deleteRecord(day: string, taskId: string, role: Role = "family") {
    return request<{ ok: true }>(
      `/api/records?day=${encodeURIComponent(day)}&taskId=${encodeURIComponent(taskId)}`,
      { method: "DELETE" },
      role,
    );
  },

  async saveTasks(tasks: Task[], effectiveFrom: string) {
    return request<{ tasks: Task[] }>(
      "/api/tasks",
      { method: "PUT", body: JSON.stringify({ effectiveFrom, tasks }) },
      "admin",
    );
  },

  async saveSettings(settings: Settings, day: string) {
    return request<{ settings: Settings }>(
      "/api/settings",
      { method: "PUT", body: JSON.stringify({ ...settings, day }) },
      "admin",
    );
  },

  async saveAnnouncement(payload: Omit<Announcement, "id" | "createdAt">) {
    return request<{ announcement: Announcement }>(
      "/api/announcements",
      { method: "POST", body: JSON.stringify(payload) },
      "admin",
    );
  },

  async archiveAnnouncement(id: number) {
    return request<{ ok: true }>(`/api/announcements/${id}`, { method: "DELETE" }, "admin");
  },

  async setPin(pin: string) {
    return request<{ ok: true }>("/api/admin/pin", { method: "POST", body: JSON.stringify({ pin }) }, "admin");
  },

  async changePassword(password: string) {
    return request<{ ok: true }>(
      "/api/admin/password",
      { method: "POST", body: JSON.stringify({ password }) },
      "admin",
    );
  },

  async history(from: string, to: string) {
    return request<{ days: string[]; records: TaskRecord[]; tasksByDay: Record<string, Task[]> }>(
      `/api/history?from=${from}&to=${to}`,
      {},
      "admin",
    );
  },
};

export const isConfigured = API_BASE.length > 0;

