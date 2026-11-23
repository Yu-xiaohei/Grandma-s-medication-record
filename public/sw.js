/* 用药管理器 · 离线可用 Service Worker
 * - 页面导航「网络优先」：有新版本立刻拿新的，断网才回落缓存
 * - 静态资源缓存优先（文件名带构建哈希，不会过期）
 * - 数据请求不进缓存，交给页面里的 localStorage 队列
 * - 新版本装好后立刻接管，页面自动刷新到新版
 */
const VERSION = "__BUILD_VERSION__";
const PRECACHE = __PRECACHE_LIST__;
const CACHE = `gmr-${VERSION}`;
const META_CACHE = "gmr-meta";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // 逐个 add，单个文件失败不至于整批失败
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: "reload" }));
          } catch (e) {
            /* 忽略单个失败 */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("gmr-") && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

function isApi(url) {
  // 后端在另一个域名；任何跨源请求都不走 SW 缓存
  return url.origin !== self.location.origin;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (isApi(url)) return;
  if (url.pathname.includes("/api/")) return;

  // 导航请求：网络优先（最多等 2.5 秒），拿不到再回落缓存，保证断网也能打开
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        // /admin/ 这类以斜杠结尾的地址，缓存里存的是 admin/index.html
        const asIndex = url.pathname.endsWith("/") ? `${url.pathname}index.html` : url.pathname;
        const fromCache = async () => {
          const hit =
            (await cache.match(req)) ||
            (await cache.match(asIndex)) ||
            (await cache.match("./index.html")) ||
            (await cache.match("index.html")) ||
            (await cache.match("admin/index.html"));
          return hit || null;
        };

        const network = fetch(req, { cache: "no-store" }).then(async (res) => {
          if (res && res.ok) {
            const copy = res.clone();
            event.waitUntil(cache.put(req, copy).catch(() => null));
          }
          return res;
        });

        const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 2500));
        const first = await Promise.race([network.catch(() => null), timeout]);
        if (first) return first;

        const cached = await fromCache();
        if (cached) {
          // 慢网络时缓存顶上，同时让网络请求继续跑完并写入缓存
          event.waitUntil(network.catch(() => null));
          return cached;
        }
        const late = await network.catch(() => null);
        return (
          late ||
          new Response("离线，且本机还没有缓存。请连网打开一次。", {
            status: 503,
            headers: { "content-type": "text/plain; charset=utf-8" },
          })
        );
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      if (cached) {
        // 后台刷新，下次打开用新的
        event.waitUntil(
          fetch(req)
            .then((res) => (res && res.ok ? cache.put(req, res.clone()) : null))
            .catch(() => null),
        );
        return cached;
      }
      try {
        const res = await fetch(req);
        if (res && res.ok && url.origin === self.location.origin) {
          const copy = res.clone();
          event.waitUntil(cache.put(req, copy));
        }
        return res;
      } catch (e) {
        return new Response("", { status: 504 });
      }
    })(),
  );
});

