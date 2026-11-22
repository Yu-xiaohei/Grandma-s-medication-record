import { DEFAULT_TASKS } from "../../lib/schedule";
import { AUTO_MISS_NOTE, autoSkipAt } from "../../lib/rules";
import { DEFAULT_TAGS } from "../../lib/types";
import type { Settings, Task, TaskRecord } from "../../lib/types";

type Env = {
  DB: D1Database;
  TOKEN_SECRET: string;
  PASSWORD_PEPPER: string;
  ALLOWED_ORIGINS?: string;
  SETUP_TOKEN?: string;
};

const TZ = "Asia/Shanghai";
const SESSION_TTL = 12 * 60 * 60 * 1000;
const FAMILY_TTL = 7 * 24 * 60 * 60 * 1000;
const LOCK_MINUTES = 15;
const MAX_ATTEMPTS = 8;

/* ------------------------------------------------------------------ */
/* 时间                                                                */
/* ------------------------------------------------------------------ */

const dtf = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function shanghaiParts(d = new Date()) {
  const parts = dtf.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: hour * 60 + Number(get("minute")),
  };
}

function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + delta * 86400000);
  return t.toISOString().slice(0, 10);
}

/** 依据「每天几点切天」换算当前生效的自然日 */
function effectiveDay(settings: Settings, now = new Date()): string {
  const { date, minutes } = shanghaiParts(now);
  const [h, m] = (settings.dayStart || "00:00").split(":").map(Number);
  return minutes < h * 60 + m ? addDays(date, -1) : date;
}

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64url(new Uint8Array(sig));
}

/** 口令摘要：HMAC(pepper, salt|username|password)。选快速方案是为了留在 Workers 免费版 CPU 额度内。 */
async function digest(pepper: string, salt: string, username: string, password: string) {
  return hmac(pepper, `${salt}|${username.toLowerCase()}|${password}`);
}

function randomSalt(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return b64url(b);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}

function bad(error: string, message: string, status = 400, extra: Record<string, unknown> = {}) {
  return json({ ok: false, error, message, ...extra }, status);
}

function cors(env: Env, request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const allow = allowed.length === 0 || allowed.includes("*") || allowed.includes(origin);
  return {
    "access-control-allow-origin": allow && origin ? origin : allowed[0] || "*",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-setup-token",
    "access-control-expose-headers": "x-renew-token,x-renew-expires",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

/* ------------------------------------------------------------------ */
/* 会话                                                                */
/* ------------------------------------------------------------------ */

type Role = "family" | "admin";
type Session = { role: Role; exp: number };

async function signToken(env: Env, role: Role, ttl: number): Promise<{ token: string; expiresAt: string }> {
  const exp = Math.floor((Date.now() + ttl) / 1000);
  const body = `v1.${role}.${exp}`;
  const sig = await hmac(env.TOKEN_SECRET, body);
  return { token: `${body}.${sig}`, expiresAt: new Date(exp * 1000).toISOString() };
}

async function verifyToken(env: Env, token: string | null): Promise<Session | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const [, role, expRaw, sig] = parts;
  if (role !== "family" && role !== "admin") return null;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  const expect = await hmac(env.TOKEN_SECRET, `v1.${role}.${expRaw}`);
  if (!timingSafeEqual(expect, sig)) return null;
  return { role, exp };
}

function bearer(request: Request): string | null {
  const h = request.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

/* ------------------------------------------------------------------ */
/* 设置 / 排程                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_SETTINGS: Settings = {
  dayStart: "00:00",
  vitalsEnabled: false,
  pinEnabled: true,
  announcementEnabled: true,
  autoSkipRemainPct: 70,
  tagPresets: DEFAULT_TAGS,
};

async function readSettings(env: Env): Promise<Settings> {
  const { results } = await env.DB.prepare("SELECT key, value FROM settings").all<{
    key: string;
    value: string;
  }>();
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const row of results || []) {
    if (row.key in out) {
      try {
        (out as Record<string, unknown>)[row.key] = JSON.parse(row.value);
      } catch {
        /* 忽略损坏的值，用默认 */
      }
    }
  }
  return out;
}

