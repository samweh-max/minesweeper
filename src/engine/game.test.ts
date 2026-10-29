import { describe, expect, it } from 'vitest';
import {
  MARK_FLAG,
  MARK_NONE,
  PRESETS,
  activate,
  canChord,
  cellView,
  chord,
  computeCounts,
  createGame,
  createGameWithMines,
  createRng,
  displaySeconds,
  elapsedMs,
  generateMines,
  isValidConfig,
  neighbors,
  remainingMines,
  reveal,
  toggleMark,
  validateConfig,
  type BoardConfig,
  type GameState,
} from './index';

const at = (config: BoardConfig, x: number, y: number) => y * config.width + x;
const sum = (a: Uint8Array) => a.reduce((s, v) => s + v, 0);
const T0 = 1_000_000;

/** Reveals every safe cell (for building won states). */
function revealAllSafe(game: GameState): GameState {
  let g = game;
  for (let i = 0; i < g.revealed.length; i++) {
    if (!g.mines![i] && !g.revealed[i]) g = reveal(g, i, T0 + 5000, 1);
  }
  return g;
}

describe('neighbors', () => {
  const c = { width: 4, height: 3, mines: 0 };
  it('handles corners, edges and the interior', () => {
    expect(neighbors(c, at(c, 0, 0)).sort((a, b) => a - b)).toEqual([1, 4, 5]);
    expect(neighbors(c, at(c, 3, 2)).sort((a, b) => a - b)).toEqual([6, 7, 10]);
    expect(neighbors(c, at(c, 1, 0))).toHaveLength(5);
    expect(neighbors(c, at(c, 0, 1))).toHaveLength(5);
    expect(neighbors(c, at(c, 1, 1))).toHaveLength(8);
  });
  it('does not wrap around rows', () => {
    // (3,0) is the end of row 0; (0,1) is the start of row 1 and must not be a neighbour.
    expect(neighbors(c, at(c, 3, 0))).not.toContain(at(c, 0, 1));
    expect(neighbors(c, at(c, 0, 1))).not.toContain(at(c, 3, 0));
  });
  it('handles one-cell and one-row boards', () => {
    expect(neighbors({ width: 1, height: 1, mines: 0 }, 0)).toEqual([]);
    expect(neighbors({ width: 5, height: 1, mines: 0 }, 2).sort()).toEqual([1, 3]);
  });
});

describe('validateConfig', () => {
  it('accepts the presets and minimal boards', () => {
    for (const p of Object.values(PRESETS)) expect(isValidConfig(p)).toBe(true);
    expect(isValidConfig({ width: 1, height: 1, mines: 0 })).toBe(true);
    expect(isValidConfig({ width: 2, height: 1, mines: 1 })).toBe(true);
    expect(isValidConfig({ width: 100, height: 100, mines: 9999 })).toBe(true);
  });
  it('rejects bad sizes and mine counts with a message per field', () => {
    expect(validateConfig({ width: 0, height: 5, mines: 1 }).width).toMatch(/between 1 and 100/);
    expect(validateConfig({ width: 101, height: 5, mines: 1 }).width).toBeDefined();
    expect(validateConfig({ width: 5.5, height: 5, mines: 1 }).width).toMatch(/whole number/);
    expect(validateConfig({ width: 5, height: NaN, mines: 1 }).height).toMatch(/number/);
    expect(validateConfig({ width: 5, height: 5, mines: -1 }).mines).toMatch(/negative/);
    expect(validateConfig({ width: 5, height: 5, mines: 2.5 }).mines).toMatch(/whole/);
    expect(validateConfig({ width: 5, height: 5, mines: 25 }).mines).toMatch(/at most 24/);
    expect(validateConfig({ width: 1, height: 1, mines: 1 }).mines).toBeDefined();
  });
  it('refuses to create an invalid game', () => {
    expect(() => createGame({ width: 3, height: 3, mines: 9 })).toThrow();
  });
});

