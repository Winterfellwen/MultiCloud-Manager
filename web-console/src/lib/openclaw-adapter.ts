// OpenClaw Lit Web Component 适配器
// 动态加载 openclaw-ui 构建产物，注册 <cloudops-chat> 自定义元素

let loaded = false;
let loadingPromise: Promise<void> | null = null;

/**
 * 动态加载 cloudops-chat.js（IIFE bundle）
 * 加载完成后 <cloudops-chat> 自定义元素自动注册
 */
export async function loadCloudOpsChat(): Promise<void> {
  if (loaded) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    // 开发环境从 openclaw-ui/dist 加载，生产环境从 public 目录加载
    const isDev = import.meta.env.DEV;
    const scriptSrc = isDev
      ? '/openclaw-ui/dist/cloudops-chat.js'
      : '/cloudops-chat.js';

    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = scriptSrc;
      script.async = true;
      script.onload = () => {
        loaded = true;
        resolve();
      };
      script.onerror = () => {
        reject(new Error(`Failed to load ${scriptSrc}`));
      };
      document.head.appendChild(script);
    });
  })();

  return loadingPromise;
}

declare global {
  interface HTMLElementTagNameMap {
    'cloudops-chat': HTMLElement;
  }
}