async function writeSetting(env: Env, key: string, value: unknown) {
  await env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  )
    .bind(key, JSON.stringify(value))
    .run();
}

/** 取 day 当天生效的排程：day <= 目标日里最新的一条快照 */
function safeTasks(raw: string): Task[] {
  try {
    const parsed = JSON.parse(raw) as Task[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_TASKS;
  } catch {
    return DEFAULT_TASKS;
  }
}

async function tasksForDay(env: Env, day: string): Promise<Task[]> {
  const row = await env.DB.prepare(
    "SELECT tasks FROM day_plans WHERE day <= ? ORDER BY day DESC LIMIT 1",
  )
    .bind(day)
    .first<{ tasks: string }>();
  if (!row) {
    await env.DB.prepare(
      "INSERT INTO day_plans (day, tasks, updated_at, updated_by) VALUES (?, ?, ?, ?)",
    )
      .bind("1970-01-01", JSON.stringify(DEFAULT_TASKS), new Date().toISOString(), "seed")
      .run();
    return DEFAULT_TASKS;
  }
  try {
    return JSON.parse(row.tasks) as Task[];
  } catch {
    return DEFAULT_TASKS;
  }
}

/* ------------------------------------------------------------------ */
/* 服务端兜底：整天没人打开前台，也要把「已跳过」记下来                  */
/* ------------------------------------------------------------------ */

/**
 * 按前端同一条规则（距下一项只剩 remainPct% 的时间）补记「未完成」。
 * 只补今天，只插入不覆盖：已经有记录（前台打过卡、后台补录过）的一律不动。
 */
async function backfillAutoMissed(env: Env, day: string, tasks: Task[], settings: Settings) {
  const nowMin = shanghaiParts().minutes;
  const sorted = [...tasks].sort((a, b) => a.time.localeCompare(b.time));
  const targets: Task[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const at = autoSkipAt(sorted[i], sorted[i + 1] ?? null, settings.autoSkipRemainPct);
    if (at != null && nowMin >= at) targets.push(sorted[i]);
  }
  if (targets.length === 0) return;
  const now = new Date().toISOString();
  // 当天被手动删掉（cleared）的项不再补记，否则历史里又冒出来
  const stmt = env.DB.prepare(
    `INSERT INTO records (day, task_id, status, items, vitals, note, source, updated_at, updated_by)
     SELECT ?, ?, 'missed', '{}', NULL, ?, 'front', ?, 'system'
     WHERE NOT EXISTS (
       SELECT 1 FROM record_events
       WHERE day = ? AND task_id = ? AND action = 'cleared'
     )
     ON CONFLICT(day, task_id) DO NOTHING`,
  );
  await env.DB.batch(targets.map((t) => stmt.bind(day, t.id, AUTO_MISS_NOTE, now, day, t.id)));
}

/* ------------------------------------------------------------------ */
/* 限流                                                                */
/* ------------------------------------------------------------------ */

async function checkLock(env: Env, key: string) {
  const row = await env.DB.prepare("SELECT count, locked_to FROM login_attempts WHERE key = ?")
    .bind(key)
    .first<{ count: number; locked_to: string | null }>();
  if (!row?.locked_to) return null;
  if (new Date(row.locked_to).getTime() > Date.now()) return row.locked_to;
  return null;
}

async function noteFailure(env: Env, key: string) {
  const now = new Date();
  const row = await env.DB.prepare("SELECT count, first_at FROM login_attempts WHERE key = ?")
    .bind(key)
    .first<{ count: number; first_at: string }>();
  const withinHour =
    row && now.getTime() - new Date(row.first_at).getTime() < 60 * 60 * 1000;
  const count = withinHour ? row!.count + 1 : 1;
  const firstAt = withinHour ? row!.first_at : now.toISOString();
  const lockedTo =
    count >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCK_MINUTES * 60000).toISOString() : null;
  await env.DB.prepare(
    `INSERT INTO login_attempts (key, count, first_at, locked_to) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET count = excluded.count, first_at = excluded.first_at, locked_to = excluded.locked_to`,
  )
    .bind(key, count, firstAt, lockedTo)
    .run();
  return lockedTo;
}

