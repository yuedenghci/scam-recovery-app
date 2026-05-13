"use client";

import { useEffect } from "react";

/**
 * 在支持的浏览器注册 Service Worker（用于桌面/Android 上的「安装 Web 应用」；iOS Safari 仍可「添加到主屏幕」）。
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const onLoad = () => {
      void navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          void reg.update();
        })
        .catch(() => {
          /* 本地 http 或未配置 HTTPS 时会失败，可忽略 */
        });
    };

    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad);

    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
