"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { NowParts } from "@/lib/time";
import { secondsUntil } from "@/lib/time";
import { AUTO_MISS_NOTE, MISSED_UNLOCK_SEC, canConfirm, needsEarlyConfirm, tally } from "@/lib/rules";
import type { ItemState, Task, TaskRecord } from "@/lib/types";
import { IconAlert, IconClose, IconLock } from "./Icons";

type Props = {
  task: Task;
  record: TaskRecord | undefined;
  now: NowParts;
  vitalsEnabled: boolean;
  editable: boolean;
  onClose: () => void;
  onSave: (payload: {
    status: "done" | "missed";
    items: Record<string, ItemState>;
    note: string | null;
    vitals: { hr: number | null; sbp: number | null; dbp: number | null } | null;
  }) => void;
  onClear: () => void;
};

export type Vitals = { hr: string; sbp: string; dbp: string };

export function TaskSheet({ task, record, now, vitalsEnabled, editable, onClose, onSave, onClear }: Props) {
  const [items, setItems] = useState<Record<string, ItemState>>(() => ({ ...(record?.items ?? {}) }));
  const [note, setNote] = useState(record?.note ?? "");
  const [vitals, setVitals] = useState<Vitals>({
    hr: record?.vitals?.hr != null ? String(record.vitals.hr) : "",
    sbp: record?.vitals?.sbp != null ? String(record.vitals.sbp) : "",
    dbp: record?.vitals?.dbp != null ? String(record.vitals.dbp) : "",
  });
  const [confirm, setConfirm] = useState<null | {
    title: string;
    text?: string;
    ok: string;
    cancel: string;
    tone: "primary" | "danger" | "amber";
    run: () => void;
  }>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const sec = secondsUntil(task.time, now);
  const sum = tally(task, items);
  const allSet = canConfirm(task, items);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const locked = !editable;

  const toggle = (id: string) => {
    if (locked) return;
    setItems((prev) => {
      const cur = prev[id] ?? "none";
      return { ...prev, [id]: cur === "done" ? "none" : "done" };
    });
  };

  const skip = (id: string) => {
    if (locked) return;
    setItems((prev) => {
      const cur = prev[id] ?? "none";
      return { ...prev, [id]: cur === "skipped" ? "none" : "skipped" };
    });
  };

  const vitalsPayload = (): { hr: number | null; sbp: number | null; dbp: number | null } | null => {
    if (!vitalsEnabled) return null;
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    const hr = num(vitals.hr);
    const sbp = num(vitals.sbp);
    const dbp = num(vitals.dbp);
    if (hr == null && sbp == null && dbp == null) return null;
    return { hr, sbp, dbp };
  };

  const doDone = () => {
    const run = () => onSave({ status: "done", items, note: note.trim() || null, vitals: vitalsPayload() });
    if (needsEarlyConfirm(sec)) {
      setConfirm({
        title: "还没到时间，真的已经完成了吗？",
        text: `现在是 ${task.time} 之前，还差一些时间。提前记成完成，只是提前打卡，不代表可以提前吃。`,
        ok: "是的，已完成",
        cancel: "先等等",
        tone: "amber",
        run,
      });
      return;
    }
    run();
  };

  const doMissed = () => {
    const can = sec <= -MISSED_UNLOCK_SEC;
    if (!can) return;
    setConfirm({
      title: `${task.time} ${task.title} 未完成？`,
      text: "确认这一项服用任务未完成吗",
      ok: "是的，未完成",
      cancel: "我考虑一下",
      tone: "danger",
      run: () => onSave({ status: "missed", items, note: note.trim() || null, vitals: vitalsPayload() }),
    });
  };

  const doClear = () => {
    setConfirm({
      title: "撤销这一项记录？",
      text: "撤销后，这一项会回到未打勾状态。",
      ok: "撤销",
      cancel: "不用了",
      tone: "primary",
      run: onClear,
    });
  };

  const canMissed = sec <= -MISSED_UNLOCK_SEC;
  const savedDone = record?.status === "done";
  const savedMissed = record?.status === "missed";

  const isAutoSkipped = record?.status === "missed" && record.note === AUTO_MISS_NOTE;

  const hint = useMemo(() => {
    if (locked && !savedDone) {
      return isAutoSkipped
        ? "这一项已经自动跳过，前台不能再改了。要补记请让家里人在后台改。"
        : "这一项已经锁定，要修改请让家里人在后台改。";
    }
    if (savedDone) return "这一项已经记好了。有变化可以撤销重记。";
    if (savedMissed) return "这一项记为未完成。如果后来补吃了，可以撤销重记。";
    if (sec > 5 * 60) return "还没到时间。到时间前点“完成”会先确认一次。";
    if (sec > -MISSED_UNLOCK_SEC) return "现在正好是这一项的时间，做完就点“完成”。";
    return "已经过时间了。做了就点“完成”，没做就点“未完成”。";
  }, [locked, savedDone, savedMissed, sec, isAutoSkipped]);

  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div className="sheet" ref={sheetRef}>
        <div className="sheet-head">
          <div className="grabber" aria-hidden="true" />
          <div className="sheet-title-row">
            <div>
              <div className="sheet-time">{task.time}</div>
              <div className="sheet-title" id="sheet-title">{task.title}</div>
            </div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
              <IconClose size={18} />
            </button>
          </div>
        </div>

        <div className="sheet-body">
          {locked && !savedDone ? (
            <div className="alert-line" style={{ marginBottom: 12, background: "rgba(120,132,148,0.14)", borderColor: "rgba(120,132,148,0.3)", color: "var(--text-2)" }}>
              <IconLock size={17} />
              <span>已过时间，这一项只能在后台修改</span>
            </div>
          ) : null}
          {task.note ? (
            <div className="alert-line" style={{ marginBottom: 12 }}>
              <IconAlert size={17} />
              <span>{task.note}</span>
            </div>
          ) : null}

          <div className="check-list">
            {task.items.map((item) => {
              const st = items[item.id] ?? "none";
              return (
                <div key={item.id} className="check-item" data-state={st}>
                  <button
                    type="button"
                    onClick={() => toggle(item.id)}
                    aria-pressed={st === "done"}
                    aria-label={`${item.label}，${st === "done" ? "已完成，点击撤销" : "点击打勾"}`}
                    style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, minHeight: 44, textAlign: "left" }}
                  >
                    <span className="box" aria-hidden="true">
                      {st === "skipped" ? (
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
                          <path d="M6 12h12" />
                        </svg>
                      ) : (
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12.8l4.4 4.4L19 6.6" />
                        </svg>
                      )}
                    </span>
                    <span className="check-label">
                      <span className="check-text">{item.label}</span>
                      {item.tag ? <span className="check-tag">{item.tag}</span> : null}
                    </span>
                  </button>
                  {!locked ? (
                    <button
                      type="button"
                      className="check-alt"
                      onClick={() => skip(item.id)}
                      aria-pressed={st === "skipped"}
                    >
                      {st === "skipped" ? "恢复" : "暂时不吃"}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="progress-line">
            <span>
              已勾 {sum.done}
              {sum.skipped > 0 ? ` · 暂时不吃 ${sum.skipped}` : ""} / 共 {sum.total}
            </span>
            <span className="progress-track" aria-hidden="true">
              <span
                className="progress-fill"
                style={{ width: `${((sum.done + sum.skipped) / sum.total) * 100}%` }}
              />
            </span>
          </div>

          {vitalsEnabled ? (
            <VitalsInput disabled={locked} value={vitals} onChange={setVitals} />
          ) : null}

          {!locked ? (
            <div className="field" style={{ marginTop: 16 }}>
              <label htmlFor="note">备注（选填）</label>
              <textarea
                id="note"
                className="textarea"
                value={note}
                maxLength={200}
                placeholder="例如：吃了一半、呛了一下、情绪不好……"
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          ) : null}

          {record && !locked ? (
            <button type="button" className="btn btn-quiet btn-block" style={{ marginTop: 4 }} onClick={doClear}>
              撤销这一项记录
            </button>
          ) : null}
        </div>

        <div className="sheet-foot">
          <p style={{ margin: "0 0 10px", fontSize: 12.5, lineHeight: 1.5, color: "#7b8b9c", textAlign: "center" }}>{hint}</p>
          <div className="actions" style={{ marginTop: 0 }}>
            <button type="button" className="btn btn-danger" onClick={doMissed} disabled={locked || !canMissed || savedMissed}>
              {savedMissed ? "已记未完成" : "未完成"}
            </button>
            <button type="button" className="btn btn-primary" onClick={doDone} disabled={locked || savedDone || !allSet}>
              {savedDone ? "已记完成" : allSet ? "完成" : "请先勾选"}
            </button>
          </div>
          {!allSet && !savedDone && !locked ? (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "#b05a00", textAlign: "center", fontWeight: 600 }}>
              每一项都要勾选或点“暂时不吃”，才能点完成
            </p>
          ) : null}
        </div>
      </div>

      {confirm ? (
        <ConfirmOverlay
          {...confirm}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </div>
  );
}

function VitalsInput({
  disabled,
  value,
  onChange,
}: {
  disabled: boolean;
  value: Vitals;
  onChange: (v: Vitals) => void;
}) {
  const field = (key: keyof Vitals, label: string) => (
    <div className="field" style={{ marginBottom: 0 }}>
      <label htmlFor={key}>{label}</label>
      <input
        id={key}
        className="input"
        inputMode="numeric"
        pattern="[0-9]*"
        disabled={disabled}
        placeholder="选填"
        value={value[key]}
        onChange={(e) => onChange({ ...value, [key]: e.target.value.replace(/[^0-9]/g, "").slice(0, 3) })}
      />
    </div>
  );
  return (
    <div style={{ marginTop: 16 }}>
      <div className="row2">
        {field("hr", "心率（次/分）")}
        {field("sbp", "高压（mmHg）")}
      </div>
      <div className="row2" style={{ marginTop: 10 }}>
        {field("dbp", "低压（mmHg）")}
        <div />
      </div>
    </div>
  );
}

function ConfirmOverlay(props: {
  title: string;
  text?: string;
  ok: string;
  cancel: string;
  tone: "primary" | "danger" | "amber";
  run: () => void;
  onClose: () => void;
}) {
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    okRef.current?.focus();
  }, []);
  const tone = props.tone;
  const iconBg = tone === "danger" ? "rgba(194,42,58,0.12)" : tone === "amber" ? "rgba(176,90,0,0.14)" : "rgba(14,143,127,0.12)";
  const iconColor = tone === "danger" ? "#c22a3a" : tone === "amber" ? "#b05a00" : "#0a6f63";
  return (
    <div className="scrim modal-wrap" role="alertdialog" aria-modal="true" aria-labelledby="cf-title">
      <div className="modal">
        <div className="modal-body">
          <div className="modal-icon" style={{ background: iconBg, color: iconColor }} aria-hidden="true">
            <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 7.6v5.2" />
              <path d="M12 16.4h.01" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </div>
          <div className="modal-title" id="cf-title">{props.title}</div>
          {props.text ? <div className="modal-text">{props.text}</div> : null}
        </div>
        <div className="modal-actions">
          <button
            type="button"
            ref={okRef}
            className={tone === "danger" ? "danger" : "strong"}
            onClick={() => {
              props.run();
              props.onClose();
            }}
          >
            {props.ok}
          </button>
          <button type="button" onClick={props.onClose}>{props.cancel}</button>
        </div>
      </div>
    </div>
  );
}