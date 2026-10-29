import { memo, useEffect, useRef, useState } from 'react';
import { displaySeconds } from '../engine';
import { LedCounter } from './LedCounter';

interface TimerProps {
  startTime: number | null;
  endTime: number | null;
  onTick?: () => void;
}

/**
 * The classic seconds counter. It works out the time from the start
 * timestamp on every check, so a throttled background tab cannot drift. It
 * keeps its own state, so the rest of the app does not re-render each second.
 */
export const Timer = memo(function Timer({ startTime, endTime, onTick }: TimerProps) {
  const [now, setNow] = useState(() => Date.now());
  const running = startTime !== null && endTime === null;
  const tickRef = useRef(onTick);
  useEffect(() => {
    tickRef.current = onTick;
  });

  useEffect(() => {
    if (!running) return;
    let shown = -1;
    const update = () => {
      const t = Date.now();
      const seconds = displaySeconds(t - startTime);
      if (seconds !== shown) {
        if (shown !== -1 && seconds < 999) tickRef.current?.();
        shown = seconds;
        setNow(t);
      }
    };
    update();
    const id = window.setInterval(update, 100);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', update);
    };
  }, [running, startTime]);

  let seconds = 0;
  if (startTime !== null) seconds = displaySeconds((endTime ?? Math.max(now, startTime)) - startTime);
  return <LedCounter value={seconds} label="Time" />;
});
