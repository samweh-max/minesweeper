import { paint, pixelLayers, type PixelLayer } from './pixel';

// All tile sprites live on a 16 × 16 grid, the size of an original tile.

const DIGITS: Record<number, string[]> = {
  1: [
    '....xxx...',
    '...xxxx...',
    '..xxxxx...',
    '.xxxxxx...',
    '....xxx...',
    '....xxx...',
    '....xxx...',
    '....xxx...',
    '....xxx...',
    '....xxx...',
    '.xxxxxxxx.',
    '.xxxxxxxx.',
  ],
  2: [
    '.xxxxxxxx.',
    'xxxxxxxxxx',
    'xxx....xxx',
    '.......xxx',
    '......xxxx',
    '....xxxxx.',
    '..xxxxx...',
    '.xxxx.....',
    'xxxx......',
    'xxx.......',
    'xxxxxxxxxx',
    'xxxxxxxxxx',
  ],
  3: [
    'xxxxxxxxx.',
    'xxxxxxxxxx',
    '.......xxx',
    '.......xxx',
    '.......xxx',
    '..xxxxxxx.',
    '..xxxxxxx.',
    '.......xxx',
    '.......xxx',
    '.......xxx',
    'xxxxxxxxxx',
    'xxxxxxxxx.',
  ],
  4: [
    '..xxx.....',
    '..xxx.....',
    '.xxx......',
    '.xxx..xxx.',
    'xxx...xxx.',
    'xxx...xxx.',
    'xxxxxxxxxx',
    'xxxxxxxxxx',
    '......xxx.',
    '......xxx.',
    '......xxx.',
    '......xxx.',
  ],
  5: [
    'xxxxxxxxxx',
    'xxxxxxxxxx',
    'xxx.......',
    'xxx.......',
    'xxxxxxxxx.',
    'xxxxxxxxxx',
    '.......xxx',
    '.......xxx',
    '.......xxx',
    'xxx....xxx',
    'xxxxxxxxxx',
    '.xxxxxxxx.',
  ],
  6: [
    '.xxxxxxxx.',
    'xxxxxxxxxx',
    'xxx.......',
    'xxx.......',
    'xxxxxxxxx.',
    'xxxxxxxxxx',
    'xxx....xxx',
    'xxx....xxx',
    'xxx....xxx',
    'xxx....xxx',
    'xxxxxxxxxx',
    '.xxxxxxxx.',
  ],
  7: [
    'xxxxxxxxxx',
    'xxxxxxxxxx',
    '.......xxx',
    '......xxx.',
    '......xxx.',
    '.....xxx..',
    '.....xxx..',
    '....xxx...',
    '....xxx...',
    '...xxx....',
    '...xxx....',
    '...xxx....',
  ],
  8: [
    '.xxxxxxxx.',
    'xxxxxxxxxx',
    'xxx....xxx',
    'xxx....xxx',
    'xxx....xxx',
    '.xxxxxxxx.',
    '.xxxxxxxx.',
    'xxx....xxx',
    'xxx....xxx',
    'xxx....xxx',
    'xxxxxxxxxx',
    '.xxxxxxxx.',
  ],
};

const QUESTION = [
  '.xxxxxxxx.',
  'xxxxxxxxxx',
  'xxx....xxx',
  '.......xxx',
  '......xxxx',
  '....xxxxx.',
  '....xxx...',
  '....xxx...',
  '..........',
  '....xxx...',
  '....xxx...',
  '..........',
];

const MINE = [
  '......b......',
  '......b......',
  '..b.bbbbb.b..',
  '...bbbbbbb...',
  '..bbwwbbbbb..',
  '..bbwwbbbbb..',
  'bbbbbbbbbbbbb',
  '..bbbbbbbbb..',
  '..bbbbbbbbb..',
  '...bbbbbbb...',
  '..b.bbbbb.b..',
  '......b......',
  '......b......',
];

// A red cross over the mine for a flag that was placed on a safe cell.
const CROSS: Array<[number, number]> = [];
for (let i = 0; i < 13; i++) {
  CROSS.push([i, i], [i + 1, i], [12 - i, i], [11 - i, i]);
}
const WRONG_MINE = paint(MINE, CROSS, 'r');

