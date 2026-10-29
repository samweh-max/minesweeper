import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { MARK_FLAG, cellView, isOver, neighbors, type GameState } from '../engine';
import { Cell } from './Cell';

interface BoardProps {
  game: GameState;
  /** Touch flag mode: a tap flags instead of revealing. */
  flagMode: boolean;
  /** Reveal a closed cell or chord an opened number. */
  onActivate: (index: number) => void;
  /** Chord only (both mouse buttons or middle button). */
  onChord: (index: number) => void;
  onMark: (index: number) => void;
  /** True while a tile is held down, for the surprised face. */
  onPressChange: (pressing: boolean) => void;
}

interface Press {
  index: number | null;
  chord: boolean;
}

interface TouchState {
  id: number;
  x: number;
  y: number;
  index: number;
  timer: ReturnType<typeof setTimeout>;
  longPressed: boolean;
}

const LONG_PRESS_MS = 450;
const TOUCH_SLOP_PX = 10;
/** Mouse events that browsers emulate after a touch are ignored for this long. */
const TOUCH_MOUSE_GUARD_MS = 800;

function cellIndex(target: EventTarget | null): number | null {
  const el = target instanceof Element ? target.closest('[data-index]') : null;
  return el ? Number(el.getAttribute('data-index')) : null;
}

