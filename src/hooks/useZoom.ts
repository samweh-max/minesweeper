import { useEffect, useState } from 'react';
import type { BoardConfig } from '../engine';
import type { ZoomSetting } from '../storage/settings';

/** Size of one tile at 100%, as in the original. */
export const TILE = 16;
/** Window chrome around the board at 100% (frames, title, menu, status areas). */
export const CHROME_WIDTH = 30;
export const CHROME_HEIGHT = 134;
const MARGIN = 16;
const MAX_AUTO_ZOOM = 2;

interface Viewport {
  width: number;
  height: number;
  dpr: number;
}

function readViewport(): Viewport {
  if (typeof window === 'undefined') return { width: 1024, height: 768, dpr: 1 };
  const vv = window.visualViewport;
  return {
    width: document.documentElement.clientWidth || window.innerWidth,
    height: vv ? Math.min(vv.height, window.innerHeight) : window.innerHeight,
    dpr: window.devicePixelRatio || 1,
  };
}

/**
 * Picks the largest zoom that fits the window on screen, between 100% and
 * 200%. Zoom steps are chosen so that one original pixel lands on a whole
 * number of device pixels, which keeps bevels and digits sharp.
 */
export function autoZoom(config: BoardConfig, viewport: Viewport): number {
  const naturalW = config.width * TILE + CHROME_WIDTH;
  const naturalH = config.height * TILE + CHROME_HEIGHT;
  const fit = Math.min((viewport.width - MARGIN) / naturalW, (viewport.height - MARGIN) / naturalH, MAX_AUTO_ZOOM);
  if (fit <= 1) return 1;
  const dpr = Math.max(1, viewport.dpr);
  const steps = Math.floor(fit * dpr + 1e-6);
  return Math.max(1, steps / dpr);
}

export function useViewport(): Viewport {
  const [viewport, setViewport] = useState(readViewport);
  useEffect(() => {
    const update = () => setViewport(readViewport());
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);
  return viewport;
}

export interface ZoomInfo {
  zoom: number;
  /** Widest the window may be, in unzoomed CSS pixels, before the board scrolls. */
  maxWindowWidth: number;
  /** Zoom for dialogs: the window zoom, reduced if a dialog would not fit. */
  dialogZoom: number;
}

export function useZoom(config: BoardConfig, setting: ZoomSetting): ZoomInfo {
  const viewport = useViewport();
  const zoom = setting === 'auto' ? autoZoom(config, viewport) : setting;
  const maxWindowWidth = Math.max(120, (viewport.width - MARGIN) / zoom);
  const dialogZoom = Math.max(1, Math.min(zoom, (viewport.width - MARGIN) / 320));
  return { zoom, maxWindowWidth, dialogZoom };
}
