"use client";

import type { Announcement, Bootstrap, Settings, Task, TaskRecord } from "./types";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");

const TOKEN_KEY = "gmr.token.v1";
const ROLE_KEY = "gmr.role.v1";
const CACHE_KEY = "gmr.cache.v1";
const QUEUE_KEY = "gmr.queue.v1";

export type Role = "family" | "admin";

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

export function getToken(): string | null {
  return readJson<string | null>(TOKEN_KEY, null);
}
export function getRole(): Role | null {
  return readJson<Role | null>(ROLE_KEY, null);
}
export function setSession(token: string, role: Role) {
  writeJson(TOKEN_KEY, token);
  writeJson(ROLE_KEY, role);
}
export function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(ROLE_KEY);
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
): Promise<{ ok: true; data: T } | ApiError> {
  // 没配后端地址时给一句人话，别让老人对着「网络请求失败」发愁
  if (!API_BASE) {
    return { ok: false, error: "unconfigured", message: "网站还没连上后台，请让家里人配置一次" };
  }
  const token = getToken();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers.authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
    // 管理员 12 小时滑动续期：后端把新 token 放在响应头里
    const renewed = res.headers.get("x-renew-token");
    if (renewed) setSession(renewed, "admin");

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && path !== "/api/auth/pin" && path !== "/api/auth/admin") {
        clearSession();
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

  async bootstrap(day: string) {
    return request<Bootstrap>(`/api/bootstrap?day=${encodeURIComponent(day)}`);
  },

  async saveRecord(payload: RecordPayload) {
    return request<{ record: TaskRecord }>("/api/records", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  async deleteRecord(day: string, taskId: string) {
    return request<{ ok: true }>(
      `/api/records?day=${encodeURIComponent(day)}&taskId=${encodeURIComponent(taskId)}`,
      { method: "DELETE" },
    );
  },

  async saveTasks(tasks: Task[], effectiveFrom: string) {
    return request<{ tasks: Task[] }>("/api/tasks", {
      method: "PUT",
      body: JSON.stringify({ effectiveFrom, tasks }),
    });
  },

  async saveSettings(settings: Settings, day: string) {
    return request<{ settings: Settings }>("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ ...settings, day }),
    });
  },

  async saveAnnouncement(payload: Omit<Announcement, "id" | "createdAt">) {
    return request<{ announcement: Announcement }>("/api/announcements", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async archiveAnnouncement(id: number) {
    return request<{ ok: true }>(`/api/announcements/${id}`, { method: "DELETE" });
  },

  async setPin(pin: string) {
    return request<{ ok: true }>("/api/admin/pin", {
      method: "POST",
      body: JSON.stringify({ pin }),
    });
  },

  async changePassword(password: string) {
    return request<{ ok: true }>("/api/admin/password", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
  },

  async history(from: string, to: string) {
    return request<{ days: string[]; records: TaskRecord[]; tasksByDay: Record<string, Task[]> }>(
      `/api/history?from=${from}&to=${to}`,
    );
  },
};

export const isConfigured = API_BASE.length > 0;