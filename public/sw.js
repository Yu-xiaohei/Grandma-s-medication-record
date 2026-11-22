/* 用药管理器 · 离线优先 Service Worker
 * - 页面与静态资源优先走缓存，断网也能打开
 * - 数据请求不进缓存，交给页面里的 localStorage 队列
 * - 新版本在后台静默安装，下一次打开生效
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

  // 导航请求：先给缓存里的页面，做到秒开；同时后台更新
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        // /admin/ 这类以斜杠结尾的地址，缓存里存的是 admin/index.html
        const asIndex = url.pathname.endsWith("/") ? `${url.pathname}index.html` : url.pathname;
        const cached =
          (await cache.match(req)) ||
          (await cache.match(asIndex)) ||
          (await cache.match("./index.html")) ||
          (await cache.match("index.html"));
        const network = fetch(req)
          .then(async (res) => {
            if (res && res.ok) await cache.put(req, res.clone());
            return res;
          })
          .catch(() => null);
        return cached || (await network) || new Response("离线，且本机还没有缓存。请连网打开一次。", {
          status: 503,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
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