async function clearFailures(env: Env, key: string) {
  await env.DB.prepare("DELETE FROM login_attempts WHERE key = ?").bind(key).run();
}

/* ------------------------------------------------------------------ */
/* 校验                                                                */
/* ------------------------------------------------------------------ */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const KINDS = new Set(["food", "med", "water"]);

function validateTasks(input: unknown): Task[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > 40) return null;
  const out: Task[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return null;
    const t = raw as Record<string, unknown>;
    const id = String(t.id ?? "").trim();
    const time = String(t.time ?? "").trim();
    const title = String(t.title ?? "").trim();
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(id) || seen.has(id)) return null;
    if (!TIME_RE.test(time) || !title || title.length > 40) return null;
    const items = Array.isArray(t.items) ? t.items : [];
    if (items.length === 0 || items.length > 12) return null;
    const seenItem = new Set<string>();
    const parsedItems = [];
    for (const it of items) {
      const o = it as Record<string, unknown>;
      const iid = String(o.id ?? "").trim();
      const label = String(o.label ?? "").trim();
      const kind = String(o.kind ?? "");
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(iid) || seenItem.has(iid)) return null;
      if (!label || label.length > 60 || !KINDS.has(kind)) return null;
      const tag = o.tag == null ? null : String(o.tag).slice(0, 20);
      parsedItems.push({ id: iid, kind: kind as "food" | "med" | "water", label, tag });
      seenItem.add(iid);
    }
    seen.add(id);
    const period = ["morning", "noon", "afternoon", "evening"].includes(String(t.period))
      ? (t.period as Task["period"])
      : "morning";
    out.push({
      id,
      time,
      title,
      period,
      note: t.note ? String(t.note).slice(0, 200) : null,
      items: parsedItems,
    });
  }
  out.sort((a, b) => a.time.localeCompare(b.time));
  return out;
}

/* ------------------------------------------------------------------ */
/* 路由                                                                */
/* ------------------------------------------------------------------ */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const corsHeaders = cors(env, request);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const withCors = (res: Response) => {
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
      return new Response(res.body, { status: res.status, headers });
    };

    try {
      const res = await route(request, env, path, url);
      const out = withCors(res);

      // 管理员 12 小时滑动续期：只要还在用，就把到期时间往回推
      const token = bearer(request);
      const current = token ? await verifyToken(env, token) : null;
      if (current?.role === "admin" && current.exp * 1000 - Date.now() < SESSION_TTL - 60_000) {
        const fresh = await signToken(env, "admin", SESSION_TTL);
        out.headers.set("x-renew-token", fresh.token);
        out.headers.set("x-renew-expires", fresh.expiresAt);
      }
      return out;
    } catch (err) {
      console.error("unhandled", err);
      return withCors(bad("server_error", "服务器出错了，请稍后再试", 500));
    }
  },
};