describe('generateMines', () => {
  it('places exactly the requested mines with the board dimensions', () => {
    for (const p of Object.values(PRESETS)) {
      for (let seed = 0; seed < 20; seed++) {
        const mines = generateMines(p, 0, createRng(seed));
        expect(mines).toHaveLength(p.width * p.height);
        expect(sum(mines)).toBe(p.mines);
        expect(mines.every((v) => v === 0 || v === 1)).toBe(true); // one mine per cell at most
      }
    }
  });

  it('keeps the first cell and its neighbours clear when there is room', () => {
    const c = PRESETS.expert;
    for (let seed = 0; seed < 50; seed++) {
      const start = (seed * 37) % (c.width * c.height);
      const mines = generateMines(c, start, createRng(seed));
      expect(mines[start]).toBe(0);
      for (const n of neighbors(c, start)) expect(mines[n]).toBe(0);
    }
  });

  it('protects only the clicked cell on dense boards, never looping', () => {
    const c = { width: 3, height: 3, mines: 8 };
    for (let start = 0; start < 9; start++) {
      const mines = generateMines(c, start, createRng(start));
      expect(mines[start]).toBe(0);
      expect(sum(mines)).toBe(8);
    }
    const big = { width: 100, height: 100, mines: 9999 };
    const mines = generateMines(big, 5050, createRng(1));
    expect(mines[5050]).toBe(0);
    expect(sum(mines)).toBe(9999);
  });

  it('is deterministic for a seed and varies between seeds', () => {
    const c = PRESETS.intermediate;
    expect(generateMines(c, 0, createRng(42))).toEqual(generateMines(c, 0, createRng(42)));
    const layouts = new Set<string>();
    for (let seed = 0; seed < 10; seed++) layouts.add(generateMines(c, 0, createRng(seed)).join(''));
    expect(layouts.size).toBe(10);
  });
});

describe('computeCounts', () => {
  it('counts all eight neighbours, including at edges and corners', () => {
    const c = { width: 4, height: 4, mines: 4 };
    // Mines at (0,0), (3,0), (1,1), (3,3)
    const g = createGameWithMines(c, [at(c, 0, 0), at(c, 3, 0), at(c, 1, 1), at(c, 3, 3)]);
    const counts = g.counts!;
    expect(counts[at(c, 1, 0)]).toBe(2); // (0,0) and (1,1)
    expect(counts[at(c, 2, 0)]).toBe(2); // (3,0) and (1,1)
    expect(counts[at(c, 0, 1)]).toBe(2);
    expect(counts[at(c, 2, 1)]).toBe(2);
    expect(counts[at(c, 0, 3)]).toBe(0);
    expect(counts[at(c, 2, 2)]).toBe(2); // (1,1) and (3,3)
    expect(counts[at(c, 3, 2)]).toBe(1);
    expect(counts[at(c, 2, 3)]).toBe(1);
  });
  it('matches a brute-force count on random boards', () => {
    const c = PRESETS.expert;
    const mines = generateMines(c, 100, createRng(7));
    const counts = computeCounts(c, mines);
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < c.width && ny < c.height && mines[ny * c.width + nx]) n++;
          }
        expect(counts[at(c, x, y)]).toBe(n);
      }
    }
  });
});

describe('first click', () => {
  it('is always safe and starts the game and clock', () => {
    for (let seed = 0; seed < 200; seed++) {
      const g0 = createGame(PRESETS.expert);
      const start = (seed * 13) % 480;
      const g = reveal(g0, start, T0, seed);
      expect(g.status === 'playing' || g.status === 'won').toBe(true);
      expect(g.revealed[start]).toBe(1);
      expect(g.startTime).toBe(T0);
      expect(g.counts![start]).toBe(0); // protected area means it opens an area
      expect(g.revealedCount).toBeGreaterThan(1);
    }
  });
  it('is safe on boards with only one free cell', () => {
    const g = reveal(createGame({ width: 2, height: 2, mines: 3 }), 3, T0, 9);
    expect(g.status).toBe('won');
    expect(g.mines![3]).toBe(0);
  });
  it('wins at once on a board with no mines, flooding the whole board without recursion', () => {
    const g = reveal(createGame({ width: 100, height: 100, mines: 0 }), 0, T0, 1);
    expect(g.status).toBe('won');
    expect(g.revealedCount).toBe(10000);
  });
  it('does not start the clock before the first reveal', () => {
    const g = createGame(PRESETS.beginner);
    expect(g.status).toBe('ready');
    expect(g.startTime).toBeNull();
    expect(elapsedMs(g, T0 + 10_000)).toBe(0);
    const flagged = toggleMark(g, 0, false);
    expect(flagged.status).toBe('ready');
    expect(flagged.startTime).toBeNull();
  });
});

