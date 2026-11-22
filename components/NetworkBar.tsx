"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeActivity } from "@/lib/api";

/**
 * 顶部一条细进度条：只要在和云端传数据（读排程、打卡、保存设置、取历史）就动起来，
 * 让「按下按钮之后到底有没有在跑」这件事一眼可见。
 */
export function NetworkBar() {
  const [on, setOn] = useState(false);
  const started = useRef<number>(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const stop = () => {
      if (timer.current !== undefined) {
        window.clearTimeout(timer.current);
        timer.current = undefined;
      }
      // 至少露 260ms，不然一闪一闪像屏幕抽了一下
      const left = 260 - (Date.now() - started.current);
      if (left > 0) {
        timer.current = window.setTimeout(() => setOn(false), left);
      } else {
        setOn(false);
      }
    };

    return subscribeActivity((n) => {
      if (n > 0) {
        if (started.current === 0) started.current = Date.now();
        if (timer.current !== undefined) {
          window.clearTimeout(timer.current);
          timer.current = undefined;
        }
        setOn(true);
        return;
      }
      started.current = 0;
      stop();
    });
  }, []);

  return (
    <div className={`net-bar ${on ? "on" : ""}`} aria-hidden="true">
      <span />
    </div>
  );
}