async function route(request: Request, env: Env, path: string, url: URL): Promise<Response> {
  const method = request.method;

  if (path === "/health") return json({ ok: true, time: new Date().toISOString() });

  /* ---------------- 一次性初始化 ---------------- */

  // 只在 admins 表为空时可用；配了 SETUP_TOKEN 就必须带上，防止被人抢先占号。
  if (path === "/api/setup" && method === "POST") {
    if (env.SETUP_TOKEN) {
      const given = request.headers.get("x-setup-token") || "";
      if (!timingSafeEqual(given, env.SETUP_TOKEN)) return bad("forbidden", "初始化口令不对", 403);
    }
    const existing = await env.DB.prepare("SELECT COUNT(*) AS n FROM admins").first<{ n: number }>();
    if ((existing?.n ?? 0) > 0) return bad("already_setup", "已经初始化过了", 409);

    const body = (await request.json().catch(() => ({}))) as {
      username?: string;
      password?: string;
      pin?: string;
    };
    const username = "admin";
    const shownName = String(body.username ?? "Admin").trim() || "Admin";
    const password = String(body.password ?? "Admin12345678");
    const pin = String(body.pin ?? "0000");
    if (password.length < 10) return bad("weak_password", "密码至少 10 位");
    if (!/^\d{4,8}$/.test(pin)) return bad("bad_pin_format", "口令需要 4~8 位数字");

    const salt = randomSalt();
    const hash = await digest(env.PASSWORD_PEPPER, salt, username, password);
    await env.DB.prepare(
      "INSERT INTO admins (username, password_hash, salt, updated_at) VALUES (?, ?, ?, ?)",
    )
      .bind(username, hash, salt, new Date().toISOString())
      .run();

    const pinSalt = randomSalt();
    await writeSetting(env, "pinHash", {
      salt: pinSalt,
      hash: await digest(env.PASSWORD_PEPPER, pinSalt, "pin", pin),
    });
    await writeSetting(env, "dayStart", DEFAULT_SETTINGS.dayStart);
    await writeSetting(env, "vitalsEnabled", DEFAULT_SETTINGS.vitalsEnabled);
    await writeSetting(env, "pinEnabled", DEFAULT_SETTINGS.pinEnabled);
    await writeSetting(env, "announcementEnabled", DEFAULT_SETTINGS.announcementEnabled);
    await writeSetting(env, "autoSkipRemainPct", DEFAULT_SETTINGS.autoSkipRemainPct);
    await tasksForDay(env, effectiveDay(DEFAULT_SETTINGS));

    return json({ ok: true, username: shownName, hint: "请尽快在后台修改口令和密码" });
  }

  /* ---------------- 认证 ---------------- */

  if (path === "/api/auth/pin" && method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { pin?: string };
    const pin = String(body.pin ?? "");
    if (!/^\d{4,8}$/.test(pin)) return bad("bad_pin_format", "请输入正确的口令");

    const key = "pin";
    const locked = await checkLock(env, key);
    if (locked) {
      return bad("locked", "口令错误次数过多，请稍后再试", 429, { lockedUntil: locked });
    }

    const settings = await readSettings(env);
    if (!settings.pinEnabled) {
      const token = await signToken(env, "family", FAMILY_TTL);
      return json({ ok: true, role: "family", ...token });
    }

    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'pinHash'").first<{
      value: string;
    }>();
    const stored = row?.value ? (JSON.parse(row.value) as { salt: string; hash: string }) : null;
    if (!stored) {
      return bad("pin_not_set", "还没有设置口令，请联系管理员", 409);
    }
    const hash = await digest(env.PASSWORD_PEPPER, stored.salt, "pin", pin);
    if (!timingSafeEqual(hash, stored.hash)) {
      const lockedTo = await noteFailure(env, key);
      return bad("wrong_pin", "口令不对，请再试一次", 401, lockedTo ? { lockedUntil: lockedTo } : {});
    }
    await clearFailures(env, key);
    const token = await signToken(env, "family", FAMILY_TTL);
    return json({ ok: true, role: "family", ...token });
  }

  if (path === "/api/auth/admin" && method === "POST") {
    const body = (await request.json().catch(() => ({}))) as {
      username?: string;
      password?: string;
    };
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    if (!username || !password) return bad("bad_request", "请输入用户名和密码");

    const key = `admin:${username.toLowerCase()}`;
    const locked = await checkLock(env, key);
    if (locked) {
      return bad("locked", "错误次数过多，请稍后再试", 429, { lockedUntil: locked });
    }

    const row = await env.DB.prepare(
      "SELECT username, password_hash, salt FROM admins WHERE username = ?",
    )
      .bind(username.toLowerCase())
      .first<{ username: string; password_hash: string; salt: string }>();

    const hash = row
      ? await digest(env.PASSWORD_PEPPER, row.salt, row.username, password)
      : await digest(env.PASSWORD_PEPPER, "no-such-user", username, password);

    if (!row || !timingSafeEqual(hash, row.password_hash)) {
      const lockedTo = await noteFailure(env, key);
      return bad("wrong_credentials", "用户名或密码不对", 401, lockedTo ? { lockedUntil: lockedTo } : {});
    }
    await clearFailures(env, key);
    const token = await signToken(env, "admin", SESSION_TTL);
    return json({ ok: true, role: "admin", ...token });
  }

  /* ---------------- 以下都要登录 ---------------- */

  const session = await verifyToken(env, bearer(request));
  if (!session) return bad("unauthorized", "请先登录", 401);

  const settings = await readSettings(env);
  const today = effectiveDay(settings);
  const isAdmin = session.role === "admin";

  if (path === "/api/bootstrap" && method === "GET") {
    const requested = url.searchParams.get("day") || today;
    const day = DATE_RE.test(requested) ? requested : today;
    const tasks = await tasksForDay(env, day);

    // 整天没人打开过前台时，后台也要能看到该跳过的项
    if (day === today) await backfillAutoMissed(env, day, tasks, settings);

    const [{ results: records }, { results: anns }] = await Promise.all([
      env.DB.prepare("SELECT * FROM records WHERE day = ? ORDER BY task_id")
        .bind(day)
        .all<Record<string, string>>(),
      env.DB.prepare(
        `SELECT * FROM announcements
         WHERE archived = 0
           AND (active_from IS NULL OR active_from <= ?)
           AND (active_to IS NULL OR active_to >= ?)
         ORDER BY id DESC LIMIT 20`,
      )
        .bind(day, day)
        .all<Record<string, string>>(),
    ]);

    const parsedRecords: TaskRecord[] = (records || []).map((r) => ({
      day: r.day,
      taskId: r.task_id,
      status: r.status as "done" | "missed",
      items: JSON.parse(r.items || "{}"),
      vitals: r.vitals ? JSON.parse(r.vitals) : null,
      note: r.note,
      source: r.source as "front" | "admin",
      updatedAt: r.updated_at,
    }));

    return json({
      ok: true,
      serverTime: new Date().toISOString(),
      day,
      tasks,
      settings,
      records: parsedRecords,
      canEditToday: day === today,
      announcements: (anns || []).map((a) => ({
        id: Number(a.id),
        title: a.title,
        body: a.body,
        activeFrom: a.active_from,
        activeTo: a.active_to,
        createdAt: a.created_at,
      })),
    });
  }

  /* ---------------- 打卡记录 ---------------- */

  if (path === "/api/records" && method === "PUT") {
    const body = (await request.json().catch(() => ({}))) as {
      day?: string;
      taskId?: string;
      status?: string;
      items?: Record<string, string>;
      vitals?: unknown;
      note?: string;
    };
    const day = String(body.day || "");
    const taskId = String(body.taskId || "");
    const status = body.status === "done" || body.status === "missed" ? body.status : null;
    if (!DATE_RE.test(day) || !/^[A-Za-z0-9_-]{1,32}$/.test(taskId) || !status) {
      return bad("bad_request", "提交的数据不完整");
    }
    // 记录只能改「当前生效日」，过了切天就锁死
    if (day !== today) {
      return bad("locked_day", "这一天的记录已经锁定，不能再修改", 409);
    }

    const tasks = await tasksForDay(env, day);
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return bad("unknown_task", "找不到这一项任务", 404);

    // 未完成必须等过了时间 5 分钟，前台会拦，这里再兜一层
    if (!isAdmin && status === "missed") {
      const [hh, mm] = task.time.split(":").map(Number);
      if (shanghaiParts().minutes < hh * 60 + mm + 5) {
        return bad("too_early_missed", "到时间 5 分钟后才能记未完成", 409);
      }
    }

    const cleanItems: Record<string, "done" | "skipped" | "none"> = {};
    for (const item of task.items) {
      const st = body.items?.[item.id];
      cleanItems[item.id] = st === "done" || st === "skipped" ? st : "none";
    }

    const vitals = settings.vitalsEnabled && body.vitals && typeof body.vitals === "object"
      ? {
          hr: Number.isFinite(Number((body.vitals as Record<string, unknown>).hr))
            ? Number((body.vitals as Record<string, unknown>).hr)
            : null,
          sbp: Number.isFinite(Number((body.vitals as Record<string, unknown>).sbp))
            ? Number((body.vitals as Record<string, unknown>).sbp)
            : null,
          dbp: Number.isFinite(Number((body.vitals as Record<string, unknown>).dbp))
            ? Number((body.vitals as Record<string, unknown>).dbp)
            : null,
        }
      : null;

    const now = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO records (day, task_id, status, items, vitals, note, source, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(day, task_id) DO UPDATE SET
         status = excluded.status, items = excluded.items, vitals = excluded.vitals,
         note = excluded.note, source = excluded.source, updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    )
      .bind(
        day,
        taskId,
        status,
        JSON.stringify(cleanItems),
        vitals ? JSON.stringify(vitals) : null,
        body.note ? String(body.note).slice(0, 200) : null,
        isAdmin ? "admin" : "front",
        now,
        session.role,
      )
      .run();

    await env.DB.prepare(
      "INSERT INTO record_events (day, task_id, action, payload, actor, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(
        day,
        taskId,
        status,
        JSON.stringify({ items: cleanItems, vitals, note: body.note ?? null }),
        session.role,
        now,
      )
      .run();

    return json({
      ok: true,
      record: {
        day,
        taskId,
        status,
        items: cleanItems,
        vitals,
        note: body.note ?? null,
        source: isAdmin ? "admin" : "front",
        updatedAt: now,
      },
    });
  }

  if (path === "/api/records" && method === "DELETE") {
    const day = url.searchParams.get("day") || "";
    const taskId = url.searchParams.get("taskId") || "";
    if (!DATE_RE.test(day) || !taskId) return bad("bad_request", "参数不完整");
    if (day !== today) return bad("locked_day", "这一天的记录已经锁定，不能再修改", 409);

    await env.DB.prepare("DELETE FROM records WHERE day = ? AND task_id = ?").bind(day, taskId).run();
    await env.DB.prepare(
      "INSERT INTO record_events (day, task_id, action, payload, actor, created_at) VALUES (?, ?, 'cleared', '{}', ?, ?)",
    )
      .bind(day, taskId, session.role, new Date().toISOString())
      .run();
    return json({ ok: true });
  }

  /* ---------------- 管理员 ---------------- */

  if (!isAdmin) return bad("forbidden", "只有管理员可以做这个操作", 403);

  if (path === "/api/tasks" && method === "PUT") {
    const body = (await request.json().catch(() => ({}))) as {
      tasks?: unknown;
      effectiveFrom?: string;
    };
    const tasks = validateTasks(body.tasks);
    if (!tasks) return bad("bad_tasks", "排程内容不合法，请检查时间和名称");
    const from = DATE_RE.test(String(body.effectiveFrom || ""))
      ? String(body.effectiveFrom)
      : today;
    if (from < today) return bad("past_day", "只能修改今天及以后的排程", 409);

    await env.DB.prepare(
      `INSERT INTO day_plans (day, tasks, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(day) DO UPDATE SET tasks = excluded.tasks, updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    )
      .bind(from, JSON.stringify(tasks), new Date().toISOString(), session.role)
      .run();
    return json({ ok: true, tasks });
  }

  if (path === "/api/settings" && method === "PUT") {
    const body = (await request.json().catch(() => ({}))) as Partial<Settings>;
    if (body.dayStart !== undefined) {
      if (!TIME_RE.test(String(body.dayStart))) return bad("bad_time", "切天时间格式不对");
      await writeSetting(env, "dayStart", String(body.dayStart));
    }
    for (const key of ["vitalsEnabled", "pinEnabled", "announcementEnabled"] as const) {
      if (body[key] !== undefined) await writeSetting(env, key, Boolean(body[key]));
    }
    if (body.autoSkipRemainPct !== undefined) {
      const pct = Number(body.autoSkipRemainPct);
      if (!Number.isFinite(pct) || pct < 30 || pct > 95) return bad("bad_pct", "自动跳过比例要在 30~95 之间");
      await writeSetting(env, "autoSkipRemainPct", Math.round(pct));
    }
    if (body.tagPresets !== undefined) {
      if (!Array.isArray(body.tagPresets) || body.tagPresets.length > 40) {
        return bad("bad_tags", "标签最多 40 个");
      }
      const tags: string[] = [];
      for (const raw of body.tagPresets) {
        const t = String(raw ?? "").trim();
        if (!t) continue;
        if (t.length > 20) return bad("bad_tags", "单个标签最多 20 个字");
        if (!tags.includes(t)) tags.push(t);
      }
      await writeSetting(env, "tagPresets", tags);
    }
    return json({ ok: true, settings: await readSettings(env) });
  }

  if (path === "/api/admin/password" && method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { password?: string };
    const password = String(body.password ?? "");
    if (password.length < 10) return bad("weak_password", "密码至少 10 位");
    const salt = randomSalt();
    const hash = await digest(env.PASSWORD_PEPPER, salt, "admin", password);
    await env.DB.prepare("UPDATE admins SET password_hash = ?, salt = ?, updated_at = ? WHERE username = 'admin'")
      .bind(hash, salt, new Date().toISOString())
      .run();
    return json({ ok: true });
  }

  if (path === "/api/admin/pin" && method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { pin?: string };
    const pin = String(body.pin ?? "");
    if (!/^\d{4,8}$/.test(pin)) return bad("bad_pin_format", "口令需要 4~8 位数字");
    const salt = randomSalt();
    const hash = await digest(env.PASSWORD_PEPPER, salt, "pin", pin);
    await writeSetting(env, "pinHash", { salt, hash });
    return json({ ok: true });
  }

  if (path === "/api/announcements" && method === "POST") {
    const body = (await request.json().catch(() => ({}))) as {
      title?: string;
      body?: string;
      activeFrom?: string | null;
      activeTo?: string | null;
    };
    const title = String(body.title ?? "").trim().slice(0, 40);
    const text = String(body.body ?? "").trim().slice(0, 500);
    if (!title || !text) return bad("bad_request", "标题和内容都要填");
    const from = body.activeFrom && DATE_RE.test(body.activeFrom) ? body.activeFrom : null;
    const to = body.activeTo && DATE_RE.test(body.activeTo) ? body.activeTo : null;
    const res = await env.DB.prepare(
      `INSERT INTO announcements (title, body, active_from, active_to, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(title, text, from, to, new Date().toISOString(), session.role)
      .run();
    return json({ ok: true, id: res.meta.last_row_id });
  }

  const annMatch = path.match(/^\/api\/announcements\/(\d+)$/);
  if (annMatch && method === "DELETE") {
    await env.DB.prepare("UPDATE announcements SET archived = 1 WHERE id = ?")
      .bind(Number(annMatch[1]))
      .run();
    return json({ ok: true });
  }

  if (path === "/api/history" && method === "GET") {
    const from = url.searchParams.get("from") || addDays(today, -6);
    const to = url.searchParams.get("to") || today;
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) return bad("bad_request", "日期格式不对");
    const { results } = await env.DB.prepare(
      "SELECT * FROM records WHERE day BETWEEN ? AND ? ORDER BY day DESC, task_id",
    )
      .bind(from, to)
      .all<Record<string, string>>();
    const days = Array.from(new Set((results || []).map((r) => r.day)));

    // 历史里的任务名要按「那一天当时的排程」显示，不能拿今天的排程反查
    const { results: plans } = await env.DB.prepare(
      "SELECT day, tasks FROM day_plans WHERE day <= ? ORDER BY day ASC",
    )
      .bind(to)
      .all<{ day: string; tasks: string }>();
    const planList = (plans || []).map((p) => ({ day: p.day, tasks: safeTasks(p.tasks) }));
    const tasksByDay: Record<string, Task[]> = {};
    for (const d of days) {
      let best: Task[] | null = null;
      for (const p of planList) {
        if (p.day <= d) best = p.tasks;
        else break;
      }
      tasksByDay[d] = best ?? DEFAULT_TASKS;
    }

    return json({
      ok: true,
      days,
      tasksByDay,
      records: (results || []).map((r) => ({
        day: r.day,
        taskId: r.task_id,
        status: r.status,
        items: JSON.parse(r.items || "{}"),
        vitals: r.vitals ? JSON.parse(r.vitals) : null,
        note: r.note,
        source: r.source,
        updatedAt: r.updated_at,
      })),
    });
  }

  return bad("not_found", "接口不存在", 404);
}