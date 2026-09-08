import { useTouchKeyboardHint } from "./useTouchKeyboardHint";

/**
 * Scribble and a paired hardware keyboard can both keep iPadOS from ever
 * raising the on-screen keyboard over a stitch search field - genuine OS
 * settings this app has no way to override. Pointing at Settings once is
 * the most useful thing to do about it.
 */
export function KeyboardHintBanner() {
  const [show, dismiss] = useTouchKeyboardHint();
  if (!show) return null;

  return (
    <div className="banner banner--info">
      <span>
        Keyboard not appearing when typing in a stitch search? Turn off <strong>Scribble</strong> in
        Settings → Apple Pencil, and make sure no hardware keyboard is connected or paired.
      </span>
      <button type="button" className="btn" onClick={dismiss}>
        Got it
      </button>
    </div>
  );
}
