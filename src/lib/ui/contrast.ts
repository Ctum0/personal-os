/**
 * Readable ink for an arbitrary background color.
 *
 * Colors that reach the UI are operator data (category colors, project colors),
 * so no single text color satisfies WCAG AA against all of them. `#6366f1`
 * needs white ink; a pale yellow needs dark ink. This picks whichever of the two
 * has the higher contrast ratio and reports it, so callers can also fall back to
 * a neutral chip when even the better option fails.
 */

export interface InkChoice {
  color: string;
  contrast: number;
}

const DARK_INK = '#09090b';
const LIGHT_INK = '#fafafa';

/** Parses `#rgb`, `#rrggbb` and `rgb()/rgba()` into [r,g,b] (0-255). */
export function parseColor(value: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (hex) {
    const digits = hex[1];
    if (digits.length === 3) {
      return [
        Number.parseInt(digits[0] + digits[0], 16),
        Number.parseInt(digits[1] + digits[1], 16),
        Number.parseInt(digits[2] + digits[2], 16),
      ];
    }
    return [
      Number.parseInt(digits.slice(0, 2), 16),
      Number.parseInt(digits.slice(2, 4), 16),
      Number.parseInt(digits.slice(4, 6), 16),
    ];
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(value.trim());
  if (rgb) {
    const parts = rgb[1].split(',').map(part => Number.parseFloat(part.trim()));
    if (parts.length >= 3 && parts.slice(0, 3).every(part => Number.isFinite(part))) {
      return [parts[0], parts[1], parts[2]];
    }
  }
  return null;
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number): number => {
    const normalized = Math.min(255, Math.max(0, value)) / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(foreground: string, background: string): number {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg) return 0;
  const lightest = Math.max(relativeLuminance(fg), relativeLuminance(bg));
  const darkest = Math.min(relativeLuminance(fg), relativeLuminance(bg));
  return (lightest + 0.05) / (darkest + 0.05);
}

/** Picks the ink (near-black or near-white) with the better contrast on `background`. */
export function readableInk(background: string, fallback = LIGHT_INK): string {
  const dark = contrastRatio(DARK_INK, background);
  const light = contrastRatio(LIGHT_INK, background);
  const best = Math.max(dark, light);
  if (best < 4.5) return fallback;
  return dark >= light ? DARK_INK : LIGHT_INK;
}

/** Serializes [r,g,b] back to hex. */
function toHex([r, g, b]: [number, number, number]): string {
  const part = (value: number): string =>
    Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

export interface ReadableSurface {
  background: string;
  color: string;
}

/**
 * Makes an operator-supplied color usable as a text surface.
 *
 * Mid-tone hues (e.g. `#6366f1`) can fail AA against both black and white ink.
 * The surface is darkened in small steps until the lighter ink reaches 4.5:1, so
 * the operator's hue survives while the label stays legible.
 */
export function readableSurface(color: string): ReadableSurface {
  const parsed = parseColor(color);
  if (!parsed) return { background: '#3f3f46', color: LIGHT_INK };

  let surface = parsed;
  let ink = readableInk(toHex(surface));
  let ratio = contrastRatio(ink, toHex(surface));
  for (let step = 0; step < 20 && ratio < 4.5; step++) {
    surface = [surface[0] * 0.88, surface[1] * 0.88, surface[2] * 0.88];
    const candidate = toHex(surface);
    const candidateInk = readableInk(candidate);
    const candidateRatio = contrastRatio(candidateInk, candidate);
    if (candidateRatio > ratio) {
      ink = candidateInk;
      ratio = candidateRatio;
    }
  }
  return { background: toHex(surface), color: ink };
}
