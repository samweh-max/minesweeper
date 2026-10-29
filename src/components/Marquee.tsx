import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

/**
 * Shows a line of text. If it does not fit, it scrolls slowly in a loop
 * instead of being cut off or widening the window.
 */
export function Marquee({ text }: { text: string }) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [scroll, setScroll] = useState<number | null>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const inner = textRef.current;
    if (!box || !inner) return;
    const measure = () => {
      const overflow = inner.scrollWidth > box.clientWidth + 1;
      setScroll(overflow ? inner.scrollWidth : null);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [text]);

  const gap = 32;
  return (
    <span className="marquee" ref={boxRef}>
      <span
        className={'marquee__track' + (scroll !== null ? ' is-scrolling' : '')}
        style={
          scroll !== null
            ? ({
                '--marquee-shift': `-${scroll + gap}px`,
                animationDuration: `${Math.max(4, (scroll + gap) / 30)}s`,
              } as CSSProperties)
            : undefined
        }
      >
        <span ref={textRef} className="marquee__text">
          {text}
        </span>
        {scroll !== null && (
          <span className="marquee__text" aria-hidden="true" style={{ paddingLeft: gap }}>
            {text}
          </span>
        )}
      </span>
    </span>
  );
}
