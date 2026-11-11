import type { Adjustments } from '../domain/model';
export function transformPixels(data: Uint8ClampedArray, a: Adjustments) {
  const exp = 2 ** a.exposure,
    c = 1 + a.contrast / 100,
    s = 1 + a.saturation / 100,
    t = a.temperature / 100;
  for (let i = 0; i < data.length; i += 4) {
    let r = (data[i] / 255) ** 2.2 * exp,
      g = (data[i + 1] / 255) ** 2.2 * exp,
      b = (data[i + 2] / 255) ** 2.2 * exp;
    const l = Math.min(1, Math.max(0, 0.2126 * r + 0.7152 * g + 0.0722 * b)),
      shift = (a.shadows / 100) * 0.22 * (1 - l) ** 2 + (a.highlights / 100) * 0.22 * l * l;
    r = (Math.max(0, r + shift) ** (1 / 2.2) + t * 0.08 - 0.5) * c + 0.5;
    g = (Math.max(0, g + shift) ** (1 / 2.2) + t * 0.015 - 0.5) * c + 0.5;
    b = (Math.max(0, b + shift) ** (1 / 2.2) - t * 0.08 - 0.5) * c + 0.5;
    const grey = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    data[i] = (grey + (r - grey) * s) * 255;
    data[i + 1] = (grey + (g - grey) * s) * 255;
    data[i + 2] = (grey + (b - grey) * s) * 255;
  }
  return data;
}
