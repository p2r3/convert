import { signal } from "@preact/signals";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "downloaded"
  | "error";

export interface UpdateState {
  status: UpdateStatus;
  /** False in dev builds and in Linux builds that aren't run as an AppImage */
  supported: boolean;
  /** False on macOS, where updates are downloaded manually from the release page */
  canInstall: boolean;
  autoUpdate: boolean;
  progress: number;
}

export interface DesktopUpdater {
  getState: () => Promise<UpdateState | null>;
  check: () => Promise<void>;
  setAutoUpdate: (enabled: boolean) => Promise<void>;
  install: () => Promise<void>;
  openRelease: () => Promise<void>;
  onState: (callback: (state: UpdateState) => void) => () => void;
}

export const desktopUpdater = window.desktopUpdater;

/** Null outside the desktop app */
export const Update = signal<UpdateState | null>(null);

if (desktopUpdater) {
  desktopUpdater.onState((state) => {
    Update.value = state;
  });
  // Don't overwrite a newer state pushed while this was in flight
  desktopUpdater.getState().then((state) => {
    if (state && !Update.value) Update.value = state;
  });
}
