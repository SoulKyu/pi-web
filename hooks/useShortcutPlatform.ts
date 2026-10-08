"use client";

import { useSyncExternalStore } from "react";
import { detectShortcutPlatform, type ShortcutPlatform } from "@/lib/shortcut-label";

const subscribe = () => () => {};
const getSnapshot = (): ShortcutPlatform => detectShortcutPlatform(navigator);
const getServerSnapshot = (): ShortcutPlatform => "other";

/** The platform shortcut hints are written for; "other" while rendering on the server. */
export function useShortcutPlatform(): ShortcutPlatform {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
