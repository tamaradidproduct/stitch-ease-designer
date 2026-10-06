import type { ReferenceImage } from "./types";

export function makeReferenceImage(overrides: Partial<ReferenceImage> = {}): ReferenceImage {
  return {
    id: "image-1",
    number: 1,
    ref: "data:image/png;base64,x",
    x: 0,
    y: 0,
    width: 480,
    height: 360,
    naturalWidth: 480,
    naturalHeight: 360,
    opacity: 0.5,
    visible: true,
    locked: false,
    ...overrides,
  };
}
