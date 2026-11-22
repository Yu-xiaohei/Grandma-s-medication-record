"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, clearSession, getRole, getToken, setSession } from "@/lib/api";
import { addDays, dayLabel, todayKey } from "@/lib/time";
import { AUTO_MISS_NOTE } from "@/lib/rules";
import type { Announcement, Settings, Task, TaskItem, TaskRecord } from "@/lib/types";
import { DEFAULT_TAGS } from "@/lib/types";
import {
  IconChevronDown,
  IconCheck,
  IconEye,
  IconEyeOff,
  IconLock,
  IconLogout,
  IconPlus,
  IconTrash,
} from "./Icons";

type Tab = "today" | "plan" | "notice" | "history" | "settings" | "password";

const EMPTY_SETTINGS: Settings = {
  dayStart: "00:00",
  vitalsEnabled: false,
  pinEnabled: true,
  announcementEnabled: true,
  autoSkipRemainPct: 70,
  tagPresets: DEFAULT_TAGS,
};

const TAB_LIST: [Tab, string][] = [
  ["today", "今天记录"],
  ["plan", "排程设置"],
  ["settings", "常用设置"],
  ["password", "改密码"],
  ["notice", "公告"],
  ["history", "历史"],
];

export function Admin() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (token && getRole() === "admin") setAuthed(true);
    setChecking(false);
  }, []);

  if (checking) {
    return (
      <main className="shell" style={{ paddingTop: 80 }}>
        <div className="glass" style={{ padding: 22, textAlign: "center", fontSize: 14, color: "var(--text-2)" }}>
          正在检查登录…
        </div>
      </main>
    );
  }
  if (!authed) {
    return (
      <AdminLogin
        onPass={() => setAuthed(true)}
      />
    );
  }
  return (
    <AdminShell
      onLogout={() => {
        clearSession();
        setAuthed(false);
      }}
    />
  );
}

/* ------------------------------ 登录 ------------------------------ */

