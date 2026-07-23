// ---------------------------------------------------------------------------
// Connected-component analysis
// ---------------------------------------------------------------------------

/**
 * Find connected components in an alpha mask via flood-fill (4-connectivity).
 * Each component = one contiguous region of pixels with alpha >= threshold.
 * Returns bounding boxes + centroids + sizes. Used to locate each sticker's
 * true position from the ML matting output — far more accurate than equal-cell
 * slicing because AI grids drift (rows offset by tens of px from the ideal).
 */
export function findConnectedComponents(
  alpha: Uint8Array,
  width: number,
  height: number,
  threshold: number,
): Array<{ x0: number; y0: number; x1: number; y1: number; cx: number; cy: number; size: number }> {
  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  const blobs: Array<{ x0: number; y0: number; x1: number; y1: number; cx: number; cy: number; size: number }> = [];
  for (let start = 0; start < alpha.length; start++) {
    if (visited[start] || alpha[start] < threshold) continue;
    stack.length = 0;
    stack.push(start);
    let size = 0, sumX = 0, sumY = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    while (stack.length) {
      const p = stack.pop()!;
      if (visited[p] || alpha[p] < threshold) continue;
      visited[p] = 1;
      const x = p % width, y = (p / width) | 0;
      size++; sumX += x; sumY += y;
      if (x < x0) x0 = x; if (y < y0) y0 = y;
      if (x > x1) x1 = x; if (y > y1) y1 = y;
      if (x > 0) stack.push(p - 1);
      if (x < width - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - width);
      if (y < height - 1) stack.push(p + width);
    }
    blobs.push({ x0, y0, x1, y1, cx: sumX / size, cy: sumY / size, size });
  }
  return blobs;
}
