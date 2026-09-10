declare module "@tauri-apps/api/core" {
  export function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

declare module "@tauri-apps/api/event" {
  export interface Event<T> {
    payload: T;
  }
  export type UnlistenFn = () => void;
  export function listen<T>(event: string, handler: (event: Event<T>) => void): Promise<UnlistenFn>;
}


declare module "@tauri-apps/api/window" {
  export interface WindowHandle {
    setIcon(icon: string | Uint8Array | number[] | ArrayBuffer): Promise<void>;
  }
  export function getCurrentWindow(): WindowHandle;
}
