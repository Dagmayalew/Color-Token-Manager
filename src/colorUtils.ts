export type RgbaColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

export function parseColor(value: string): RgbaColor | undefined {
  const trimmed = value.trim();
  const hex = trimmed.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hex) {
    const raw =
      hex[1].length === 3
        ? hex[1]
            .split('')
            .map((part) => `${part}${part}`)
            .join('')
        : hex[1];

    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
      a: 1,
    };
  }

  const rgb = trimmed.match(/^rgba?\((.*)\)$/i);
  if (rgb) {
    const parts = rgb[1].split(',').map((part) => part.trim());
    if (parts.length !== 3 && parts.length !== 4) {
      return undefined;
    }

    const [r, g, b] = parts.slice(0, 3).map(Number);
    const a = parts.length === 4 ? Number(parts[3]) : 1;
    if (![r, g, b, a].every(Number.isFinite)) {
      return undefined;
    }

    return {
      r: clampChannel(r),
      g: clampChannel(g),
      b: clampChannel(b),
      a: Math.max(0, Math.min(1, a)),
    };
  }

  const hsl = trimmed.match(/^hsla?\((.*)\)$/i);
  if (!hsl) {
    return undefined;
  }

  const parts = hsl[1].split(',').map((part) => part.trim());
  if (parts.length !== 3 && parts.length !== 4) {
    return undefined;
  }

  const h = Number(parts[0]);
  const s = parsePercent(parts[1]);
  const l = parsePercent(parts[2]);
  const a = parts.length === 4 ? Number(parts[3]) : 1;
  if (![h, s, l, a].every(Number.isFinite)) {
    return undefined;
  }

  return hslToRgba(h, s, l, Math.max(0, Math.min(1, a)));
}

export function getContrastRatio(
  foregroundValue: string,
  backgroundValue: string,
): number | undefined {
  const background = parseColor(backgroundValue);
  const foreground = parseColor(foregroundValue);
  if (!foreground || !background) {
    return undefined;
  }

  const opaqueBackground =
    background.a < 1 ? blend(background, { r: 255, g: 255, b: 255, a: 1 }) : background;
  const opaqueForeground = foreground.a < 1 ? blend(foreground, opaqueBackground) : foreground;
  const foregroundLuminance = getRelativeLuminance(opaqueForeground);
  const backgroundLuminance = getRelativeLuminance(opaqueBackground);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

export function getSwatchBorderColor(value: string): string {
  const color = parseColor(value);
  if (!color) {
    return 'rgba(128, 128, 128, 0.6)';
  }

  return getRelativeLuminance(color) > 0.6 ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.55)';
}

export function isColorDark(value: string): boolean {
  const color = parseColor(value);
  return color ? getRelativeLuminance(color) < 0.45 : false;
}

function blend(foreground: RgbaColor, background: RgbaColor): RgbaColor {
  const alpha = foreground.a + background.a * (1 - foreground.a);
  if (alpha === 0) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  return {
    r: Math.round(
      (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
    ),
    g: Math.round(
      (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
    ),
    b: Math.round(
      (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
    ),
    a: alpha,
  };
}

function getRelativeLuminance(color: RgbaColor): number {
  const [r, g, b] = [color.r, color.g, color.b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parsePercent(value: string): number {
  if (!value.endsWith('%')) {
    return Number.NaN;
  }

  return Number(value.slice(0, -1)) / 100;
}

function hslToRgba(hue: number, saturation: number, lightness: number, alpha: number): RgbaColor {
  const h = (((hue % 360) + 360) % 360) / 360;
  const s = Math.max(0, Math.min(1, saturation));
  const l = Math.max(0, Math.min(1, lightness));

  if (s === 0) {
    const channel = clampChannel(l * 255);
    return { r: channel, g: channel, b: channel, a: alpha };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: clampChannel(hueToRgb(p, q, h + 1 / 3) * 255),
    g: clampChannel(hueToRgb(p, q, h) * 255),
    b: clampChannel(hueToRgb(p, q, h - 1 / 3) * 255),
    a: alpha,
  };
}

function hueToRgb(p: number, q: number, t: number): number {
  let channel = t;
  if (channel < 0) {
    channel += 1;
  }

  if (channel > 1) {
    channel -= 1;
  }

  if (channel < 1 / 6) {
    return p + (q - p) * 6 * channel;
  }

  if (channel < 1 / 2) {
    return q;
  }

  if (channel < 2 / 3) {
    return p + (q - p) * (2 / 3 - channel) * 6;
  }

  return p;
}