describe('reveal and flood fill', () => {
  // 5 x 5, mines at (4,0) and (4,1). Left side is empty.
  const c = { width: 5, height: 5, mines: 2 };
  const mines = [at(c, 4, 0), at(c, 4, 1)];

  it('reveals just a numbered cell', () => {
    const g = reveal(createGameWithMines(c, mines), at(c, 3, 0), T0, 0);
    expect(g.revealedCount).toBe(1);
    expect(cellView(g, at(c, 3, 0))).toEqual({ kind: 'open', count: 2 });
  });

  it('floods empty areas and their numbered border', () => {
    const g = reveal(createGameWithMines(c, mines), at(c, 0, 4), T0, 0);
    // Everything except the two mines opens.
    expect(g.revealedCount).toBe(23);
    expect(g.status).toBe('won');
  });

  it('stops at flags and keeps them', () => {
    let g = createGameWithMines(c, mines);
    g = toggleMark(g, at(c, 0, 0), false);
    g = reveal(g, at(c, 0, 4), T0, 0);
    expect(g.revealed[at(c, 0, 0)]).toBe(0);
    expect(g.marks[at(c, 0, 0)]).toBe(MARK_FLAG);
    expect(g.status).toBe('playing');
  });

  it('opens question-marked cells during a flood', () => {
    let g = createGameWithMines(c, mines);
    g = toggleMark(g, at(c, 0, 0), true);
    g = toggleMark(g, at(c, 0, 0), true); // now "?"
    expect(cellView(g, at(c, 0, 0)).kind).toBe('question');
    g = reveal(g, at(c, 0, 4), T0, 0);
    expect(g.revealed[at(c, 0, 0)]).toBe(1);
    expect(g.marks[at(c, 0, 0)]).toBe(MARK_NONE);
  });

  it('ignores flagged and already open cells', () => {
    let g = createGameWithMines(c, mines);
    g = toggleMark(g, at(c, 4, 0), false);
    expect(reveal(g, at(c, 4, 0), T0, 0)).toBe(g);
    const opened = reveal(g, at(c, 3, 0), T0, 0);
    expect(reveal(opened, at(c, 3, 0), T0, 0)).toBe(opened);
  });

  it('does not mutate the previous state', () => {
    const g = createGameWithMines(c, mines);
    const before = g.revealed.slice();
    reveal(g, at(c, 0, 4), T0, 0);
    expect(g.revealed).toEqual(before);
    expect(g.status).toBe('ready');
  });
});

describe('losing', () => {
  const c = { width: 3, height: 3, mines: 2 };
  const mines = [at(c, 0, 0), at(c, 2, 2)];

  function lostGame() {
    let g = createGameWithMines(c, mines);
    g = reveal(g, at(c, 1, 1), T0, 0);
    g = toggleMark(g, at(c, 2, 2), false); // correct flag
    g = toggleMark(g, at(c, 2, 0), false); // wrong flag
    return reveal(g, at(c, 0, 0), T0 + 3000, 0);
  }

  it('ends the game when a mine is revealed', () => {
    const g = lostGame();
    expect(g.status).toBe('lost');
    expect(g.exploded).toEqual([0]);
    expect(g.endTime).toBe(T0 + 3000);
  });

  it('shows the exploded mine, other mines, and wrong flags', () => {
    const g = lostGame();
    expect(cellView(g, at(c, 0, 0)).kind).toBe('exploded');
    expect(cellView(g, at(c, 2, 2)).kind).toBe('flag');
    expect(cellView(g, at(c, 2, 0)).kind).toBe('wrong-flag');
    expect(cellView(g, at(c, 0, 2)).kind).toBe('hidden');
  });

  it('shows unflagged mines', () => {
    let g = createGameWithMines(c, mines);
    g = reveal(g, at(c, 1, 1), T0, 0);
    g = reveal(g, at(c, 0, 0), T0, 0);
    expect(cellView(g, at(c, 2, 2)).kind).toBe('mine');
  });

  it('blocks every action afterwards', () => {
    const g = lostGame();
    expect(reveal(g, at(c, 0, 2), T0, 0)).toBe(g);
    expect(toggleMark(g, at(c, 0, 2), false)).toBe(g);
    expect(chord(g, at(c, 1, 1), T0)).toBe(g);
    expect(activate(g, at(c, 1, 0), T0, 0)).toBe(g);
  });
});

describe('winning', () => {
  const c = { width: 4, height: 4, mines: 3 };
  const mines = [0, 5, 15];

  it('is detected when every safe cell is open, without needing flags', () => {
    const g = revealAllSafe(createGameWithMines(c, mines));
    expect(g.status).toBe('won');
    expect(g.endTime).toBe(T0 + 5000);
  });

  it('flags every mine and zeroes the counter', () => {
    const g = revealAllSafe(createGameWithMines(c, mines));
    expect(remainingMines(g)).toBe(0);
    for (const m of mines) expect(cellView(g, m).kind).toBe('flag');
  });

  it('blocks actions afterwards', () => {
    const g = revealAllSafe(createGameWithMines(c, mines));
    expect(toggleMark(g, 0, false)).toBe(g);
    expect(reveal(g, 0, T0, 0)).toBe(g);
  });
});

