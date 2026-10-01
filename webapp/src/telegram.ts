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

interface LocationManager {
  isInited: boolean;
  isLocationAvailable: boolean;
  isAccessRequested: boolean;
  isAccessGranted: boolean;
  init(callback?: () => void): LocationManager;
  getLocation(callback: (location: { latitude: number; longitude: number } | null) => void): LocationManager;
  openSettings(): LocationManager;
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
  LocationManager?: LocationManager;
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

export interface Coordinates {
  lat: number;
  lng: number;
}

/** Current location via Telegram's LocationManager (Bot API 8.0+), else the browser's geolocation. */
export function getLocation(): Promise<Coordinates> {
  const lm = tg?.LocationManager;
  if (lm && tg?.isVersionAtLeast("8.0")) {
    return new Promise((resolve, reject) => {
      const ask = () => {
        if (!lm.isLocationAvailable) return reject(new Error("Location isn't available on this device."));
        lm.getLocation((loc) => {
          if (loc) resolve({ lat: loc.latitude, lng: loc.longitude });
          else {
            // Denied earlier: Telegram only re-asks from its settings screen.
            if (lm.isAccessRequested && !lm.isAccessGranted) lm.openSettings();
            reject(new Error("Location access was denied. Allow it for this Mini App and try again."));
          }
        });
      };
      if (lm.isInited) ask();
      else lm.init(ask);
    });
  }
  return new Promise((resolve, reject) =>
    navigator.geolocation
      ? navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          (e) => reject(new Error(`Location unavailable: ${e.message}`)),
          { enableHighAccuracy: true, timeout: 15000 },
        )
      : reject(new Error("Location isn't available here.")),
  );
}
