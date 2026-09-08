export type PixelRect = { left: number; top: number; right: number; bottom: number };

export type GridCellDetection = PixelRect & { confidence: number };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function luminance(data: Uint8ClampedArray, width: number, x: number, y: number): number {
  const i = (y * width + x) * 4;
  return (data[i] ?? 0) * 0.299 + (data[i + 1] ?? 0) * 0.587 + (data[i + 2] ?? 0) * 0.114;
}

/**
 * Refines a rough, user-drawn cell rectangle to the strongest nearby pairs
 * of vertical and horizontal edges. The gesture supplies the scale and
 * location prior, so symbol strokes elsewhere in the crop cannot win merely
 * because they are dark.
 */
export function detectGridCell(
  image: ImageData,
  rough: PixelRect,
): GridCellDetection | null {
  const roughWidth = Math.abs(rough.right - rough.left);
  const roughHeight = Math.abs(rough.bottom - rough.top);
  if (roughWidth < 3 || roughHeight < 3) return null;

  const data = image.data;
  const width = image.width;
  const height = image.height;
  const xPad = Math.max(3, Math.round(roughWidth * 0.4));
  const yPad = Math.max(3, Math.round(roughHeight * 0.4));
  const sampleTop = clamp(Math.floor(rough.top - yPad), 1, height - 2);
  const sampleBottom = clamp(Math.ceil(rough.bottom + yPad), 1, height - 2);
  const sampleLeft = clamp(Math.floor(rough.left - xPad), 1, width - 2);
  const sampleRight = clamp(Math.ceil(rough.right + xPad), 1, width - 2);

  // Score the centre of a continuous line against pixels far enough to
  // either side to represent the surrounding cell. A simple x+1/x-1 edge
  // derivative finds the *sides* of a grid stroke, which left every snapped
  // outline visibly one pixel off the line it was meant to follow.
  const xFlank = Math.max(2, Math.round(roughWidth * 0.12));
  const yFlank = Math.max(2, Math.round(roughHeight * 0.12));
  const verticalScore = (x: number) => {
    let score = 0;
    for (let y = sampleTop; y <= sampleBottom; y += 1) {
      const centre = luminance(data, width, x, y);
      const surround = (
        luminance(data, width, clamp(x - xFlank, 0, width - 1), y) +
        luminance(data, width, clamp(x + xFlank, 0, width - 1), y)
      ) / 2;
      score += Math.abs(centre - surround);
    }
    return score / Math.max(1, sampleBottom - sampleTop + 1);
  };
  const horizontalScore = (y: number) => {
    let score = 0;
    for (let x = sampleLeft; x <= sampleRight; x += 1) {
      const centre = luminance(data, width, x, y);
      const surround = (
        luminance(data, width, x, clamp(y - yFlank, 0, height - 1)) +
        luminance(data, width, x, clamp(y + yFlank, 0, height - 1))
      ) / 2;
      score += Math.abs(centre - surround);
    }
    return score / Math.max(1, sampleRight - sampleLeft + 1);
  };

  const bestNear = (
    expected: number,
    radius: number,
    limit: number,
    score: (position: number) => number,
  ) => {
    let best = clamp(Math.round(expected), 1, limit - 2);
    let bestScore = -1;
    const scores: number[] = [];
    for (let p = clamp(Math.floor(expected - radius), 1, limit - 2);
      p <= clamp(Math.ceil(expected + radius), 1, limit - 2); p += 1) {
      const value = score(p);
      scores.push(value);
      if (value > bestScore) { best = p; bestScore = value; }
    }
    scores.sort((a, b) => a - b);
    const baseline = scores[Math.floor(scores.length / 2)] || 1;
    return { position: best, confidence: bestScore / Math.max(1, baseline) };
  };

  const xRadius = Math.max(3, Math.round(roughWidth * 0.35));
  const yRadius = Math.max(3, Math.round(roughHeight * 0.35));
  const left = bestNear(rough.left, xRadius, width, verticalScore);
  const right = bestNear(rough.right, xRadius, width, verticalScore);
  const top = bestNear(rough.top, yRadius, height, horizontalScore);
  const bottom = bestNear(rough.bottom, yRadius, height, horizontalScore);

  const detectedWidth = right.position - left.position;
  const detectedHeight = bottom.position - top.position;
  if (detectedWidth < roughWidth * 0.45 || detectedWidth > roughWidth * 1.65 ||
      detectedHeight < roughHeight * 0.45 || detectedHeight > roughHeight * 1.65) return null;

  const confidence = Math.min(left.confidence, right.confidence, top.confidence, bottom.confidence);
  if (confidence < 1.18) return null;
  return { left: left.position, right: right.position, top: top.position, bottom: bottom.position, confidence };
}
