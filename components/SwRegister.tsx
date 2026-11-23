"use client";

import { useEffect, useState } from "react";

/**
 * 注册离线脚本。
 * 注意：分包路径（GitHub Pages 的子路径）必须用 NEXT_PUBLIC_BASE_PATH 拼出来，
 * 不能靠 ./ 推断，否则从 /admin/ 里注册会指到 /admin/sw.js。
 */
const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");

/** controllerchange 只自动刷新一次，防止和别的标签页互相刷新 */
const RELOAD_GUARD = "gmr.sw.reloaded";

export function SwRegister() {
  const [needRefresh, setNeedRefresh] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(location.hostname)) return;

    const base = `${BASE_PATH}/`;
    const url = `${base}sw.js`;

    // 刷新完成 10 秒后清掉守卫，下次再出新版本还能自动接管
    if (sessionStorage.getItem(RELOAD_GUARD) === "1") {
      window.setTimeout(() => sessionStorage.removeItem(RELOAD_GUARD), 10_000);
    }

    // 新版本接管时：前台直接刷到新版；后台怕丢正在编辑的内容，改为点一下再刷新
    const onControllerChange = () => {
      if (!navigator.serviceWorker.controller) return;
      if (sessionStorage.getItem(RELOAD_GUARD) === "1") return;
      sessionStorage.setItem(RELOAD_GUARD, "1");
      if (location.pathname.includes("/admin")) setNeedRefresh(true);
      else location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const register = () => {
      navigator.serviceWorker
        // GitHub Pages 给 sw.js 带 max-age=600，绕过 HTTP 缓存才能及时拿到新版本
        .register(url, { scope: base, updateViaCache: "none" })
        .then((reg) => {
          // 每次打开都主动查一次更新；有新的就装、装完由 controllerchange 刷新
          reg.update().catch(() => null);
          // 回到前台时再查一次（老人平板常年不关页面）
          document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") reg.update().catch(() => null);
          });
        })
        .catch(() => {
          /* 注册失败不影响正常使用，只是没有离线能力 */
        });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  if (!needRefresh) return null;
  return (
    <button type="button" className="sw-refresh" onClick={() => location.reload()}>
      有新版本，点这里刷新
    </button>
  );
}



