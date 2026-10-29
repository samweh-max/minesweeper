import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react';

type Axis = 'x' | 'y';

interface Metrics {
  x: { size: number; view: number; pos: number };
  y: { size: number; view: number; pos: number };
}

const STEP = 48; // three tiles per arrow press
const BAR = 16;

function arrowPath(dir: 'left' | 'right' | 'up' | 'down') {
  // Classic 7 × 4 black triangle, drawn as pixel rows.
  const rows = dir === 'left' || dir === 'right' ? 7 : 4;
  const parts: string[] = [];
  for (let i = 0; i < 4; i++) {
    const len = 7 - i * 2;
    if (dir === 'down') parts.push(`M${i} ${i}h${len}v1h-${len}z`);
    if (dir === 'up') parts.push(`M${3 - i} ${i}h${1 + i * 2}v1h-${1 + i * 2}z`);
    if (dir === 'right') parts.push(`M${i} ${i}v${len}h1v-${len}z`);
    if (dir === 'left') parts.push(`M${i} ${3 - i}v${1 + i * 2}h1v-${1 + i * 2}z`);
  }
  const w = dir === 'left' || dir === 'right' ? 4 : 7;
  return { d: parts.join(''), w, h: rows };
}

function Arrow({ dir }: { dir: 'left' | 'right' | 'up' | 'down' }) {
  const a = arrowPath(dir);
  return (
    <svg width={a.w} height={a.h} viewBox={`0 0 ${a.w} ${a.h}`} shapeRendering="crispEdges" aria-hidden="true">
      <path d={a.d} fill="currentColor" />
    </svg>
  );
}

/**
 * Wraps the board in its sunken frame. When the board is larger than the
 * window, classic scroll bars appear along the edges, so it is always clear
 * that more tiles lie beyond the visible area (phones hide native scroll bars).
 */
export function ScrollFrame({ children }: { children: ReactNode }) {
  const wellRef = useRef<HTMLDivElement>(null);
  const [m, setM] = useState<Metrics>({ x: { size: 0, view: 0, pos: 0 }, y: { size: 0, view: 0, pos: 0 } });

  const measure = useCallback(() => {
    const el = wellRef.current;
    if (!el) return;
    setM({
      x: { size: el.scrollWidth, view: el.clientWidth, pos: el.scrollLeft },
      y: { size: el.scrollHeight, view: el.clientHeight, pos: el.scrollTop },
    });
  }, []);

  useLayoutEffect(() => {
    const el = wellRef.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
      if (el.firstElementChild) ro.observe(el.firstElementChild);
    }
    return () => {
      el.removeEventListener('scroll', measure);
      ro?.disconnect();
    };
  }, [measure]);

  const showX = m.x.size > m.x.view + 1;
  const showY = m.y.size > m.y.view + 1;

  return (
    <div className={'scroll-frame' + (showX ? ' has-x' : '') + (showY ? ' has-y' : '')}>
      <div className="board-well" ref={wellRef}>
        {children}
      </div>
      {showY && <ScrollBar axis="y" metrics={m.y} well={wellRef} />}
      {showX && <ScrollBar axis="x" metrics={m.x} well={wellRef} />}
      {showX && showY && <div className="scrollbar-corner" />}
    </div>
  );
}

interface ScrollBarProps {
  axis: Axis;
  metrics: { size: number; view: number; pos: number };
  well: RefObject<HTMLDivElement | null>;
}

function ScrollBar({ axis, metrics, well }: ScrollBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; start: number; startPos: number } | null>(null);
  const [trackLen, setTrackLen] = useState(0);

  useLayoutEffect(() => {
    const t = trackRef.current;
    if (!t) return;
    const read = () => setTrackLen(axis === 'x' ? t.clientWidth : t.clientHeight);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(t);
    return () => ro.disconnect();
  }, [axis]);

  const { size, view, pos } = metrics;
  const max = Math.max(1, size - view);
  const thumb = Math.max(BAR, Math.round((view / size) * trackLen));
  const free = Math.max(0, trackLen - thumb);
  const offset = Math.round((pos / max) * free);

  const scrollBy = (delta: number) => {
    const el = well.current;
    if (!el) return;
    if (axis === 'x') el.scrollLeft += delta;
    else el.scrollTop += delta;
  };
  const scrollTo = (value: number) => {
    const el = well.current;
    if (!el) return;
    if (axis === 'x') el.scrollLeft = value;
    else el.scrollTop = value;
  };

  // The zoomed window scales pointer movement; convert screen pixels back to track pixels.
  const scale = () => {
    const t = trackRef.current;
    if (!t) return 1;
    const rect = t.getBoundingClientRect();
    const len = axis === 'x' ? t.clientWidth : t.clientHeight;
    return len ? (axis === 'x' ? rect.width : rect.height) / len : 1;
  };

  function onThumbDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { id: e.pointerId, start: axis === 'x' ? e.clientX : e.clientY, startPos: pos };
  }
  function onThumbMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || free === 0) return;
    const moved = ((axis === 'x' ? e.clientX : e.clientY) - d.start) / scale();
    scrollTo(d.startPos + (moved / free) * max);
  }
  function onThumbUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (drag.current?.id === e.pointerId) drag.current = null;
  }
  function onTrackDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const at = ((axis === 'x' ? e.clientX - rect.left : e.clientY - rect.top) / scale()) | 0;
    scrollBy(at < offset ? -view : view); // page, like clicking a classic track
  }

  const thumbStyle =
    axis === 'x' ? { width: thumb, transform: `translateX(${offset}px)` } : { height: thumb, transform: `translateY(${offset}px)` };

  return (
    <div className={`scrollbar scrollbar--${axis}`} aria-hidden="true">
      <button type="button" tabIndex={-1} className="scrollbar__btn" onClick={() => scrollBy(-STEP)}>
        <Arrow dir={axis === 'x' ? 'left' : 'up'} />
      </button>
      <div className="scrollbar__track" ref={trackRef} onPointerDown={onTrackDown}>
        <div
          className="scrollbar__thumb"
          style={thumbStyle}
          onPointerDown={onThumbDown}
          onPointerMove={onThumbMove}
          onPointerUp={onThumbUp}
          onPointerCancel={onThumbUp}
        />
      </div>
      <button type="button" tabIndex={-1} className="scrollbar__btn" onClick={() => scrollBy(STEP)}>
        <Arrow dir={axis === 'x' ? 'right' : 'down'} />
      </button>
    </div>
  );
}
