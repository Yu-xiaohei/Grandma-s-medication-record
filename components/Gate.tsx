"use client";

import { useCallback, useEffect, useState } from "react";
import { api, setSession } from "@/lib/api";
import { IconLock } from "./Icons";

/**
 * 口令门：用网页内置大键盘，不弹系统键盘。
 * 老人家里那台平板经常被系统输入法挡住半个屏幕，也不方便单手按。
 */
export function Gate({ onPass }: { onPass: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);

  const fail = useCallback((msg: string) => {
    setErr(msg);
    setShake(true);
    setPin("");
    window.setTimeout(() => setShake(false), 500);
    if (navigator.vibrate) navigator.vibrate([18, 60, 18]);
  }, []);

  const submit = useCallback(
    async (value: string) => {
      setBusy(true);
      setErr(null);
      const res = await api.pin(value);
      setBusy(false);
      if (res.ok) {
        setSession(res.data.token, res.data.role);
        onPass();
        return;
      }
      if (res.error === "locked") {
        setLockedUntil(res.lockedUntil ?? null);
        fail("试的次数太多了，请等一会儿再试");
        return;
      }
      fail(res.error === "offline" ? "现在没有网络，第一次打开需要联网" : res.message);
    },
    [fail, onPass],
  );

  const press = useCallback(
    (d: string) => {
      if (busy) return;
      setErr(null);
      setPin((prev) => (prev + d).slice(0, 4));
    },
    [busy, pin, submit],
  );

  const back = useCallback(() => {
    if (busy) return;
    setPin((p) => p.slice(0, -1));
    setErr(null);
  }, [busy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") back();
      else if (e.key === "Enter" && pin.length === 4) void submit(pin);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [press, back, pin, submit]);

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <main className="gate">
      <div className="gate-logo" aria-hidden="true">
        <IconLock size={28} />
      </div>
      <h1>用药管理器</h1>
      <p>
        请输入 4 位数字口令
        <br />
        忘了就问家里管密码的人
      </p>

      <div className={`dots ${shake ? "shake" : ""}`} aria-label={`已输入 ${pin.length} 位`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={i < pin.length ? "on" : ""} />
        ))}
      </div>

      <div className="gate-err" role="status" aria-live="polite">
        {err}
        {lockedUntil ? `（${new Date(lockedUntil).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 后再试）` : null}
      </div>

      <div className="keypad">
        {keys.map((k) => (
          <button key={k} type="button" className="key" onClick={() => press(k)} disabled={busy}>
            {k}
          </button>
        ))}
        <button type="button" className="key ghost" onClick={() => setPin("")} disabled={busy || pin.length === 0}>
          清空
        </button>
        <button type="button" className="key" onClick={() => press("0")} disabled={busy}>
          0
        </button>
        <button type="button" className="key ghost" onClick={back} disabled={busy || pin.length === 0}>
          删除
        </button>
      </div>

      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ maxWidth: 320, minHeight: 58 }}
        disabled={busy || pin.length !== 4}
        onClick={() => void submit(pin)}
      >
        {busy ? "正在核对…" : "进入"}
      </button>

      <p style={{ marginTop: 6, fontSize: 12 }}>
        输入一次，这台设备 7 天内不用再输
      </p>
    </main>
  );
}