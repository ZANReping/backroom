/** OpenGL tangent normal, identical Sobel/wrap/rounding to the authored Canvas path. */
export function normalPixels(src: Uint8ClampedArray, w: number, h: number, strength = 2): Uint8ClampedArray<ArrayBuffer> {
  if (w < 1 || h < 1 || src.length !== w * h * 4 || !Number.isFinite(strength)) throw new Error('Invalid normal source')
  const out = new Uint8ClampedArray(w * h * 4)
  const H = (x: number, y: number) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x - 1, y) - H(x - 1, y + 1)) * strength
    const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x, y - 1) - H(x + 1, y - 1)) * strength
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4
    out[i] = (-dx / l * .5 + .5) * 255; out[i + 1] = (dy / l * .5 + .5) * 255
    out[i + 2] = (1 / l * .5 + .5) * 255; out[i + 3] = 255
  }
  return out
}
