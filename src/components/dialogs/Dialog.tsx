import { useEffect, useId, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Buttons along the bottom edge. */
  footer?: ReactNode;
  zoom: number;
  className?: string;
  /** CSS selector of the element to focus first. Defaults to the first input or default button. */
  initialFocus?: string;
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/** A classic modal dialog window. Escape or the close button dismisses it. */
export function Dialog({ title, onClose, children, footer, zoom, className, initialFocus }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    const target =
      (initialFocus && root?.querySelector<HTMLElement>(initialFocus)) ||
      root?.querySelector<HTMLElement>('input, .btn--default') ||
      root?.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus();
    if (target instanceof HTMLInputElement) target.select();
    return () => {
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
    // Only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === 'Tab') {
      const items = Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  return createPortal(
    <div className="dialog-backdrop" onKeyDown={onKeyDown} onContextMenu={(e) => e.preventDefault()}>
      <div
        ref={ref}
        className={'window dialog' + (className ? ` ${className}` : '')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ zoom }}
      >
        <div className="titlebar">
          <span className="titlebar__text" id={titleId}>
            {title}
          </span>
          <button type="button" className="titlebar__btn titlebar__btn--close" aria-label="Close" onClick={onClose}>
            <svg width="8" height="7" viewBox="0 0 8 7" shapeRendering="crispEdges" aria-hidden="true">
              <path
                d="M0 0h2v1h-2zM6 0h2v1h-2zM1 1h2v1h-2zM5 1h2v1h-2zM2 2h4v1h-4zM3 3h2v1h-2zM2 4h4v1h-4zM1 5h2v1h-2zM5 5h2v1h-2zM0 6h2v1h-2zM6 6h2v1h-2z"
                fill="#000"
              />
            </svg>
          </button>
        </div>
        <div className="dialog__body">{children}</div>
        {footer && <div className="dialog__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
