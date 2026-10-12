import "../styles/fonts.css";

/** Sign-painted headings pair with quieter, readable Korean body text. */
export const FONT = '"Noto Sans KR", sans-serif';
export const FONT_DISPLAY = '"Do Hyeon", "Noto Sans KR", sans-serif';
export const TYPO = {
  small: `16px ${FONT}`,
  body: `18px ${FONT}`,
  label: `500 18px ${FONT}`,
  button: `22px ${FONT_DISPLAY}`,
  heading: `28px ${FONT_DISPLAY}`,
  title: `36px ${FONT_DISPLAY}`,
} as const;

/** Canvas must measure and paint only after both local typefaces are ready. */
export async function loadFonts(): Promise<void> {
  // A blocked font download must fall back to sans-serif, never block game startup.
  await Promise.allSettled([
    document.fonts.load(`18px ${FONT}`, "기관차 TRAIN 0123456789"),
    document.fonts.load(`600 18px ${FONT}`, "기관차 TRAIN 0123456789"),
    document.fonts.load(`24px ${FONT_DISPLAY}`, "기관차 TRAIN 0123456789"),
  ]);
}

/** Prefer word boundaries; long Korean words still wrap at a glyph boundary. */
export function wrapText(ctx: CanvasRenderingContext2D, value: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= width) { line = next; continue; }
      if (line) { lines.push(line); line = ""; }
      for (const char of word) {
        if (line && ctx.measureText(line + char).width > width) { lines.push(line); line = ""; }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}
