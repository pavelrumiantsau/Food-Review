// Minimal typing for the parts of window.Telegram.WebApp we use.
interface TelegramWebApp {
  initData: string;
  platform: string;
  version: string;
  ready(): void;
  expand(): void;
  HapticFeedback?: { notificationOccurred(type: "success" | "error" | "warning"): void };
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export const tg: TelegramWebApp | undefined = window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : undefined;

export async function api<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Authorization: `tma ${tg?.initData ?? ""}` } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as T;
}
