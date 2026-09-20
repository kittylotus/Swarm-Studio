export const GENERATION_NOTIFICATIONS_STORAGE_KEY = "swarm-studio-generation-notifications-v1";

export type GenerationNotificationKind = "complete" | "review" | "inpaint" | "error";

export interface GenerationNotificationPayload {
  kind: GenerationNotificationKind;
  count?: number;
  message?: string;
}

export function generationNotificationsSupported(): boolean {
  return typeof window !== "undefined"
    && window.isSecureContext
    && typeof Notification !== "undefined"
    && typeof navigator !== "undefined"
    && "serviceWorker" in navigator;
}

export function shouldShowGenerationNotification(enabled: boolean, visibilityState: DocumentVisibilityState, hasFocus: boolean): boolean {
  return enabled && (visibilityState !== "visible" || !hasFocus);
}

export function generationNotificationCopy(payload: GenerationNotificationPayload): { title: string; body: string } {
  const count = Math.max(1, Math.floor(Number(payload.count) || 1));
  if (payload.kind === "error") {
    return {
      title: "Generation failed",
      body: String(payload.message || "Swarm could not finish the generation.").slice(0, 180),
    };
  }
  if (payload.kind === "review") {
    return {
      title: "Generation ready",
      body: `${count} result${count === 1 ? " is" : "s are"} ready for review.`,
    };
  }
  if (payload.kind === "inpaint") {
    return {
      title: "Inpaint complete",
      body: "Edited output is ready for review.",
    };
  }
  return {
    title: "Generation complete",
    body: `${count} output${count === 1 ? " is" : "s are"} ready in Library.`,
  };
}

export async function requestGenerationNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!generationNotificationsSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

export async function showGenerationNotification(payload: GenerationNotificationPayload): Promise<boolean> {
  if (!generationNotificationsSupported() || Notification.permission !== "granted") return false;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return false;
  const { title, body } = generationNotificationCopy(payload);
  await registration.showNotification(title, {
    body,
    icon: new URL("icon-192.png", window.location.href).href,
    tag: `swarm-studio-generation-${Date.now()}`,
    data: {
      source: "swarm-studio",
      url: new URL(".", window.location.href).href,
    },
  });
  return true;
}
