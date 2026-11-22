"use client";

import { useEffect, useRef } from "react";

export type ConfirmSpec = {
  title: string;
  text?: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: "primary" | "danger" | "amber";
  onConfirm: () => void;
};

export function Confirm({ spec, onClose }: { spec: ConfirmSpec; onClose: () => void }) {
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const tone = spec.tone ?? "primary";
  const iconBg =
    tone === "danger" ? "rgba(194,42,58,0.12)" : tone === "amber" ? "rgba(176,90,0,0.14)" : "rgba(14,143,127,0.12)";
  const iconColor = tone === "danger" ? "#c22a3a" : tone === "amber" ? "#b05a00" : "#0a6f63";

  return (
    <div className="scrim modal-wrap" role="dialog" aria-modal="true" aria-labelledby="cf-title">
      <div className="modal">
        <div className="modal-body">
          <div className="modal-icon" style={{ background: iconBg, color: iconColor }} aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 7.5v5.2" />
              <path d="M12 16.4h.01" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </div>
          <div className="modal-title" id="cf-title">
            {spec.title}
          </div>
          {spec.text ? <div className="modal-text">{spec.text}</div> : null}
        </div>
        <div className="modal-actions">
          <button
            type="button"
            ref={okRef}
            className={tone === "danger" ? "danger" : "strong"}
            onClick={() => {
              spec.onConfirm();
              onClose();
            }}
          >
            {spec.confirmLabel}
          </button>
          <button type="button" onClick={onClose}>
            {spec.cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}