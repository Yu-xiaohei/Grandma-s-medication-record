"use client";

/**
 * 以服务端时间为准的时钟。
 * 床头平板/老人手机的本地时间经常不准，偏差会被放大成「提前吃药」，
 * 所以每次从服务端拿到 bootstrap 就校准一次偏移量。
 */
let offsetMs = 0;

export function setServerTime(serverTime: string | undefined) {
  if (!serverTime) return;
  const t = Date.parse(serverTime);
  if (!Number.isFinite(t)) return;
  const delta = t - Date.now();
  // 偏差超过 2 分钟才校准，避免网络往返把时间推来推去
  if (Math.abs(delta) > 120_000) offsetMs = delta;
  else if (Math.abs(delta) > 5_000) offsetMs = delta;
}

export function now(): Date {
  return new Date(Date.now() + offsetMs);
}