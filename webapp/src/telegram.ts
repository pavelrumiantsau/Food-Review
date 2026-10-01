// Minimal typing for the parts of window.Telegram.WebApp we use.
interface TelegramWebApp {
  initData: string;
  platform: string;
  version: string;
  ready(): void;
  expand(): void;
  isVersionAtLeast(version: string): boolean;
  showConfirm(message: string, callback: (ok: boolean) => void): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback: {
    notificationOccurred(type: "success" | "error" | "warning"): void;
    selectionChanged(): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export const tg: TelegramWebApp | undefined = window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : undefined;

export const haptic = {
  success: () => tg?.HapticFeedback.notificationOccurred("success"),
  error: () => tg?.HapticFeedback.notificationOccurred("error"),
  select: () => tg?.HapticFeedback.selectionChanged(),
};

/** Native Telegram confirm dialog, falling back to window.confirm outside Telegram. */
export function confirmDialog(message: string): Promise<boolean> {
  if (tg?.isVersionAtLeast("6.2")) return new Promise((resolve) => tg.showConfirm(message, resolve));
  return Promise.resolve(window.confirm(message));
}
