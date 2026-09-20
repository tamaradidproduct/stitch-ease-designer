type Rect = Pick<DOMRect, "bottom" | "left" | "right" | "top">;

export interface ViewportBounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export function calculateViewportShift(rect: Rect, viewport: ViewportBounds, padding = 12) {
  const safeLeft = viewport.left + padding;
  const safeRight = viewport.right - padding;
  const safeTop = viewport.top + padding;
  const safeBottom = viewport.bottom - padding;
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;

  let x = 0;
  let y = 0;

  if (width > safeRight - safeLeft || rect.left < safeLeft) x = safeLeft - rect.left;
  else if (rect.right > safeRight) x = safeRight - rect.right;

  if (height > safeBottom - safeTop || rect.top < safeTop) y = safeTop - rect.top;
  else if (rect.bottom > safeBottom) y = safeBottom - rect.bottom;

  return { x, y };
}
