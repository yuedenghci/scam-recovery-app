/* 最小占位 Service Worker：满足 Chrome 「安装到主屏幕」对 SW 的基本要求。
 * 不缓存 HTML/JS：仅 network-only，避免旧部署的 app shell 长期残留。
 * 升级 SW_VERSION 可强制已安装 PWA 尽快拉取新 sw.js 并清理历史 Cache Storage。 */
const SW_VERSION = "pwa-sw-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(Promise.resolve().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.resolve().then(async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {
        /* ignore */
      }
      await self.clients.claim();
    }),
  );
});

self.addEventListener("fetch", (event) => {
  void SW_VERSION;
  const req = event.request;
  if (req.method !== "GET") {
    event.respondWith(fetch(req));
    return;
  }
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(req));
    return;
  }
  const p = url.pathname;
  const accept = req.headers.get("Accept") ?? "";
  const isHtmlNavigation =
    req.mode === "navigate" || accept.includes("text/html");
  if (
    isHtmlNavigation ||
    p.startsWith("/_next/") ||
    p === "/sw.js" ||
    p.endsWith(".html")
  ) {
    event.respondWith(fetch(req, { cache: "no-store" }));
    return;
  }
  event.respondWith(fetch(req));
});