describe('flags and the mine counter', () => {
  it('cycles flag → none, or flag → ? → none with marks on', () => {
    const g = createGame(PRESETS.beginner);
    const f = toggleMark(g, 4, false);
    expect(f.marks[4]).toBe(MARK_FLAG);
    expect(remainingMines(f)).toBe(9);
    expect(toggleMark(f, 4, false).marks[4]).toBe(MARK_NONE);
    const q = toggleMark(f, 4, true);
    expect(cellView(q, 4).kind).toBe('question');
    expect(remainingMines(q)).toBe(10);
    expect(toggleMark(q, 4, true).marks[4]).toBe(MARK_NONE);
  });

  it('can go negative', () => {
    let g = createGame({ width: 5, height: 5, mines: 1 });
    for (let i = 0; i < 4; i++) g = toggleMark(g, i, false);
    expect(remainingMines(g)).toBe(-3);
  });

  it('cannot flag an open cell', () => {
    const c = { width: 3, height: 1, mines: 1 };
    let g = createGameWithMines(c, [2]);
    g = reveal(g, 1, T0, 0);
    expect(toggleMark(g, 1, false)).toBe(g);
  });
});

describe('chording', () => {
  // 3 x 3 with mines at (0,0) and (2,0). Centre shows 2.
  const c = { width: 3, height: 3, mines: 2 };
  const centre = at(c, 1, 1);

  function opened() {
    return reveal(createGameWithMines(c, [at(c, 0, 0), at(c, 2, 0)]), centre, T0, 0);
  }

  it('opens the other neighbours when the flags match the number', () => {
    let g = opened();
    expect(g.counts![centre]).toBe(2);
    expect(canChord(g, centre)).toBe(false);
    g = toggleMark(g, at(c, 0, 0), false);
    g = toggleMark(g, at(c, 2, 0), false);
    expect(canChord(g, centre)).toBe(true);
    g = chord(g, centre, T0 + 1000);
    expect(g.status).toBe('won');
  });

  it('does nothing when the flag count does not match', () => {
    let g = opened();
    g = toggleMark(g, at(c, 0, 0), false);
    expect(chord(g, centre, T0)).toBe(g);
  });

  it('sets off a mine when a flag is wrong', () => {
    let g = opened();
    g = toggleMark(g, at(c, 0, 0), false);
    g = toggleMark(g, at(c, 1, 0), false); // wrong: (1,0) is safe, (2,0) is a mine
    g = chord(g, centre, T0 + 1000);
    expect(g.status).toBe('lost');
    expect(g.exploded).toEqual([at(c, 2, 0)]);
    expect(cellView(g, at(c, 1, 0)).kind).toBe('wrong-flag');
  });

  it('does nothing on closed cells, empty cells or before the game starts', () => {
    const g = opened();
    expect(chord(g, at(c, 0, 2), T0)).toBe(g);
    const fresh = createGame(c);
    expect(chord(fresh, 0, T0)).toBe(fresh);
  });

  it('is what activate does on an opened number', () => {
    let g = opened();
    g = toggleMark(g, at(c, 0, 0), false);
    g = toggleMark(g, at(c, 2, 0), false);
    expect(activate(g, centre, T0, 0).status).toBe('won');
  });
});

describe('restarting', () => {
  it('gives a clean board with a new id', () => {
    const a = reveal(createGame(PRESETS.beginner), 0, T0, 3);
    const b = createGame(PRESETS.beginner);
    expect(b.id).not.toBe(a.id);
    expect(b.status).toBe('ready');
    expect(b.revealedCount).toBe(0);
    expect(b.flagCount).toBe(0);
    expect(b.mines).toBeNull();
    expect(b.startTime).toBeNull();
  });
  it('produces different boards across normal new games', () => {
    const layouts = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const g = reveal(createGame(PRESETS.expert), 0, T0, Math.floor(Math.random() * 2 ** 32));
      layouts.add(g.mines!.join(''));
    }
    expect(layouts.size).toBeGreaterThan(1);
  });
});

describe('timer helpers', () => {
  it('measures from the first reveal and stops at the end', () => {
    let g = createGameWithMines({ width: 3, height: 1, mines: 1 }, [0]);
    g = reveal(g, 1, T0, 0); // shows 1, game continues
    expect(g.status).toBe('playing');
    expect(elapsedMs(g, T0 + 2500)).toBe(2500);
    g = reveal(g, 2, T0 + 4000, 0);
    expect(g.status).toBe('won');
    expect(elapsedMs(g, T0 + 99_999)).toBe(4000);
  });
  it('shows classic seconds: 1 straight away, capped at 999', () => {
    expect(displaySeconds(null)).toBe(0);
    expect(displaySeconds(0)).toBe(1);
    expect(displaySeconds(999)).toBe(1);
    expect(displaySeconds(1000)).toBe(2);
    expect(displaySeconds(5_000_000)).toBe(999);
  });
});
