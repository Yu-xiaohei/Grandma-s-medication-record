"use client";

import { useEffect } from "react";

/**
 * 注册离线脚本。
 * 注意：分包路径（GitHub Pages 的子路径）必须用 NEXT_PUBLIC_BASE_PATH 拼出来，
 * 不能靠 ./ 推断，否则从 /admin/ 里注册会指到 /admin/sw.js。
 */
const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");

export function SwRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost") return;

    const base = `${BASE_PATH}/`;
    const url = `${base}sw.js`;

    const register = () => {
      navigator.serviceWorker.register(url, { scope: base }).catch(() => {
        /* 注册失败不影响正常使用，只是没有离线能力 */
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}