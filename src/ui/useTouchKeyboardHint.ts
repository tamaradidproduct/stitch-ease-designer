import { useState } from "react";

const DISMISSED_KEY = "stitch-ease:dismissedKeyboardHint";

/**
 * iPadOS spoofs desktop Safari's UA and even its hover/pointer media
 * features (see the .panDock saga in styles.css) - maxTouchPoints is the one
 * signal that still tells an iPad apart from an actual Mac, which reports 0.
 */
const isLikelyIPad = typeof navigator !== "undefined" && navigator.maxTouchPoints > 1;

/**
 * Whether to show a one-time hint that Scribble, or a paired hardware
 * keyboard, can keep the on-screen keyboard from appearing over a search
 * field - both are iPadOS settings outside this app's control, so the best
 * it can do is point at Settings rather than leave someone stuck typing
 * into a field that never raises a keyboard.
 */
export function useTouchKeyboardHint(): [boolean, () => void] {
  const [dismissed, setDismissed] = useState(() => {
    if (!isLikelyIPad || typeof localStorage === "undefined") return true;
    try {
      return localStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Best-effort only - worst case the hint reappears next time.
    }
  };

  return [isLikelyIPad && !dismissed, dismiss];
}
