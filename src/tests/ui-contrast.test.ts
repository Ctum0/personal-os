import { describe, it, expect } from 'vitest';
import { contrastRatio, readableInk, readableSurface } from '@/lib/ui/contrast';

/**
 * Operator-supplied colors (project/category hues) must stay legible.
 * A mid-tone like indigo fails AA against both black and white ink, so the
 * helper is expected to darken the surface rather than emit unreadable text.
 */
describe('readable ink and surfaces', () => {
  it('picks the better ink for colors that have one', () => {
    expect(readableInk('#ffffff')).toBe('#09090b');
    expect(readableInk('#0a0a0b')).toBe('#fafafa');
    expect(contrastRatio(readableInk('#fbbf24'), '#fbbf24')).toBeGreaterThanOrEqual(4.5);
  });

  it('darkens a mid-tone surface until its label passes AA', () => {
    for (const color of ['#6366f1', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#eab308']) {
      const surface = readableSurface(color);
      const ratio = contrastRatio(surface.color, surface.background);
      expect(ratio, `${color} -> ${surface.background} / ${surface.color}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the operator hue recognisable instead of replacing it', () => {
    const surface = readableSurface('#6366f1');
    expect(surface.background).not.toBe('#6366f1');
    expect(surface.background.startsWith('#')).toBe(true);
    // Still blue-dominant after darkening, not a neutral gray.
    const r = Number.parseInt(surface.background.slice(1, 3), 16);
    const b = Number.parseInt(surface.background.slice(5, 7), 16);
    expect(b).toBeGreaterThan(r);
  });

  it('falls back to a neutral surface for unparseable input', () => {
    expect(readableSurface('not-a-color').background).toBe('#3f3f46');
  });
});
