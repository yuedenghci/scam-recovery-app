/* 最小占位 Service Worker：满足 Chrome 「安装到主屏幕」对 SW 的基本要求，暂不实现离线缓存。 */
const SW_VERSION = "pwa-sw-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(Promise.resolve().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.resolve().then(async () => {
      // 占位：不进行 cache 清理
      await self.clients.claim();
    }),
  );
});

self.addEventListener("fetch", (event) => {
  void SW_VERSION;
  // 放行所有网络请求
  event.respondWith(fetch(event.request));
});
