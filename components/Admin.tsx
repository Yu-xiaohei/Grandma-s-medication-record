"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, clearSession, getRole, getToken, setSession } from "@/lib/api";
import { addDays, dayLabel, todayKey } from "@/lib/time";
import type { Announcement, Settings, Task, TaskRecord } from "@/lib/types";
import { IconCalendar, IconLock, IconLogout } from "./Icons";

type Tab = "today" | "plan" | "notice" | "history";

const EMPTY_SETTINGS: Settings = {
  dayStart: "00:00",
  vitalsEnabled: false,
  pinEnabled: true,
  announcementEnabled: true,
  autoSkipRemainPct: 70,
};

export function Admin() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (token && getRole() === "admin") setAuthed(true);
    setChecking(false);
  }, []);

  if (checking) return <main className="shell" style={{ paddingTop: 80 }}>正在检查登录…</main>;
  if (!authed) return <AdminLogin onPass={() => setAuthed(true)} />;
  return (
    <AdminShell
      onLogout={() => {
        clearSession();
        setAuthed(false);
      }}
    />
  );
}

function AdminLogin({ onPass }: { onPass: () => void }) {
  const [u, setU] = useState("Admin");
  const [p, setP] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    const res = await api.admin(u, p);
    setBusy(false);
    if (res.ok) {
      setSession(res.data.token, "admin");
      onPass();
      return;
    }
    setErr(res.error === "offline" ? "现在没有网络，后台需要联网登录" : res.message);
  };

  return (
    <main className="shell" style={{ paddingTop: 40 }}>
      <div className="glass-flat" style={{ padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <span className="gate-logo" style={{ width: 44, height: 44, borderRadius: 14 }}>
            <IconLock size={20} />
          </span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>管理后台</div>
            <div style={{ fontSize: 12.5, color: "#7b8b9c", marginTop: 2 }}>只有管理者能进</div>
          </div>
        </div>

        <div className="field">
          <label htmlFor="u">用户名</label>
          <input id="u" className="input" value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" />
        </div>
        <div className="field">
          <label htmlFor="p">密码</label>
          <input
            id="p"
            className="input"
            type="password"
            value={p}
            autoComplete="current-password"
            onChange={(e) => setP(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
        </div>

        {err ? <div className="msg err">{err}</div> : null}

        <button
          type="button"
          className="btn btn-primary btn-block"
          style={{ marginTop: 14 }}
          disabled={busy || !u || !p}
          onClick={() => void submit()}
        >
          {busy ? "正在登录…" : "登录"}
        </button>
        <a href="../" style={{ display: "block", marginTop: 12, textAlign: "center", fontSize: 13, color: "#0a6f63", fontWeight: 600, textDecoration: "none" }}>
          返回前台
        </a>
      </div>
    </main>
  );
}

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

  const notify = useCallback((t: "ok" | "err", m: string) => {
    setMsg({ t, m });
    window.setTimeout(() => setMsg(null), 3200);
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
          <div style={{ fontSize: 18, fontWeight: 800 }}>管理后台</div>
          <div style={{ fontSize: 12.5, color: "#7b8b9c", marginTop: 2 }}>{dayLabel(today)} · {today}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="icon-btn" href="../">前台</a>
          <button type="button" className="icon-btn" onClick={onLogout} aria-label="退出登录">
            <IconLogout size={16} />
          </button>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {(
          [
            ["today", "今天记录"],
            ["plan", "排程设置"],
            ["notice", "公告设置"],
            ["history", "历史记录"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {msg ? <div className={`msg ${msg.t}`}>{msg.m}</div> : null}

      {loading ? <div className="card">正在加载…</div> : null}

      {!loading && tab === "today" ? (
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

      {!loading && tab === "plan" ? (
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

      {!loading && tab === "notice" ? (
        <NoticeEditor anns={anns} settings={settings} onSaved={(s, a) => {
          setSettings(s);
          setAnns(a);
        }} notify={notify} />
      ) : null}

      {!loading && tab === "history" ? <History today={today} /> : null}

      {!loading && tab !== "plan" && tab !== "notice" && tab !== "today" ? null : null}
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

  const map = useMemo(() => {
    const m = new Map<string, TaskRecord>();
    for (const r of records) m.set(r.taskId, r);
    return m;
  }, [records]);

  const canEdit = day === today;

  const begin = (t: Task, r?: TaskRecord) => {
    if (!canEdit) return;
    setEditing(t.id);
    setItems({ ...(r?.items ?? {}) });
    setNote(r?.note ?? "");
    setStatus(r?.status ?? "done");
  };

  const commit = async (t: Task) => {
    const res = await api.saveRecord({ day, taskId: t.id, status, items, note: note || null, source: "admin" });
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
    notify("ok", "已清除这一项");
    onChanged();
  };

  return (
    <>
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div>
            <h3>补录当天记录</h3>
            <p className="hint">
              只能改当天（{today}）。过了 0 点自动锁定，前台后台都改不了。
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setDay(day === today ? addDays(today, -1) : today)}
          >
            <IconCalendar size={16} />
            {day === today ? "看昨天" : "回今天"}
          </button>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#46586b" }}>
          {dayLabel(day)} {canEdit ? "（可编辑）" : "（已锁定，只读）"}
        </div>
      </div>

      {tasks.map((t) => {
        const r = map.get(t.id);
        const isOpen = editing === t.id;
        return (
          <div className="card" key={t.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 17, fontWeight: 800, color: "#0a6f63", minWidth: 52 }}>{t.time}</span>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>{t.title}</span>
              <span className={`badge ${r?.status === "done" ? "" : r?.status === "missed" ? "warn" : "off"}`}>
                {r?.status === "done" ? "已完成" : r?.status === "missed" ? "未完成" : "未记录"}
              </span>
            </div>

            {isOpen ? (
              <div style={{ marginTop: 12 }}>
                {t.items.map((i) => {
                  const st = items[i.id] ?? "none";
                  return (
                    <div className="toggle-row" key={i.id}>
                      <div>
                        <div className="t">{i.label}</div>
                        {i.tag ? <div className="d">{i.tag}</div> : null}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          className="icon-btn"
                          style={{ minHeight: 38, padding: "0 12px" }}
                          onClick={() =>
                            setItems((p) => ({ ...p, [i.id]: p[i.id] === "done" ? "none" : "done" }))
                          }
                        >
                          {st === "done" ? "✓ 已吃" : "已吃"}
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          style={{ minHeight: 38, padding: "0 12px" }}
                          onClick={() =>
                            setItems((p) => ({ ...p, [i.id]: p[i.id] === "skipped" ? "none" : "skipped" }))
                          }
                        >
                          {st === "skipped" ? "暂缓 ✓" : "暂缓"}
                        </button>
                      </div>
                    </div>
                  );
                })}

                <div className="row2" style={{ marginTop: 10 }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>整项状态</label>
                    <select className="select" value={status} onChange={(e) => setStatus(e.target.value as "done" | "missed")}>
                      <option value="done">已完成</option>
                      <option value="missed">未完成</option>
                    </select>
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>备注</label>
                    <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="选填" />
                  </div>
                </div>

                <div className="actions" style={{ marginTop: 12 }}>
                  <button type="button" className="btn btn-quiet" onClick={() => setEditing(null)}>取消</button>
                  <button type="button" className="btn btn-primary" onClick={() => void commit(t)}>保存</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  className="icon-btn"
                  style={{ flex: 1 }}
                  disabled={!canEdit}
                  onClick={() => begin(t, r)}
                >
                  {r ? "修改" : "补录"}
                </button>
                {r ? (
                  <button type="button" className="icon-btn" style={{ flex: 1, color: "#c22a3a" }} disabled={!canEdit} onClick={() => void clear(t)}>
                    清除
                  </button>
                ) : null}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/* ------------------------------ 排程 ------------------------------ */

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
  const [busy, setBusy] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [newPass, setNewPass] = useState("");

  useEffect(() => {
    setDraft(tasks);
    setS(settings);
  }, [tasks, settings]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(tasks) || JSON.stringify(s) !== JSON.stringify(settings);

  const save = async () => {
    setBusy(true);
    const rt = await api.saveTasks(draft, today);
    const pct = Math.min(95, Math.max(30, Number(s.autoSkipRemainPct) || 70));
    const rs = await api.saveSettings({ ...s, autoSkipRemainPct: pct }, today);
    setBusy(false);
    if (!rt.ok) {
      notify("err", rt.message);
      return;
    }
    if (!rs.ok) {
      notify("err", rs.message);
      return;
    }
    notify("ok", "已保存。只影响今天及以后，历史记录不变。");
    onSaved(draft, { ...s, autoSkipRemainPct: pct });
  };

  const patch = (id: string, part: Partial<Task>) =>
    setDraft((d) => d.map((t) => (t.id === id ? { ...t, ...part } : t)));

  const patchItem = (tid: string, iid: string, part: { label?: string; tag?: string }) =>
    setDraft((d) =>
      d.map((t) =>
        t.id === tid
          ? { ...t, items: t.items.map((i) => (i.id === iid ? { ...i, ...part } : i)) }
          : t,
      ),
    );

  const addItem = (tid: string) =>
    setDraft((d) =>
      d.map((t) =>
        t.id === tid
          ? { ...t, items: [...t.items, { id: `n${Date.now().toString(36)}`, kind: "med", label: "新项目" }] }
          : t,
      ),
    );

  const removeItem = (tid: string, iid: string) =>
    setDraft((d) => d.map((t) => (t.id === tid ? { ...t, items: t.items.filter((i) => i.id !== iid) } : t)));

  const addTask = () =>
    setDraft((d) => {
      const last = d[d.length - 1]?.time ?? "08:00";
      return [
        ...d,
        {
          id: `t${Date.now().toString(36)}`,
          time: last,
          title: "新的一项",
          period: "morning" as const,
          note: null,
          items: [{ id: "m1", kind: "med", label: "药名 1 片" }],
        } as Task,
      ].sort((a, b) => a.time.localeCompare(b.time));
    });

  const removeTask = (id: string) => setDraft((d) => d.filter((t) => t.id !== id));

  return (
    <>
      <div className="card">
        <h3>每天的排程</h3>
        <p className="hint">
          改动会生成从今天开始的新版本。今天以前的记录仍按旧版本显示，不会变。
        </p>
        {draft.map((t) => (
          <div className="task-edit" key={t.id}>
            <div className="task-edit-head">
              <input className="input time" value={t.time} onChange={(e) => patch(t.id, { time: e.target.value })} />
              <input className="input" value={t.title} onChange={(e) => patch(t.id, { title: e.target.value })} />
              <button type="button" className="icon-btn" style={{ minHeight: 40, padding: "0 10px", color: "#c22a3a" }} onClick={() => removeTask(t.id)}>
                删
              </button>
            </div>
            <div style={{ marginTop: 8 }}>
              <input
                className="input"
                placeholder="提醒（选填），例如：先测心率"
                value={t.note ?? ""}
                onChange={(e) => patch(t.id, { note: e.target.value || null })}
              />
            </div>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {t.items.map((i) => (
                <div key={i.id} style={{ display: "flex", gap: 6 }}>
                  <input className="input" style={{ flex: 2 }} value={i.label} onChange={(e) => patchItem(t.id, i.id, { label: e.target.value })} />
                  <input
                    className="input"
                    style={{ flex: 1 }}
                    placeholder="标签"
                    value={i.tag ?? ""}
                    onChange={(e) => patchItem(t.id, i.id, { tag: e.target.value })}
                  />
                  <button type="button" className="icon-btn" style={{ minHeight: 46, padding: "0 10px" }} onClick={() => removeItem(t.id, i.id)}>
                    −
                  </button>
                </div>
              ))}
              <button type="button" className="btn btn-quiet" style={{ minHeight: 40 }} onClick={() => addItem(t.id)}>
                + 加一项
              </button>
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-quiet btn-block" onClick={addTask}>
          + 加一段时间
        </button>
      </div>

      <div className="card">
        <h3>常用设置</h3>
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
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              id="pct"
              className="input"
              inputMode="numeric"
              style={{ maxWidth: 110 }}
              value={String(s.autoSkipRemainPct)}
              onChange={(e) => {
                const v = Number(e.target.value.replace(/\D/g, "").slice(0, 2));
                setS({ ...s, autoSkipRemainPct: Number.isFinite(v) ? v : 0 });
              }}
            />
            <span style={{ fontSize: 14, fontWeight: 700, color: "#46586b" }}>%</span>
          </div>
          <p className="hint" style={{ margin: 0 }}>
            默认 70。例如 11:50 和 12:30 之间差 40 分钟，11:50 这一项一直没打卡，
            到 12:02（只剩 70% 的间隔）就自动记为未完成，主卡直接显示 12:30 那一项。
          </p>
        </div>

        <Toggle
          t="记录心率和血压"
          d="打开后，前台每个任务下面会多出心率/高压/低压三个输入框，可以不填。"
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

      <div className="card">
        <h3>口令与密码</h3>
        <p className="hint">改完立即生效，请记牢。</p>
        <div className="row2">
          <div className="field">
            <label htmlFor="np">新口令（4 位数字）</label>
            <input
              id="np"
              className="input"
              inputMode="numeric"
              maxLength={4}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div className="field">
            <label htmlFor="npass">新管理员密码（≥10 位）</label>
            <input
              id="npass"
              className="input"
              type="password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
            />
          </div>
        </div>
        <div className="actions">
          <button
            type="button"
            className="btn btn-quiet"
            disabled={newPin.length !== 4}
            onClick={async () => {
              const res = await api.setPin(newPin);
              notify(res.ok ? "ok" : "err", res.ok ? "口令已更新" : res.message);
              if (res.ok) setNewPin("");
            }}
          >
            更新口令
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            disabled={newPass.length < 10}
            onClick={async () => {
              const res = await api.changePassword(newPass);
              notify(res.ok ? "ok" : "err", res.ok ? "管理员密码已更新" : res.message);
              if (res.ok) setNewPass("");
            }}
          >
            更新密码
          </button>
        </div>
      </div>

      <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 14 }} disabled={busy || !dirty} onClick={() => void save()}>
        {busy ? "正在保存…" : dirty ? "保存排程和设置" : "没有改动"}
      </button>
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
      <button
        type="button"
        className="switch-hit"
        role="switch"
        aria-checked={on}
        aria-label={t}
        onClick={() => set(!on)}
      >
        <span className="switch" aria-hidden="true" />
      </button>
    </div>
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

  const publish = async () => {
    const res = await api.saveAnnouncement({ title, body, activeFrom: from || null, activeTo: to || null });
    if (!res.ok) {
      notify("err", res.message);
      return;
    }
    notify("ok", "公告已发布");
    setTitle("");
    setBody("");
    const fresh = await api.bootstrap(todayKey());
    if (fresh.ok) onSaved(fresh.data.settings, fresh.data.announcements);
  };

  return (
    <>
      <div className="card">
        <h3>发一条公告</h3>
        <p className="hint">前台打开时会在顶部显示。写完后点发布。</p>
        <div className="field">
          <label htmlFor="at">标题</label>
          <input id="at" className="input" value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} placeholder="例如：今天下午要复查" />
        </div>
        <div className="field">
          <label htmlFor="ab">内容</label>
          <textarea id="ab" className="textarea" value={body} maxLength={500} onChange={(e) => setBody(e.target.value)} placeholder="写给家里人看的话，尽量短。" />
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
        <button type="button" className="btn btn-primary btn-block" disabled={!title.trim() || !body.trim()} onClick={() => void publish()}>
          发布
        </button>
      </div>

      <div className="card">
        <h3>已发布的公告</h3>
        {anns.length === 0 ? <p className="hint">还没有公告。</p> : null}
        {anns.map((a) => (
          <div className="toggle-row" key={a.id}>
            <div style={{ minWidth: 0 }}>
              <div className="t">{a.title}</div>
              <div className="d">{a.body}</div>
            </div>
            <button
              type="button"
              className="icon-btn"
              style={{ minHeight: 38, padding: "0 12px", color: "#c22a3a" }}
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

/** 历史用那一周里「当时那一天」的排程，改了药名也不会把旧记录改头换面 */
function taskTitle(tasksByDay: Record<string, Task[]>, day: string, id: string) {
  return (tasksByDay[day] || []).find((t) => t.id === id) ?? null;
}

function History({ today }: { today: string }) {
  const [days, setDays] = useState<string[]>([]);
  const [all, setAll] = useState<TaskRecord[]>([]);
  const [tasksByDay, setTasksByDay] = useState<Record<string, Task[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const res = await api.history(addDays(today, -29), today);
      setLoading(false);
      if (res.ok) {
        setDays(res.data.days);
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
        <h3>最近 30 天</h3>
        <p className="hint">绿色 = 全部完成；黄色 = 有未完成或部分暂缓；空白 = 没有记录。</p>
        <div className="grid-days">
          {list.slice(0, 28).reverse().map((d) => {
            const rs = byDay.get(d) ?? [];
            const done = rs.filter((r) => r.status === "done").length;
            const missed = rs.filter((r) => r.status === "missed").length;
            const cls = rs.length === 0 ? "none" : missed > 0 ? "part" : "ok";
            return (
              <div className={`day-cell ${cls}`} key={d}>
                <div className="dd">{d.slice(5)}</div>
                <div className="nn">{rs.length === 0 ? "–" : `${done}`}</div>
              </div>
            );
          })}
        </div>
      </div>

      {loading ? <div className="card">正在取历史…</div> : null}

      {list.map((d) => {
        const rs = byDay.get(d);
        if (!rs || rs.length === 0) return null;
        return (
          <div className="card" key={d}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h3>{dayLabel(d)}</h3>
              <span className="badge">{rs.filter((r) => r.status === "done").length} 完成</span>
            </div>
            {rs.sort((a, b) => a.taskId.localeCompare(b.taskId)).map((r) => (
              <div className="toggle-row" key={r.taskId}>
                <div>
                  <div className="t">{taskTitle(tasksByDay, d, r.taskId)?.title ?? r.taskId}</div>
                  <div className="d">
                    {r.status === "done" ? "已完成" : "未完成"}
                    {Object.values(r.items).filter((v) => v === "skipped").length > 0
                      ? ` · 暂缓 ${Object.values(r.items).filter((v) => v === "skipped").length}`
                      : ""}
                    {r.note ? ` · ${r.note}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}