const FLAG = [
  '................',
  '................',
  '................',
  '......rrb.......',
  '....rrrrb.......',
  '...rrrrrb.......',
  '....rrrrb.......',
  '......rrb.......',
  '........b.......',
  '........b.......',
  '......bbbb......',
  '....bbbbbbbb....',
  '....bbbbbbbb....',
  '................',
];

const BASE = { b: '#000000', w: '#ffffff', r: '#ff0000' };

export const mineLayers = pixelLayers(MINE, BASE, 2, 2);
export const wrongMineLayers = pixelLayers(WRONG_MINE, BASE, 2, 2);
export const flagLayers = pixelLayers(FLAG, BASE, 0, 0);
export const questionLayers = pixelLayers(QUESTION, { x: '#000000' }, 3, 2);

const digitCache = new Map<string, PixelLayer[]>();
export function digitLayers(n: number, color: string): PixelLayer[] {
  const key = `${n}:${color}`;
  let layers = digitCache.get(key);
  if (!layers) {
    layers = pixelLayers(DIGITS[n], { x: color }, 3, 2);
    digitCache.set(key, layers);
  }
  return layers;
}

// ---------------------------------------------------------------------------
// Faces (17 × 17, drawn inside the 26 × 26 face button)
// ---------------------------------------------------------------------------

const FACE_BASE = [
  '......bbbbb......',
  '....bbyyyyybb....',
  '...byyyyyyyyyb...',
  '..byyyyyyyyyyyb..',
  '.byyyyyyyyyyyyyb.',
  '.byyyyyyyyyyyyyb.',
  'byyyyyyyyyyyyyyyb',
  'byyyyyyyyyyyyyyyb',
  'byyyyyyyyyyyyyyyb',
  'byyyyyyyyyyyyyyyb',
  'byyyyyyyyyyyyyyyb',
  '.byyyyyyyyyyyyyb.',
  '.byyyyyyyyyyyyyb.',
  '..byyyyyyyyyyyb..',
  '...byyyyyyyyyb...',
  '....bbyyyyybb....',
  '......bbbbb......',
];

const EYES: Array<[number, number]> = [
  [5, 5], [6, 5], [5, 6], [6, 6],
  [10, 5], [11, 5], [10, 6], [11, 6],
];
const SMILE: Array<[number, number]> = [
  [4, 10], [12, 10], [5, 11], [11, 11], [6, 12], [7, 12], [8, 12], [9, 12], [10, 12],
];

const smile = paint(paint(FACE_BASE, EYES, 'b'), SMILE, 'b');

const surprised = paint(
  paint(FACE_BASE, [[5, 5], [6, 5], [5, 6], [6, 6], [5, 7], [6, 7], [10, 5], [11, 5], [10, 6], [11, 6], [10, 7], [11, 7]], 'b'),
  [[7, 10], [8, 10], [9, 10], [6, 11], [10, 11], [6, 12], [10, 12], [7, 13], [8, 13], [9, 13]],
  'b',
);

const cool = paint(
  paint(
    FACE_BASE,
    [
      [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [11, 5], [12, 5], [13, 5], [14, 5],
      [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [9, 6], [10, 6], [11, 6], [12, 6], [13, 6],
      [4, 7], [5, 7], [6, 7], [10, 7], [11, 7], [12, 7],
    ],
    'b',
  ),
  SMILE,
  'b',
);

const dead = paint(
  FACE_BASE,
  [
    // X eyes
    [4, 4], [6, 4], [5, 5], [4, 6], [6, 6],
    [10, 4], [12, 4], [11, 5], [10, 6], [12, 6],
    // frown
    [6, 11], [7, 11], [8, 11], [9, 11], [10, 11], [5, 12], [11, 12], [4, 13], [12, 13],
  ],
  'b',
);

const FACE_PALETTE = { b: '#000000', y: '#ffff00' };

export type FaceKind = 'smile' | 'surprised' | 'cool' | 'dead';

export const faceLayers: Record<FaceKind, PixelLayer[]> = {
  smile: pixelLayers(smile, FACE_PALETTE),
  surprised: pixelLayers(surprised, FACE_PALETTE),
  cool: pixelLayers(cool, FACE_PALETTE),
  dead: pixelLayers(dead, FACE_PALETTE),
};
