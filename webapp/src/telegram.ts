// Minimal typing for the parts of window.Telegram.WebApp we use.
// Methods return their object for chaining; typed as such so TypeScript catches
// accidentally returning one from a React effect (it would be called as a cleanup).
interface BackButton {
  show(): BackButton;
  hide(): BackButton;
  onClick(cb: () => void): BackButton;
  offClick(cb: () => void): BackButton;
}

interface HapticFeedback {
  notificationOccurred(type: "success" | "error" | "warning"): HapticFeedback;
  selectionChanged(): HapticFeedback;
}

interface TelegramWebApp {
  initData: string;
  platform: string;
  version: string;
  ready(): void;
  expand(): void;
  isVersionAtLeast(version: string): boolean;
  showConfirm(message: string, callback: (ok: boolean) => void): void;
  BackButton: BackButton;
  HapticFeedback: HapticFeedback;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export const tg: TelegramWebApp | undefined = window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : undefined;

export const haptic = {
  success: () => void tg?.HapticFeedback.notificationOccurred("success"),
  error: () => void tg?.HapticFeedback.notificationOccurred("error"),
  select: () => void tg?.HapticFeedback.selectionChanged(),
};

/** Native Telegram confirm dialog, falling back to window.confirm outside Telegram. */
export function confirmDialog(message: string): Promise<boolean> {
  if (tg?.isVersionAtLeast("6.2")) return new Promise((resolve) => tg.showConfirm(message, resolve));
  return Promise.resolve(window.confirm(message));
}
