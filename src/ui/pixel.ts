/**
 * Turns small text bitmaps into SVG path data, so every icon in the game is
 * drawn as crisp pixel art that scales cleanly with the window zoom.
 * Each character in a row is one pixel; '.' is transparent.
 */
export interface PixelLayer {
  fill: string;
  d: string;
}

export function pixelLayers(
  rows: readonly string[],
  palette: Readonly<Record<string, string>>,
  offsetX = 0,
  offsetY = 0,
): PixelLayer[] {
  const paths = new Map<string, string[]>();
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.' || !(ch in palette)) {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      const list = paths.get(ch) ?? [];
      list.push(`M${x + offsetX} ${y + offsetY}h${end - x}v1h-${end - x}z`);
      paths.set(ch, list);
      x = end;
    }
  });
  return [...paths.entries()].map(([ch, parts]) => ({ fill: palette[ch], d: parts.join('') }));
}

/** Returns a copy of `rows` with the given pixels replaced by `ch`. */
export function paint(rows: readonly string[], pixels: ReadonlyArray<readonly [number, number]>, ch: string): string[] {
  const grid = rows.map((r) => r.split(''));
  for (const [x, y] of pixels) {
    if (grid[y] && x >= 0 && x < grid[y].length) grid[y][x] = ch;
  }
  return grid.map((r) => r.join(''));
}