export function Board({ game, flagMode, onActivate, onChord, onMark, onPressChange }: BoardProps) {
  const { width, height } = game.config;
  const total = width * height;
  const over = isOver(game);

  const [press, setPressState] = useState<Press | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const pressRef = useRef<Press | null>(null);
  const mouse = useRef({ active: false, chord: false, consumed: false });
  const touch = useRef<TouchState | null>(null);
  const lastTouchAt = useRef(0);
  const moveFocus = useRef(false);
  // Focus rings only show while the board is driven by the keyboard.
  const [keyboardMode, setKeyboardMode] = useState(false);

  // Latest props for the window-level listeners.
  const latest = useRef({ game, onActivate, onChord, onMark, onPressChange });
  useLayoutEffect(() => {
    latest.current = { game, onActivate, onChord, onMark, onPressChange };
  });

  const setPress = useCallback((p: Press | null) => {
    pressRef.current = p;
    setPressState(p);
  }, []);

  const endPress = useCallback(() => {
    mouse.current = { active: false, chord: false, consumed: false };
    if (touch.current) clearTimeout(touch.current.timer);
    touch.current = null;
    if (pressRef.current) setPress(null);
    latest.current.onPressChange(false);
  }, [setPress]);

  // A new game or a finished game drops any half-finished press.
  useEffect(() => {
    endPress();
  }, [game.id, over, endPress]);

  useEffect(() => {
    if (focusIndex >= total) setFocusIndex(0);
  }, [focusIndex, total]);

  // Mouse releases are tracked on the window so a press dragged off the board ends cleanly.
  useEffect(() => {
    function onMouseUp(e: MouseEvent) {
      const m = mouse.current;
      if (!m.active) return;
      if (!m.consumed) {
        const index = pressRef.current?.index ?? null;
        if (m.chord) {
          if (index !== null) latest.current.onChord(index);
          m.consumed = true;
        } else if (e.button === 0) {
          if (index !== null) latest.current.onActivate(index);
          m.consumed = true;
        }
      }
      if ((e.buttons & 7) === 0) {
        endPress();
      } else if (m.consumed && pressRef.current) {
        // The other button is still down after a chord; it does nothing when released.
        setPress(null);
        latest.current.onPressChange(false);
      }
    }
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, [endPress, setPress]);

  // Touch panning is only allowed when the board is bigger than its window and
  // must be scrolled to reach every tile. Otherwise the board stays still.
  const [needsPan, setNeedsPan] = useState(false);
  useLayoutEffect(() => {
    const well = boardRef.current?.parentElement;
    if (!well) return;
    const measure = () =>
      setNeedsPan(well.scrollWidth > well.clientWidth + 1 || well.scrollHeight > well.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(well);
    ro.observe(boardRef.current!);
    return () => ro.disconnect();
  }, [width, height]);

  useEffect(() => () => {
    if (touch.current) clearTimeout(touch.current.timer);
  }, []);

  // ---- Mouse --------------------------------------------------------------

  function handleMouseDown(e: ReactMouseEvent) {
    if (Date.now() - lastTouchAt.current < TOUCH_MOUSE_GUARD_MS) return;
    const index = cellIndex(e.target);
    if (index === null) return;
    e.preventDefault(); // no text selection or middle-button autoscroll
    setKeyboardMode(false);
    (e.target as Element).closest<HTMLElement>('[data-index]')?.focus({ preventScroll: true });
    setFocusIndex(index);
    if (over) return;

    const buttons = e.buttons || (1 << [0, 2, 1][e.button]) || 0;
    const left = (buttons & 1) !== 0;
    const right = (buttons & 2) !== 0;
    const middle = e.button === 1 || (buttons & 4) !== 0;

    if (middle || (left && right)) {
      mouse.current = { active: true, chord: true, consumed: false };
      setPress({ index, chord: true });
      onPressChange(true);
    } else if (e.button === 2) {
      // Right button on its own: flag immediately, like the original.
      onMark(index);
    } else if (e.button === 0) {
      mouse.current = { active: true, chord: false, consumed: false };
      setPress({ index, chord: false });
      onPressChange(true);
    }
  }

  function handleMouseOver(e: ReactMouseEvent) {
    const m = mouse.current;
    if (!m.active || m.consumed) return;
    const index = cellIndex(e.target);
    if (index !== pressRef.current?.index) setPress({ index, chord: m.chord });
  }

  function handleMouseLeave() {
    const m = mouse.current;
    if (m.active && !m.consumed) setPress({ index: null, chord: m.chord });
  }

  // ---- Touch and pen --------------------------------------------------------

  function handlePointerDown(e: ReactPointerEvent) {
    if (e.pointerType === 'mouse') return;
    lastTouchAt.current = Date.now();
    setKeyboardMode(false);
    if (over || touch.current) return; // ignore extra fingers
    const index = cellIndex(e.target);
    if (index === null) return;
    setFocusIndex(index);
    const timer = setTimeout(() => {
      const t = touch.current;
      if (!t || t.id !== e.pointerId) return;
      t.longPressed = true;
      // A long press flags, whatever the current mode.
      if (!latest.current.game.revealed[t.index]) {
        latest.current.onMark(t.index);
        navigator.vibrate?.(15);
      }
      setPress(null);
      latest.current.onPressChange(false);
    }, LONG_PRESS_MS);
    touch.current = { id: e.pointerId, x: e.clientX, y: e.clientY, index, timer, longPressed: false };
    setPress({ index, chord: false });
    onPressChange(true);
  }

  function handlePointerMove(e: ReactPointerEvent) {
    const t = touch.current;
    if (!t || t.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > TOUCH_SLOP_PX) endPress(); // it's a scroll
  }

  function handlePointerUp(e: ReactPointerEvent) {
    const t = touch.current;
    if (!t || t.id !== e.pointerId) return;
    lastTouchAt.current = Date.now();
    clearTimeout(t.timer);
    if (!t.longPressed) {
      if (flagMode && !game.revealed[t.index]) onMark(t.index);
      else onActivate(t.index);
    }
    endPress();
  }

  function handlePointerCancel(e: ReactPointerEvent) {
    if (touch.current?.id === e.pointerId) endPress();
  }

  // ---- Keyboard -----------------------------------------------------------

  function handleKeyDown(e: KeyboardEvent) {
    if (!keyboardMode) setKeyboardMode(true);
    const x = focusIndex % width;
    const y = Math.floor(focusIndex / width);
    let next: number | null = null;
    switch (e.key) {
      case 'ArrowLeft':
        next = y * width + Math.max(0, x - 1);
        break;
      case 'ArrowRight':
        next = y * width + Math.min(width - 1, x + 1);
        break;
      case 'ArrowUp':
        next = Math.max(0, y - 1) * width + x;
        break;
      case 'ArrowDown':
        next = Math.min(height - 1, y + 1) * width + x;
        break;
      case 'Home':
        next = e.ctrlKey ? 0 : y * width;
        break;
      case 'End':
        next = e.ctrlKey ? total - 1 : y * width + width - 1;
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!over) {
          if (flagMode && !game.revealed[focusIndex]) onMark(focusIndex);
          else onActivate(focusIndex);
        }
        return;
      case 'f':
      case 'F':
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        if (!over) onMark(focusIndex);
        return;
      default:
        return;
    }
    e.preventDefault();
    moveFocus.current = true;
    setFocusIndex(next);
  }

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    const el = boardRef.current?.querySelector<HTMLElement>(`[data-index="${focusIndex}"]`);
    el?.focus();
  }, [focusIndex]);

  // When the grid itself gets focus (e.g. after a click), hand it to the current cell.
  function handleFocus(e: FocusEvent) {
    if (e.target === boardRef.current) {
      boardRef.current.querySelector<HTMLElement>(`[data-index="${focusIndex}"]`)?.focus({ preventScroll: true });
    }
  }

  // ---- Rendering ----------------------------------------------------------

  const pressed = useMemo(() => {
    const set = new Set<number>();
    if (!press || press.index === null || over) return set;
    const { index } = press;
    const closed = (i: number) => !game.revealed[i] && game.marks[i] !== MARK_FLAG;
    if (press.chord || game.revealed[index]) {
      for (const n of [index, ...neighbors(game.config, index)]) if (closed(n)) set.add(n);
    } else if (closed(index)) {
      set.add(index);
    }
    return set;
  }, [press, over, game]);

  const rows = [];
  for (let y = 0; y < height; y++) {
    const cells = [];
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      cells.push(
        <Cell key={i} index={i} x={x} y={y} view={cellView(game, i)} pressed={pressed.has(i)} focused={i === focusIndex} />,
      );
    }
    rows.push(
      <div role="row" className="board__row" key={y}>
        {cells}
      </div>,
    );
  }

  return (
    <div
      ref={boardRef}
      className={'board' + (flagMode ? ' board--flag-mode' : '') + (needsPan ? ' board--pannable' : '')}
      role="grid"
      aria-label={`Minefield, ${width} columns by ${height} rows`}
      aria-rowcount={height}
      aria-colcount={width}
      tabIndex={-1}
      data-keyboard={keyboardMode || undefined}
      onFocus={handleFocus}
      onKeyUp={(e) => e.key === 'Tab' && setKeyboardMode(true)}
      onMouseDown={handleMouseDown}
      onMouseOver={handleMouseOver}
      onMouseLeave={handleMouseLeave}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {rows}
    </div>
  );
}
