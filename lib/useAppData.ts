"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, clearQueue, clearSession, dropCachedRecord, hasSession, pushQueue, readCache, readQueue, writeCache } from "./api";
import type { ApiError, QueuedWrite, RecordPayload } from "./api";
import { now as nowDate, setServerTime } from "./clock";
import { nowParts, todayKey } from "./time";
import type { Bootstrap, TaskRecord } from "./types";

export type State =
  | { kind: "loading" }
  | { kind: "gate" }
  | { kind: "ready"; data: Bootstrap; offline: boolean; stale: boolean }
  | { kind: "error"; message: string };

function recordKey(day: string, taskId: string) {
  return `${day}|${taskId}`;
}

function offlineCache(day: string, tasks: Bootstrap["tasks"], base: Bootstrap): Bootstrap {
  return { ...base, day, tasks };
}

export function useAppData() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [overlay, setOverlay] = useState<Record<string, TaskRecord>>({});
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const dayRef = useRef<string>("");
  const toastTimer = useRef<number>(0);

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(null);
    // 先清空再上屏，同一条提示连着出现两次也有动画
    window.setTimeout(() => setToast(msg), 16);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  }, []);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      const day = todayKey();
      const cache = readCache();

      // 没有有效口令就一定要先过口令门：缓存只在「本机输过口令」之后才算数
      if (!hasSession("family")) {
        setState({ kind: "gate" });
        return;
      }

      // 先上缓存：断网、弱网、冷启动都能立刻看到内容
      if (cache && day === cache.day) {
        setState((prev) => (prev.kind === "ready" ? prev : { kind: "ready", data: cache, offline: false, stale: true }));
      }

      const res = await api.bootstrap(day);
      if (res.ok) {
        setServerTime(res.data.serverTime);
        writeCache(res.data);
        dayRef.current = res.data.day;
        setState({ kind: "ready", data: res.data, offline: false, stale: false });
        const merged: Record<string, TaskRecord> = {};
        for (const r of res.data.records) merged[recordKey(r.day, r.taskId)] = r;
        setOverlay(merged);
        return;
      }

      const err = res as ApiError;
      if (err.error === "unauthorized") {
        clearSession("family");
        setState({ kind: "gate" });
        return;
      }
      if (err.error === "offline") {
        if (cache) {
          setState({ kind: "ready", data: cache, offline: true, stale: true });
        } else {
          setState({ kind: "error", message: "现在没有网络，也没有本地缓存。请连上网络再打开一次。" });
        }
        return;
      }
      if (cache) {
        setState({ kind: "ready", data: cache, offline: false, stale: true });
        showToast(err.message || "云端暂时连不上，先用本机缓存");
      } else {
        setState({ kind: "error", message: err.message || "加载失败，请稍后再试" });
      }
    },
    [showToast],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // 切天：每分钟查一次，日期变了就重新拉
  useEffect(() => {
    const t = window.setInterval(() => {
      const d = todayKey();
      if (d !== dayRef.current) {
        dayRef.current = d;
        void load({ silent: true });
      }
    }, 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  // 回前台 / 恢复网络时静默刷新
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void load({ silent: true });
    };
    const onOnline = () => void load({ silent: true });
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [load]);

  /* ---------------- 离线队列 ---------------- */

  const flushQueue = useCallback(async () => {
    const queue = readQueue();
    if (queue.length === 0 || !hasSession("family")) return;
    setSyncing(true);
    let failedAt = -1;
    for (let i = 0; i < queue.length; i += 1) {
      const item = queue[i];
      const res = await sendQueued(item);
      if (!res.ok) {
        if (res.error === "locked_day" || res.error === "unknown_task" || res.error === "bad_request") {
          continue; // 这类错误重试也没用，丢弃
        }
        failedAt = i;
        break;
      }
    }
    setSyncing(false);
    if (failedAt === -1) {
      clearQueue();
      void load({ silent: true });
    } else {
      const rest = queue.slice(failedAt);
      window.localStorage.setItem("gmr.queue.v1", JSON.stringify(rest));
    }
  }, [load]);

  useEffect(() => {
    if (state.kind !== "ready") return;
    const q = readQueue();
    if (q.length > 0) void flushQueue();
    const t = window.setInterval(() => {
      if (readQueue().length > 0) void flushQueue();
    }, 45_000);
    return () => window.clearInterval(t);
  }, [state.kind, flushQueue]);

  /* ---------------- 写入 ---------------- */

  const save = useCallback(
    async (payload: RecordPayload) => {
      // 先本地生效：断网时也必须立刻看到勾选结果
      const optimistic: TaskRecord = {
        day: payload.day,
        taskId: payload.taskId,
        status: payload.status,
        items: payload.items,
        vitals: payload.vitals ?? null,
        note: payload.note ?? null,
        source: payload.source ?? "front",
        updatedAt: new Date().toISOString(),
      };
      setOverlay((prev) => ({ ...prev, [recordKey(payload.day, payload.taskId)]: optimistic }));

      const res = await api.saveRecord(payload);
      if (res.ok) {
        setOverlay((prev) => ({ ...prev, [recordKey(payload.day, payload.taskId)]: res.data.record }));
        // 顺手把缓存里的这一条也更新掉，刷新后不至于闪回旧状态
        const cache = readCache();
        if (cache) {
          const others = cache.records.filter(
            (r) => !(r.day === payload.day && r.taskId === payload.taskId),
          );
          writeCache({ ...cache, records: [...others, res.data.record] });
        }
        return { ok: true as const };
      }
      if (res.error === "offline") {
        pushQueue({ kind: "record", payload, at: new Date().toISOString() });
        return { ok: true as const, queued: true as const };
      }
      return { ok: false as const, message: res.message };
    },
    [],
  );

  const clearRecord = useCallback(async (day: string, taskId: string) => {
    const before = overlay[recordKey(day, taskId)];
    setOverlay((prev) => {
      const next = { ...prev };
      delete next[recordKey(day, taskId)];
      return next;
    });
    dropCachedRecord(day, taskId);
    const res = await api.deleteRecord(day, taskId);
    if (!res.ok && res.error !== "offline") {
      // 删失败就把这一条放回去，别让界面骗人
      setOverlay((prev) => (before ? { ...prev, [recordKey(day, taskId)]: before } : prev));
      return { ok: false as const, message: res.message };
    }
    // 删掉的记录如果缓存里还在，历史页会一直看见它
    dropCachedRecord(day, taskId);
    return { ok: true as const };
  }, [overlay]);

  const reload = useCallback(() => load({ silent: true }), [load]);

  const records = useMemo(() => overlay, [overlay]);

  return { state, records, save, clearRecord, reload, toast, showToast, syncing, flushQueue };
}

async function sendQueued(item: QueuedWrite): Promise<{ ok: true } | ApiError> {
  if (item.kind === "record") {
    const res = await api.saveRecord(item.payload);
    return res.ok ? { ok: true } : res;
  }
  if (item.kind === "task") {
    const res = await api.saveTasks(item.payload, item.at.slice(0, 10));
    return res.ok ? { ok: true } : res;
  }
  if (item.kind === "settings") {
    const res = await api.saveSettings(item.payload, todayKey());
    return res.ok ? { ok: true } : res;
  }
  const res = await api.saveAnnouncement(item.payload);
  return res.ok ? { ok: true } : res;
}

/**
 * 每秒走一次的时钟。用 now() 而不是 new Date()：
 * 拿过服务端时间之后，本机时间不准也不会把倒计时带偏。
 */
export function useNow(intervalMs = 1000) {
  const [tick, setTick] = useState(() => nowParts(nowDate()));
  useEffect(() => {
    const t = window.setInterval(() => setTick(nowParts(nowDate())), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return tick;
}
