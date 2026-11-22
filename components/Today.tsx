"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, clearSession } from "@/lib/api";
import type { RecordPayload } from "@/lib/api";
import { SAFETY_RULES } from "@/lib/schedule";
import { AUTO_MISS_NOTE, autoMissedAt, phaseOf, tally } from "@/lib/rules";
import { dayLabel, formatCountdown, secondsUntil } from "@/lib/time";
import { useAppData, useNow } from "@/lib/useAppData";
import type { ItemState, Task, TaskRecord } from "@/lib/types";
import { Banner } from "./Banner";
import { Gate } from "./Gate";
import { IconAlert, IconByName, IconChevron, IconClock, IconLock } from "./Icons";
import { TaskSheet } from "./TaskSheet";

const DISMISS_KEY = "gmr.dismissedAnn.v1";

/** 自动跳过时给界面用的临时记录（还没写进云端时也要按「未完成」显示） */
function autoRecord(day: string, task: Task): TaskRecord {
  return {
    day,
    taskId: task.id,
    status: "missed",
    items: {},
    vitals: null,
    note: AUTO_MISS_NOTE,
    source: "front",
    updatedAt: new Date().toISOString(),
  };
}

export function Today() {
  const { state, records, save, clearRecord, reload, toast, showToast } = useAppData();
  const now = useNow();
  const [openId, setOpenId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<number[]>([]);

  useEffect(() => {
    try {
      setDismissed(JSON.parse(window.localStorage.getItem(DISMISS_KEY) || "[]"));
    } catch {
      setDismissed([]);
    }
  }, []);

  const data = state.kind === "ready" ? state.data : null;

  const ordered = useMemo(() => (data ? [...data.tasks].sort((a, b) => a.time.localeCompare(b.time)) : []), [data]);

  /**
   * 一直没打卡就自动让位：过了下一项前面 70% 的间隔还没点完成，
   * 这一项就按「未完成」算，主卡和列表都直接往后走。
   */
  const effective = useMemo(() => {
    if (!data) return records;
    const out = { ...records };
    for (let i = 0; i < ordered.length; i += 1) {
      const task = ordered[i];
      const key = `${data.day}|${task.id}`;
      if (out[key]) continue;
      if (autoMissedAt(task, ordered[i + 1] ?? null, now, data.settings.autoSkipRemainPct)) {
        out[key] = autoRecord(data.day, task);
      }
    }
    return out;
  }, [records, ordered, data, now]);

  /** 需要自动补记「未完成」的项（只在今天可写；历史天只显示不落库） */
  const autoMissedIds = useMemo(() => {
    if (!data?.canEditToday) return "";
    const ids: string[] = [];
    for (const task of ordered) {
      const key = `${data.day}|${task.id}`;
      // 正打开这一项在勾选时先不跳过，别把人家填到一半的打断了
      if (task.id === openId) continue;
      if (!records[key] && effective[key]?.status === "missed") ids.push(task.id);
    }
    return ids.join(",");
  }, [ordered, effective, records, data, openId]);

  const savingAuto = useRef<Set<string>>(new Set());

  // 自动记为未完成也要落库，后台才能看见这一项被跳过了
  useEffect(() => {
    if (!data || !autoMissedIds) return;
    for (const id of autoMissedIds.split(",")) {
      const task = ordered.find((t) => t.id === id);
      if (!task) continue;
      const key = `${data.day}|${id}`;
      if (savingAuto.current.has(key)) continue;
      savingAuto.current.add(key);
      void save({
        day: data.day,
        taskId: id,
        status: "missed",
        items: {},
        note: AUTO_MISS_NOTE,
      }).then((res) => {
        if (!res.ok) savingAuto.current.delete(key);
      });
    }
  }, [autoMissedIds, data, ordered, save]);

  /** 主卡：优先显示「现在该做 / 快要做」的，全部做完则显示最后一项 */
  const focus = useMemo(() => {
    if (ordered.length === 0) return null;
    const pending = ordered.filter((t) => {
      // 正在打卡的这一项仍然留在主卡上，勾完再往后走
      if (t.id === openId) return true;
      const r = effective[`${data!.day}|${t.id}`];
      return r?.status !== "done" && r?.status !== "missed";
    });
    if (pending.length === 0) return ordered[ordered.length - 1];
    const upcoming = pending.find((t) => secondsUntil(t.time, now) >= -30 * 60);
    return upcoming ?? pending[0];
  }, [ordered, effective, data, now, openId]);

  /** 这一项是不是已经过了自动跳过的点（过了就只能看，不能在前台改） */
  const lockedIds = useMemo(() => {
    if (!data) return new Set<string>();
    const out = new Set<string>();
    for (let i = 0; i < ordered.length; i += 1) {
      const t = ordered[i];
      const r = effective[`${data.day}|${t.id}`];
      if (r?.status === "done") continue;
      if (r?.status === "missed") {
        out.add(t.id);
        continue;
      }
      if (autoMissedAt(t, ordered[i + 1] ?? null, now, data.settings.autoSkipRemainPct)) out.add(t.id);
    }
    return out;
  }, [ordered, effective, data, now]);

  const openTask = openId ? ordered.find((t) => t.id === openId) ?? null : null;
  const openRecord = openTask && data ? effective[`${data.day}|${openTask.id}`] : undefined;

  if (state.kind === "gate") return <Gate onPass={reload} />;

  if (state.kind === "loading") {
    return (
      <main className="shell" style={{ paddingTop: 80 }}>
        <div className="glass" style={{ padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#46586b" }}>正在加载…</div>
        </div>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className="shell" style={{ paddingTop: 70 }}>
        <div className="glass-flat" style={{ padding: 22, textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>打不开</div>
          <p style={{ margin: "0 0 16px", fontSize: 14, color: "#46586b", lineHeight: 1.6 }}>{state.message}</p>
          <button type="button" className="btn btn-primary btn-block" onClick={() => void reload()}>
            再试一次
          </button>
        </div>
      </main>
    );
  }

  if (!data || !focus) {
    return <main className="shell" style={{ paddingTop: 80 }}>还没有排程</main>;
  }

  const focusRecord = effective[`${data.day}|${focus.id}`];
  const focusPhase = phaseOf(focus, focusRecord, now);
  const focusSec = secondsUntil(focus.time, now);
  // 后台把「显示公告」关掉后，前台就不再弹；已经弹过的不重复弹
  const shown = data.settings.announcementEnabled
    ? (data.announcements || []).filter((a) => !dismissed.includes(a.id))
    : [];

  const onSave = async (
    task: Task,
    payload: {
      status: "done" | "missed";
      items: Record<string, ItemState>;
      note: string | null;
      vitals: { hr: number | null; sbp: number | null; dbp: number | null } | null;
    },
  ) => {
    const res = await save({
      day: data.day,
      taskId: task.id,
      status: payload.status,
      items: payload.items,
      note: payload.note,
      vitals: payload.vitals,
    });
    if (!res.ok) {
      showToast(res.message || "没保存成功");
      return;
    }
    if ((res as { queued?: boolean }).queued) showToast("没网，已经存在这台设备上，联网会自动上传");
    else showToast(payload.status === "done" ? "记好了" : "已记为未完成");
    setOpenId(null);
  };

  const onClear = async (task: Task) => {
    const res = await clearRecord(data.day, task.id);
    if (!res.ok) showToast(res.message || "撤销失败");
    else showToast("已撤销");
    setOpenId(null);
  };

  const dismissAnn = () => {
    const ids = (data.announcements || []).map((a) => a.id);
    setDismissed(ids);
    try {
      window.localStorage.setItem(DISMISS_KEY, JSON.stringify(ids));
    } catch {
      /* 忽略 */
    }
  };

  const doneCount = ordered.filter((t) => effective[`${data.day}|${t.id}`]?.status === "done").length;
  const missedCount = ordered.filter((t) => effective[`${data.day}|${t.id}`]?.status === "missed").length;

  return (
    <>
      <div className="topbar">
        <div className="shell" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <div className="topbar-row">
            <div className="brand">
              <span className="brand-title">用药管理器</span>
              <span className="brand-sub">
                {dayLabel(data.day)} {now.weekday} · {String(now.hour).padStart(2, "0")}:
                {String(now.minute).padStart(2, "0")}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {state.kind === "ready" && state.offline ? (
                <span className="pill due" style={{ alignSelf: "center" }}>
                  离线
                </span>
              ) : null}
              <a className="icon-btn" href="./admin/" aria-label="管理后台">
                <IconLock size={16} />
                管理
              </a>
            </div>
          </div>
        </div>
      </div>

      <main className="shell page-enter">
        {shown.length > 0 ? <Banner items={shown} onDismiss={dismissAnn} /> : null}

        {/* 当前任务主卡 */}
        <section className={`glass hero tone-${focusPhase}`} style={{ marginTop: 12 }}>
          <div className="hero-eyebrow">
            <span className="dot" aria-hidden="true" />
            {focusPhase === "done"
              ? missedCount > 0
                ? "这一项已完成"
                : "今天全部记好了"
              : focusPhase === "missed"
              ? "这一项记为未完成"
              : focusPhase === "upcoming"
              ? "接下来这一项"
              : focusPhase === "overdue"
              ? "这一项已经过了时间"
              : "现在这一项"}
          </div>

          <div className="hero-time">
            <span className="hero-clock">{focus.time}</span>
            <span className="hero-title">{focus.title}</span>
          </div>

          <div
            className={`countdown ${focusSec < -1 ? (focusSec < -300 ? "is-overdue" : "is-now") : ""}`}
            aria-live="off"
          >
            <span className="countdown-label">
              {focusPhase === "done"
                ? "已完成"
                : focusPhase === "missed"
                ? "未完成"
                : focusSec > 0
                ? "距离"
                : focusSec > -300
                ? "正好是现在"
                : "已经过去"}
            </span>
            <span className="countdown-value">
              {focusPhase === "done" || focusPhase === "missed"
                ? focus.time
                : focusSec > 0
                ? formatCountdown(focusSec)
                : formatCountdown(focusSec)}
            </span>
          </div>

          <div className="stack">
            {focus.note ? (
              <div className="alert-line">
                <IconAlert size={17} />
                <span>{focus.note}</span>
              </div>
            ) : null}
            {focus.items.map((it) => (
              <div className={`chip ${it.kind}`} key={it.id}>
                <span className="k" aria-hidden="true">
                  <IconByName name={it.kind === "med" ? "pill" : it.kind === "food" ? "bowl" : "cup"} size={16} />
                </span>
                <span className="label">{it.label}</span>
                {it.tag ? <span className="tag">{it.tag}</span> : null}
              </div>
            ))}
          </div>

          <div className="actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setOpenId(focus.id)}
            >
              打卡
              <IconChevron size={17} />
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              style={{ flex: "none", minWidth: 104 }}
              onClick={() => setOpenId(focus.id)}
            >
              看明细
            </button>
          </div>
        </section>

        {/* 今日进度：并进标题行，只占一行 */}
        <div className="section-head list-head">
          <span className="section-title">今天的安排</span>
          <span className="list-meta">
            <span className="pc-count">
              <b>{doneCount}</b>/{ordered.length}
            </span>
            <span className="progress-track" aria-hidden="true">
              <span
                className="progress-fill"
                style={{ width: `${(doneCount / ordered.length) * 100}%`, display: "block" }}
              />
            </span>
            <span className="pc-count" style={{ color: missedCount > 0 ? "var(--rose)" : undefined }}>
              {missedCount > 0 ? `未完成 ${missedCount}` : "全部正常"}
            </span>
          </span>
        </div>
        {ordered.map((t) => {
          const r = effective[`${data.day}|${t.id}`];
          const ph = phaseOf(t, r, now);
          const sum = tally(t, r?.items);
          const isAuto = r?.status === "missed" && r.note === AUTO_MISS_NOTE;
          const label =
            ph === "done"
              ? "已完成"
              : ph === "missed"
              ? isAuto
                ? "已跳过"
                : "未完成"
              : ph === "due"
              ? "现在"
              : ph === "overdue"
              ? "已过时"
              : "";
          const locked = lockedIds.has(t.id);
          return (
            <button
              key={t.id}
              type="button"
              className={`row-card ${ph === "done" ? "is-done" : ""} ${ph === "due" ? "is-now" : ""} ${
                locked && ph !== "done" ? "is-locked" : ""
              }`}
              onClick={() => setOpenId(t.id)}
            >
              <span className="row-time">{t.time}</span>
              <span className="row-main">
                <span className="row-title">{t.title}</span>
                <span className="row-sub">
                  {ph === "done" && sum.skipped > 0
                    ? `已完成 · 其中 ${sum.skipped} 项暂时不吃`
                    : t.items.map((i) => i.label).join(" · ")}
                </span>
              </span>
              {label ? <span className={`pill ${ph === "due" ? "due" : ph}`}>{label}</span> : null}
            </button>
          );
        })}

        {/* 安全红线 */}
        <section className="glass safety">
          <h3>
            <IconClock size={16} />
            床旁速查
          </h3>
          {SAFETY_RULES.map((r) => (
            <div className="safety-item" key={r.title}>
              <span className="safety-icon" aria-hidden="true">
                <IconByName name={r.icon as "drop" | "heart" | "bed"} size={18} />
              </span>
              <div>
                <div className="safety-t">{r.title}</div>
                <div className="safety-b">{r.body}</div>
              </div>
            </div>
          ))}
          <div style={{ height: 8 }} />
        </section>

        <p className="footnote">
          这份时间表只是提醒，不能替代医嘱。吃药前如有疑问，先问医生。
          <br />
          每次喂完，记得把床头抬高 30°~45°，保持 30 分钟。
        </p>
      </main>

      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}

      {openTask ? (
        <TaskSheet
          task={openTask}
          record={openRecord}
          now={now}
          vitalsEnabled={data.settings.vitalsEnabled}
          editable={data.canEditToday && !lockedIds.has(openTask.id)}
          onClose={() => setOpenId(null)}
          onSave={(p) => void onSave(openTask, p)}
          onClear={() => void onClear(openTask)}
        />
      ) : null}
    </>
  );
}