function AdminLogin({ onPass }: { onPass: () => void }) {
  const [u, setU] = useState("Admin");
  const [p, setP] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (busy || !u.trim() || !p) return;
    setBusy(true);
    setErr(null);
    const res = await api.admin(u.trim(), p);
    setBusy(false);
    if (res.ok) {
      setSession(res.data.token, "admin");
      onPass();
      return;
    }
    setErr(res.error === "offline" ? "现在没有网络，后台需要联网登录" : res.message);
  };

  return (
    <main className="shell page-enter" style={{ paddingTop: 36 }}>
      <div className="glass-flat" style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <span className="gate-logo" style={{ width: 40, height: 40, borderRadius: 13 }}>
            <IconLock size={19} />
          </span>
          <div>
            <div className="adm-h1" style={{ fontSize: 16 }}>管理后台</div>
            <div className="adm-sub">只有管理者能进</div>
          </div>
        </div>

        <div className="field">
          <label htmlFor="u">用户名</label>
          <input
            id="u"
            className="input"
            value={u}
            autoComplete="username"
            onChange={(e) => setU(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="p">密码</label>
          <div className="pw-wrap">
            <input
              id="p"
              className="input"
              type={show ? "text" : "password"}
              value={p}
              autoComplete="current-password"
              onChange={(e) => setP(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
            <button
              type="button"
              className="pw-eye"
              aria-label={show ? "隐藏密码" : "显示密码"}
              aria-pressed={show}
              onClick={() => setShow((v) => !v)}
            >
              {show ? <IconEyeOff size={18} /> : <IconEye size={18} />}
            </button>
          </div>
        </div>

        {err ? <div className="msg err">{err}</div> : null}

        <button
          type="button"
          className="btn btn-primary btn-block"
          style={{ marginTop: 14, minHeight: 46 }}
          disabled={busy || !u.trim() || !p}
          onClick={() => void submit()}
        >
          {busy ? "正在登录…" : "登录"}
        </button>
        <a
          href="../"
          style={{
            display: "block",
            marginTop: 12,
            textAlign: "center",
            fontSize: 12.5,
            color: "var(--accent-deep)",
            fontWeight: 650,
            textDecoration: "none",
          }}
        >
          返回前台
        </a>
      </div>
    </main>
  );
}

/* ------------------------------ 后台壳 ------------------------------ */

function AdminShell({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("today");
  const today = todayKey();
  const [day, setDay] = useState(today);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [records, setRecords] = useState<TaskRecord[]>([]);
  const [settings, setSettings] = useState<Settings>(EMPTY_SETTINGS);
  const [anns, setAnns] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; m: string } | null>(null);
  const toastTimer = useRef<number | null>(null);

  const notify = useCallback((t: "ok" | "err", m: string) => {
    setMsg({ t, m });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setMsg(null), 2600);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const load = useCallback(
    async (target: string) => {
      setLoading(true);
      const res = await api.bootstrap(target);
      setLoading(false);
      if (!res.ok) {
        if (res.error === "unauthorized") onLogout();
        else notify("err", res.message);
        return;
      }
      setTasks(res.data.tasks);
      setRecords(res.data.records);
      setSettings(res.data.settings);
      setAnns(res.data.announcements);
    },
    [notify, onLogout],
  );

  useEffect(() => {
    void load(day);
  }, [day, load]);

  return (
    <main className="shell" style={{ paddingBottom: 40 }}>
      <div className="admin-head">
        <div>
          <div className="adm-h1">管理后台</div>
          <div className="adm-sub">
            {dayLabel(today)} · {today.slice(5)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="icon-btn" href="../">
            前台
          </a>
          <button type="button" className="icon-btn" onClick={onLogout} aria-label="退出登录">
            <IconLogout size={16} />
          </button>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {TAB_LIST.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: "center", color: "var(--text-2)", fontSize: 13 }}>
          正在加载…
        </div>
      ) : (
        <div className="tab-panel" key={tab}>
          {tab === "today" ? (
            <TodayRecords
              day={day}
              setDay={setDay}
              today={today}
              tasks={tasks}
              records={records}
              onChanged={() => void load(day)}
              notify={notify}
            />
          ) : null}

          {tab === "plan" ? (
            <PlanEditor
              tasks={tasks}
              settings={settings}
              today={today}
              onSaved={(t, s) => {
                setTasks(t);
                setSettings(s);
              }}
              notify={notify}
            />
          ) : null}

          {tab === "settings" ? (
            <SettingsPanel
              settings={settings}
              today={today}
              onSaved={(s) => setSettings(s)}
              notify={notify}
            />
          ) : null}

          {tab === "password" ? <PasswordPanel notify={notify} /> : null}

          {tab === "notice" ? (
            <NoticeEditor
              anns={anns}
              settings={settings}
              onSaved={(s, a) => {
                setSettings(s);
                setAnns(a);
              }}
              notify={notify}
            />
          ) : null}

          {tab === "history" ? <History today={today} /> : null}
        </div>
      )}

      {msg ? (
        <div className={`admin-toast ${msg.t === "err" ? "err" : ""}`} role="status">
          <span className="tk" aria-hidden="true">
            {msg.t === "ok" ? <IconCheck size={12} /> : "!"}
          </span>
          {msg.m}
        </div>
      ) : null}
    </main>
  );
}

/* ------------------------------ 今日记录 ------------------------------ */

function TodayRecords({
  day,
  setDay,
  today,
  tasks,
  records,
  onChanged,
  notify,
}: {
  day: string;
  setDay: (d: string) => void;
  today: string;
  tasks: Task[];
  records: TaskRecord[];
  onChanged: () => void;
  notify: (t: "ok" | "err", m: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, "done" | "skipped" | "none">>({});
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"done" | "missed">("done");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const map = useMemo(() => {
    const m = new Map<string, TaskRecord>();
    for (const r of records) m.set(r.taskId, r);
    return m;
  }, [records]);

  const canEdit = day === today;
  const yesterday = addDays(today, -1);

  const doneCount = tasks.filter((t) => map.get(t.id)?.status === "done").length;
  const missedCount = tasks.filter((t) => map.get(t.id)?.status === "missed").length;

  const begin = (t: Task, r?: TaskRecord) => {
    if (!canEdit) return;
    setEditing((cur) => (cur === t.id ? null : t.id));
    setItems({ ...(r?.items ?? {}) });
    setNote(r?.note && r.note !== AUTO_MISS_NOTE ? r.note : "");
    setStatus(r?.status ?? "done");
  };

  const commit = async (t: Task) => {
    const res = await api.saveRecord({ day, taskId: t.id, status, items, note: note.trim() || null, source: "admin" });
    if (!res.ok) {
      notify("err", res.message);
      return;
    }
    notify("ok", "已保存");
    setEditing(null);
    onChanged();
  };

  const clear = async (t: Task) => {
    const res = await api.deleteRecord(day, t.id);
    if (!res.ok) {
      notify("err", res.message);
      return;
    }
    setConfirmDel(null);
    if (editing === t.id) setEditing(null);
    notify("ok", "已删除这一条记录");
    onChanged();
  };

  return (
    <>
      <div className="card">
        <div className="today-bar">
          <div className="tb-l">
            <div className="tb-date">{dayLabel(day)}</div>
            <div className="tb-meta">
              完成 <b>{doneCount}</b> · 未完成 <b style={{ color: missedCount ? "var(--rose)" : undefined }}>{missedCount}</b> · 共 {tasks.length}
            </div>
          </div>
          <div className="seg" role="group" aria-label="切换日期">
            <button type="button" aria-pressed={day === today} onClick={() => { setDay(today); setEditing(null); }}>
              看今天
            </button>
            <button type="button" aria-pressed={day === yesterday} onClick={() => { setDay(yesterday); setEditing(null); }}>
              看昨天
            </button>
          </div>
        </div>
        {!canEdit ? (
          <p className="hint" style={{ marginTop: 9, marginBottom: 0 }}>
            昨天已锁定，只能看。当天记录请回「看今天」修改。
          </p>
        ) : null}
      </div>

      <div className="adm-list">
        {tasks.map((t) => {
          const r = map.get(t.id);
          const isOpen = editing === t.id;
          const isAuto = r?.status === "missed" && r.note === AUTO_MISS_NOTE;
          const badge = r?.status === "done" ? "已完成" : r?.status === "missed" ? (isAuto ? "已跳过" : "未完成") : "未记录";
          const badgeCls = r?.status === "done" ? "" : r?.status === "missed" ? "warn" : "off";
          return (
            <div className={`adm-row ${isOpen ? "open" : ""}`} key={t.id}>
              <div className="adm-row-head">
                <span className="adm-time">{t.time}</span>
                <span className="adm-title">{t.title}</span>
                <span className={`badge ${badgeCls}`}>{badge}</span>
                <span className="adm-acts">
                  <button
                    type="button"
                    className="mini"
                    disabled={!canEdit}
                    aria-label={r ? "修改记录" : "补录记录"}
                    title={r ? "修改" : "补录"}
                    onClick={() => begin(t, r)}
                  >
                    {isOpen ? "收起" : "改"}
                  </button>
                  {r ? (
                    confirmDel === t.id ? (
                      <button
                        type="button"
                        className="mini danger"
                        disabled={!canEdit}
                        onClick={() => void clear(t)}
                      >
                        确认删
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="mini danger"
                        disabled={!canEdit}
                        aria-label="删除记录"
                        title="删除记录"
                        onClick={() => setConfirmDel(t.id)}
                      >
                        <IconTrash size={15} />
                      </button>
                    )
                  ) : null}
                </span>
              </div>

              {isOpen ? (
                <div className="adm-edit">
                  {t.items.map((i) => {
                    const st = items[i.id] ?? "none";
                    return (
                      <div className="item-line" key={i.id}>
                        <span className="il-label">
                          {i.label}
                          {i.tag ? <span className="il-tag" style={{ marginLeft: 6 }}>{i.tag}</span> : null}
                        </span>
                        <button
                          type="button"
                          className={`mini-chk ${st === "done" ? "on" : ""}`}
                          aria-pressed={st === "done"}
                          onClick={() => setItems((p) => ({ ...p, [i.id]: st === "done" ? "none" : "done" }))}
                        >
                          已吃
                        </button>
                        <button
                          type="button"
                          className={`mini-chk ${st === "skipped" ? "on sk" : ""}`}
                          aria-pressed={st === "skipped"}
                          onClick={() => setItems((p) => ({ ...p, [i.id]: st === "skipped" ? "none" : "skipped" }))}
                        >
                          暂时不吃
                        </button>
                      </div>
                    );
                  })}

                  <div className="row2" style={{ marginTop: 10 }}>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>整项状态</label>
                      <select
                        className="select"
                        value={status}
                        onChange={(e) => setStatus(e.target.value as "done" | "missed")}
                      >
                        <option value="done">已完成</option>
                        <option value="missed">未完成</option>
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>备注</label>
                      <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="选填" />
                    </div>
                  </div>

                  <div className="actions" style={{ marginTop: 10 }}>
                    <button type="button" className="btn btn-quiet" onClick={() => setEditing(null)}>
                      取消
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => void commit(t)}>
                      保存
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ------------------------------ 排程 ------------------------------ */

const KIND_LABEL: Record<TaskItem["kind"], string> = { med: "药", food: "饭", water: "水" };
const KIND_NEXT: Record<TaskItem["kind"], TaskItem["kind"]> = { med: "food", food: "water", water: "med" };

function newId(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

function TagPicker({
  value,
  presets,
  onChange,
  onPresets,
}: {
  value: string;
  presets: string[];
  onChange: (v: string) => void;
  onPresets: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const addPreset = () => {
    const v = draft.trim().slice(0, 20);
    if (!v) return;
    if (!presets.includes(v)) onPresets([...presets, v]);
    onChange(v);
    setDraft("");
    setOpen(false);
  };

  return (
    <div className="tag-picker" ref={box}>
      <button
        type="button"
        className={`tag-trigger ${value ? "" : "empty"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="tt">{value || "标签"}</span>
        <IconChevronDown size={13} />
      </button>

      {open ? (
        <div className="tag-pop" role="listbox">
          {presets.length === 0 ? (
            <div className="hint" style={{ padding: "6px 8px", margin: 0 }}>还没有常用标签</div>
          ) : null}
          {presets.map((t) => (
            <div className="tag-opt" key={t}>
              <button
                type="button"
                role="option"
                aria-selected={value === t}
                onClick={() => {
                  onChange(value === t ? "" : t);
                  setOpen(false);
                }}
              >
                {value === t ? "✓ " : ""}
                {t}
              </button>
              <button
                type="button"
                className="del"
                aria-label={`删除标签 ${t}`}
                onClick={() => {
                  onPresets(presets.filter((x) => x !== t));
                  if (value === t) onChange("");
                }}
              >
                <IconTrash size={13} />
              </button>
            </div>
          ))}
          <div className="tag-new">
            <input
              value={draft}
              maxLength={20}
              placeholder="新建标签"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPreset();
                }
              }}
            />
            <button type="button" aria-label="新建并选中" onClick={addPreset}>
              <IconPlus size={15} />
            </button>
          </div>
          {value ? (
            <button type="button" className="tag-clear" onClick={() => { onChange(""); setOpen(false); }}>
              清空标签
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PlanEditor({
  tasks,
  settings,
  today,
  onSaved,
  notify,
}: {
  tasks: Task[];
  settings: Settings;
  today: string;
  onSaved: (t: Task[], s: Settings) => void;
  notify: (t: "ok" | "err", m: string) => void;
}) {
  const [draft, setDraft] = useState<Task[]>(tasks);
  const [s, setS] = useState<Settings>(settings);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tagDraft, setTagDraft] = useState("");

  useEffect(() => {
    setDraft(tasks);
    setS(settings);
  }, [tasks, settings]);

  const presets = s.tagPresets ?? DEFAULT_TAGS;
  const dirty = JSON.stringify(draft) !== JSON.stringify(tasks) || JSON.stringify(s) !== JSON.stringify(settings);

  const save = async () => {
    setBusy(true);
    const rt = await api.saveTasks(draft, today);
    if (!rt.ok) {
      setBusy(false);
      notify("err", rt.message);
      return;
    }
    const rs = await api.saveSettings({ ...s, tagPresets: presets }, today);
    setBusy(false);
    if (!rs.ok) {
      notify("err", rs.message);
      return;
    }
    notify("ok", "已保存，只影响今天及以后");
    onSaved([...draft].sort((a, b) => a.time.localeCompare(b.time)), { ...s, tagPresets: presets });
  };

  const patch = (id: string, part: Partial<Task>) =>
    setDraft((d) => d.map((t) => (t.id === id ? { ...t, ...part } : t)));

  const patchItem = (tid: string, iid: string, part: Partial<TaskItem>) =>
    setDraft((d) =>
      d.map((t) =>
        t.id === tid ? { ...t, items: t.items.map((i) => (i.id === iid ? { ...i, ...part } : i)) } : t,
      ),
    );

  const addItem = (tid: string) => {
    const id = newId("n");
    setDraft((d) =>
      d.map((t) =>
        t.id === tid ? { ...t, items: [...t.items, { id, kind: "med" as const, label: "新项目" }] } : t,
      ),
    );
  };

  const removeItem = (tid: string, iid: string) =>
    setDraft((d) => d.map((t) => (t.id === tid ? { ...t, items: t.items.filter((i) => i.id !== iid) } : t)));

  const addTask = () => {
    const id = newId("t");
    const last = draft[draft.length - 1]?.time ?? "08:00";
    setDraft((d) =>
      [
        ...d,
        {
          id,
          time: last,
          title: "新的一项",
          period: "morning" as const,
          note: null,
          items: [{ id: newId("n"), kind: "med" as const, label: "药名 1 片" }],
        } as Task,
      ].sort((a, b) => a.time.localeCompare(b.time)),
    );
    setOpenId(id);
  };

  const removeTask = (id: string) => {
    setDraft((d) => d.filter((t) => t.id !== id));
    if (openId === id) setOpenId(null);
  };

  const addPreset = () => {
    const v = tagDraft.trim().slice(0, 20);
    if (!v) return;
    if (!presets.includes(v)) setS({ ...s, tagPresets: [...presets, v] });
    setTagDraft("");
  };

  return (
    <>
      <div className="card">
        <div className="sub-head">
          <div className="st">每天的排程</div>
          <span className="badge">{draft.length} 段时间</span>
        </div>
        <p className="hint" style={{ marginTop: -4 }}>
          改动从今天起生效，今天以前的记录仍按旧版本显示。点一行展开编辑。
        </p>

        {draft.map((t) => {
          const open = openId === t.id;
          return (
            <div className={`plan-item ${open ? "open" : ""}`} key={t.id}>
              <button
                type="button"
                className="plan-sum"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : t.id)}
              >
                <span className="pt">{t.time}</span>
                <span className="pn">{t.title || "（未命名）"}</span>
                <span className="pc">{t.items.length} 项</span>
                <span className="chev" aria-hidden="true">
                  <IconChevronDown size={16} />
                </span>
              </button>

              {open ? (
                <div className="plan-body">
                  <div className="row-in">
                    <input
                      className="input time"
                      value={t.time}
                      aria-label="时间"
                      onChange={(e) => patch(t.id, { time: e.target.value })}
                    />
                    <input
                      className="input"
                      value={t.title}
                      aria-label="这一段的名称"
                      placeholder="例如：早饭"
                      onChange={(e) => patch(t.id, { title: e.target.value })}
                    />
                    <button
                      type="button"
                      className="mini danger"
                      aria-label="删除这一段时间"
                      title="删除这一段时间"
                      onClick={() => removeTask(t.id)}
                    >
                      <IconTrash size={15} />
                    </button>
                  </div>

                  <div className="row-in">
                    <input
                      className="input"
                      placeholder="提醒（选填），例如：先测血压"
                      value={t.note ?? ""}
                      onChange={(e) => patch(t.id, { note: e.target.value || null })}
                    />
                  </div>

                  <div className="group-title" style={{ margin: "10px 0 2px" }}>
                    这一段时间要吃 / 喝的东西
                  </div>

                  {t.items.map((i) => (
                    <div className="item-line" key={i.id}>
                      <button
                        type="button"
                        className="mini"
                        style={{ width: 34, padding: 0 }}
                        aria-label={`类型：${KIND_LABEL[i.kind]}，点击切换`}
                        onClick={() => patchItem(t.id, i.id, { kind: KIND_NEXT[i.kind] })}
                      >
                        {KIND_LABEL[i.kind]}
                      </button>
                      <input
                        className="input"
                        style={{ flex: 1, minWidth: 0 }}
                        value={i.label}
                        aria-label="名称"
                        onChange={(e) => patchItem(t.id, i.id, { label: e.target.value })}
                      />
                      <TagPicker
                        value={i.tag ?? ""}
                        presets={presets}
                        onChange={(v) => patchItem(t.id, i.id, { tag: v || null })}
                        onPresets={(v) => setS({ ...s, tagPresets: v })}
                      />
                      <button
                        type="button"
                        className="mini danger"
                        aria-label="删除这一项"
                        title="删除这一项"
                        onClick={() => removeItem(t.id, i.id)}
                      >
                        <IconTrash size={14} />
                      </button>
                    </div>
                  ))}

                  <button type="button" className="inline-add" onClick={() => addItem(t.id)}>
                    <IconPlus size={14} />
                    加一项
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}

        <button type="button" className="btn btn-quiet btn-block" style={{ marginTop: 10 }} onClick={addTask}>
          <IconPlus size={16} />
          加一段时间
        </button>
      </div>

      <div className="card">
        <div className="sub-head">
          <div className="st">常用标签</div>
          <span className="badge">{presets.length} 个</span>
        </div>
        <p className="hint" style={{ marginTop: -4 }}>编辑每一项时可从这里直接选，也可以就地新建。</p>
        <div className="chips-wrap">
          {presets.map((t) => (
            <span className="tag-chip" key={t}>
              {t}
              <button
                type="button"
                aria-label={`删除标签 ${t}`}
                onClick={() => setS({ ...s, tagPresets: presets.filter((x) => x !== t) })}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="inline-new">
          <input
            className="input"
            value={tagDraft}
            maxLength={20}
            placeholder="新标签，例如：饭后半小时"
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addPreset();
              }
            }}
          />
          <button type="button" className="btn btn-quiet" style={{ minHeight: 42 }} disabled={!tagDraft.trim()} onClick={addPreset}>
            添加
          </button>
        </div>
      </div>

      <div className="save-bar">
        <span className={`sv-hint ${dirty ? "dirty" : ""}`}>{busy ? "正在保存…" : dirty ? "有未保存的改动" : "已是最新"}</span>
        <button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={() => void save()}>
          保存
        </button>
      </div>
    </>
  );
}

/* ------------------------------ 常用设置 ------------------------------ */

function SettingsPanel({
  settings,
  today,
  onSaved,
  notify,
}: {
  settings: Settings;
  today: string;
  onSaved: (s: Settings) => void;
  notify: (t: "ok" | "err", m: string) => void;
}) {
  const [s, setS] = useState<Settings>(settings);
  const [busy, setBusy] = useState(false);

  useEffect(() => setS(settings), [settings]);

  const dirty = JSON.stringify(s) !== JSON.stringify(settings);

  const save = async () => {
    setBusy(true);
    const pct = Math.min(95, Math.max(30, Number(s.autoSkipRemainPct) || 70));
    const res = await api.saveSettings({ ...s, autoSkipRemainPct: pct }, today);
    setBusy(false);
    if (!res.ok) {
      notify("err", res.message);
      return;
    }
    notify("ok", "设置已保存");
    onSaved({ ...s, autoSkipRemainPct: pct });
  };

  return (
    <>
      <div className="card">
        <div className="field">
          <label htmlFor="ds">每天几点算新的一天</label>
          <input
            id="ds"
            className="input"
            value={s.dayStart}
            placeholder="00:00"
            onChange={(e) => setS({ ...s, dayStart: e.target.value })}
          />
          <p className="hint" style={{ margin: 0 }}>
            默认 00:00。改成 04:00，则凌晨 4 点前还算前一天。
          </p>
        </div>

        <div className="field">
          <label htmlFor="pct">自动跳过：距离下一项只剩多少时间时算没做</label>
          <div className="inline-new">
            <input
              id="pct"
              className="input"
              inputMode="numeric"
              style={{ maxWidth: 96 }}
              value={String(s.autoSkipRemainPct)}
              onChange={(e) => {
                const v = Number(e.target.value.replace(/\D/g, "").slice(0, 2));
                setS({ ...s, autoSkipRemainPct: Number.isFinite(v) ? v : 0 });
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-2)" }}>%</span>
          </div>
          <p className="hint" style={{ margin: 0 }}>
            默认 70：距离下一项只剩 70% 的时间（也就是这一项已经过去 30%）还没打卡，就算没做，前台自动跳到下一项并且不能再补点。后台仍可修改。
          </p>
        </div>
      </div>

      <div className="card">
        <div className="sub-head">
          <div className="st">开关</div>
        </div>
        <Toggle
          t="记录心率和血压"
          d="打开后前台打卡时多出心率、高压、低压三个输入框，可以不填。"
          on={s.vitalsEnabled}
          set={(v) => setS({ ...s, vitalsEnabled: v })}
        />
        <Toggle
          t="开启访问口令"
          d="关闭后任何人打开网址都能直接看。建议保持开启。"
          on={s.pinEnabled}
          set={(v) => setS({ ...s, pinEnabled: v })}
        />
        <Toggle
          t="显示公告"
          d="关闭后前台不再弹公告，已写好的公告保留。"
          on={s.announcementEnabled}
          set={(v) => setS({ ...s, announcementEnabled: v })}
        />
      </div>

      <div className="save-bar">
        <span className={`sv-hint ${dirty ? "dirty" : ""}`}>{busy ? "正在保存…" : dirty ? "有未保存的改动" : "已是最新"}</span>
        <button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={() => void save()}>
          保存
        </button>
      </div>
    </>
  );
}

/* ------------------------------ 改密码 ------------------------------ */

function PasswordPanel({ notify }: { notify: (t: "ok" | "err", m: string) => void }) {
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState<"pin" | "pass" | null>(null);

  const pinOk = pin.length === 4 && pin === pin2;
  const passOk = pass.length >= 10 && pass === pass2;

  const savePin = async () => {
    if (!pinOk) return;
    setBusy("pin");
    const res = await api.setPin(pin);
    setBusy(null);
    if (!res.ok) {
      notify("err", res.message);
      return;
    }
    notify("ok", "前台口令已更新");
    setPin("");
    setPin2("");
  };

  const savePass = async () => {
    if (!passOk) return;
    setBusy("pass");
    const res = await api.changePassword(pass);
    setBusy(null);
    if (!res.ok) {
      notify("err", res.message);
      return;
    }
    notify("ok", "管理员密码已更新");
    setPass("");
    setPass2("");
  };

  return (
    <>
      <div className="card">
        <div className="sub-head">
          <div className="st">前台口令</div>
          <span className="badge">4 位数字</span>
        </div>
        <p className="hint" style={{ marginTop: -4 }}>家里人在前台输这个口令才能打开页面。改完立即生效。</p>

        <div className="field">
          <label htmlFor="p1">新口令</label>
          <div className="pw-wrap">
            <input
              id="p1"
              className="input"
              inputMode="numeric"
              maxLength={4}
              type={showPin ? "text" : "password"}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            />
            <button
              type="button"
              className="pw-eye"
              aria-label={showPin ? "隐藏口令" : "显示口令"}
              onClick={() => setShowPin((v) => !v)}
            >
              {showPin ? <IconEyeOff size={18} /> : <IconEye size={18} />}
            </button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="p2">再输一次</label>
          <input
            id="p2"
            className="input"
            inputMode="numeric"
            maxLength={4}
            type={showPin ? "text" : "password"}
            value={pin2}
            onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <p className={`pw-req ${pin2 && pin !== pin2 ? "bad" : ""}`}>
          {pin2 && pin !== pin2 ? "两次输入不一致" : "4 位数字，例如 0000"}
        </p>
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={!pinOk || busy === "pin"}
          onClick={() => void savePin()}
        >
          {busy === "pin" ? "正在更新…" : "更新前台口令"}
        </button>
      </div>

      <div className="card">
        <div className="sub-head">
          <div className="st">管理员密码</div>
          <span className="badge">至少 10 位</span>
        </div>
        <p className="hint" style={{ marginTop: -4 }}>用来登录这个后台。改完请记牢，忘记后只能改 Cloudflare 里的密钥。</p>

        <div className="field">
          <label htmlFor="pw1">新密码</label>
          <div className="pw-wrap">
            <input
              id="pw1"
              className="input"
              type={showPass ? "text" : "password"}
              value={pass}
              autoComplete="new-password"
              onChange={(e) => setPass(e.target.value)}
            />
            <button
              type="button"
              className="pw-eye"
              aria-label={showPass ? "隐藏密码" : "显示密码"}
              onClick={() => setShowPass((v) => !v)}
            >
              {showPass ? <IconEyeOff size={18} /> : <IconEye size={18} />}
            </button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="pw2">再输一次</label>
          <input
            id="pw2"
            className="input"
            type={showPass ? "text" : "password"}
            value={pass2}
            autoComplete="new-password"
            onChange={(e) => setPass2(e.target.value)}
          />
        </div>
        <p className={`pw-req ${pass2 && pass !== pass2 ? "bad" : pass && pass.length < 10 ? "bad" : ""}`}>
          {pass2 && pass !== pass2 ? "两次输入不一致" : pass && pass.length < 10 ? `还差 ${10 - pass.length} 位` : "至少 10 位，建议字母加数字"}
        </p>
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={!passOk || busy === "pass"}
          onClick={() => void savePass()}
        >
          {busy === "pass" ? "正在更新…" : "更新管理员密码"}
        </button>
      </div>
    </>
  );
}

/* ------------------------------ 公告 ------------------------------ */

function NoticeEditor({
  anns,
  settings,
  onSaved,
  notify,
}: {
  anns: Announcement[];
  settings: Settings;
  onSaved: (s: Settings, a: Announcement[]) => void;
  notify: (t: "ok" | "err", m: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);

  const publish = async () => {
    setBusy(true);
    const res = await api.saveAnnouncement({ title: title.trim(), body: body.trim(), activeFrom: from || null, activeTo: to || null });
    setBusy(false);
    if (!res.ok) {
      notify("err", res.message);
      return;
    }
    notify("ok", "公告已发布");
    setTitle("");
    setBody("");
    setFrom("");
    setTo("");
    const fresh = await api.bootstrap(todayKey());
    if (fresh.ok) onSaved(fresh.data.settings, fresh.data.announcements);
  };

  return (
    <>
      <div className="card">
        <div className="sub-head">
          <div className="st">发一条公告</div>
          <span className="badge">{settings.announcementEnabled ? "前台会弹" : "前台已关闭"}</span>
        </div>
        <div className="field">
          <label htmlFor="at">标题</label>
          <input
            id="at"
            className="input"
            value={title}
            maxLength={40}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：今天下午要复查"
          />
        </div>
        <div className="field">
          <label htmlFor="ab">内容</label>
          <textarea
            id="ab"
            className="textarea"
            value={body}
            maxLength={500}
            onChange={(e) => setBody(e.target.value)}
            placeholder="写给家里人看的话，尽量短。"
          />
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="af">从哪天开始（可空）</label>
            <input id="af" className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ato">到哪天结束（可空）</label>
            <input id="ato" className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={busy || !title.trim() || !body.trim()}
          onClick={() => void publish()}
        >
          {busy ? "正在发布…" : "发布"}
        </button>
      </div>

      <div className="card">
        <div className="sub-head">
          <div className="st">已发布的公告</div>
          <span className="badge">{anns.length}</span>
        </div>
        {anns.length === 0 ? <p className="hint">还没有公告。</p> : null}
        {anns.map((a) => (
          <div className="item-line" key={a.id} style={{ borderTop: "1px dashed var(--line)", padding: "9px 0" }}>
            <span className="il-label">
              <b style={{ fontSize: 13 }}>{a.title}</b>
              <span style={{ display: "block", fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>{a.body}</span>
            </span>
            <button
              type="button"
              className="mini danger"
              onClick={async () => {
                const res = await api.archiveAnnouncement(a.id);
                if (!res.ok) {
                  notify("err", res.message);
                  return;
                }
                notify("ok", "已下架");
                const fresh = await api.bootstrap(todayKey());
                if (fresh.ok) onSaved(fresh.data.settings, fresh.data.announcements);
              }}
            >
              下架
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

/* ------------------------------ 历史 ------------------------------ */

/** 历史用那一天「当时」的排程，改了药名也不会把旧记录改头换面 */
function taskOf(tasksByDay: Record<string, Task[]>, day: string, id: string) {
  return (tasksByDay[day] || []).find((t) => t.id === id) ?? null;
}

function History({ today }: { today: string }) {
  const [all, setAll] = useState<TaskRecord[]>([]);
  const [tasksByDay, setTasksByDay] = useState<Record<string, Task[]>>({});
  const [loading, setLoading] = useState(true);
  const [openDay, setOpenDay] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await api.history(addDays(today, -29), today);
      setLoading(false);
      if (res.ok) {
        setAll(res.data.records);
        setTasksByDay(res.data.tasksByDay || {});
      }
    })();
  }, [today]);

  const byDay = useMemo(() => {
    const m = new Map<string, TaskRecord[]>();
    for (const r of all) {
      const arr = m.get(r.day) ?? [];
      arr.push(r);
      m.set(r.day, arr);
    }
    return m;
  }, [all]);

  const list = Array.from({ length: 30 }, (_, i) => addDays(today, -i));

  return (
    <>
      <div className="card">
        <div className="sub-head">
          <div className="st">最近 30 天</div>
        </div>
        <p className="hint" style={{ marginTop: -4 }}>
          绿色 = 全部完成；黄色 = 有未完成或未记录；空白 = 没有记录。点一天看明细。
        </p>
        <div className="grid-days">
          {list.slice().reverse().map((d) => {
            const rs = byDay.get(d) ?? [];
            const done = rs.filter((r) => r.status === "done").length;
            const missed = rs.filter((r) => r.status === "missed").length;
            const cls = rs.length === 0 ? "none" : missed > 0 ? "part" : "ok";
            return (
              <button
                type="button"
                className={`day-cell ${cls}`}
                key={d}
                onClick={() => setOpenDay((cur) => (cur === d ? null : d))}
                aria-pressed={openDay === d}
              >
                <span className="dd">{d.slice(5)}</span>
                <span className="nn">{rs.length === 0 ? "–" : done}</span>
                {openDay === d ? <span className="dd">已选</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? <div className="card" style={{ fontSize: 13, color: "var(--text-2)" }}>正在取历史…</div> : null}

      {list
        .filter((d) => (openDay ? d === openDay : true))
        .map((d) => {
          const rs = byDay.get(d);
          if (!rs || rs.length === 0) return null;
          const done = rs.filter((r) => r.status === "done").length;
          const missed = rs.length - done;
          return (
            <div className="card" key={d}>
              <div className="today-bar" style={{ marginBottom: 8 }}>
                <div className="tb-l">
                  <div className="tb-date">{dayLabel(d)}</div>
                  <div className="tb-meta">
                    完成 {done} · 未完成 {missed}
                  </div>
                </div>
                <span className={`badge ${missed > 0 ? "warn" : ""}`}>{missed > 0 ? "有未完成" : "全部完成"}</span>
              </div>
              <div className="adm-list" style={{ marginTop: 0 }}>
                {rs
                  .slice()
                  .sort((a, b) => a.taskId.localeCompare(b.taskId))
                  .map((r) => {
                    const t = taskOf(tasksByDay, d, r.taskId);
                    const isAuto = r.status === "missed" && r.note === AUTO_MISS_NOTE;
                    const skipped = Object.values(r.items).filter((v) => v === "skipped").length;
                    return (
                      <div className="adm-row" key={r.taskId}>
                        <div className="adm-row-head">
                          <span className="adm-time">{t?.time ?? "—"}</span>
                          <span className="adm-title">
                            {t?.title ?? r.taskId}
                            {skipped > 0 ? (
                              <span style={{ fontWeight: 600, color: "var(--text-3)" }}> · 暂时不吃 {skipped}</span>
                            ) : null}
                          </span>
                          <span className={`badge ${r.status === "done" ? "" : "warn"}`}>
                            {r.status === "done" ? "已完成" : isAuto ? "已跳过" : "未完成"}
                          </span>
                          <span />
                        </div>
                        {r.note && !isAuto ? (
                          <div className="hint" style={{ padding: "0 10px 8px", margin: 0 }}>{r.note}</div>
                        ) : null}
                      </div>
                    );
                  })}
              </div>
            </div>
          );
        })}
    </>
  );
}

function Toggle({ t, d, on, set }: { t: string; d: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <div className="toggle-row">
      <div>
        <div className="t">{t}</div>
        <div className="d">{d}</div>
      </div>
      <button type="button" className="switch-hit" role="switch" aria-checked={on} aria-label={t} onClick={() => set(!on)}>
        <span className="switch" aria-hidden="true" />
      </button>
    </div>
  );
}
