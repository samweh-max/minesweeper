import { memo } from 'react';
import type { CellView } from '../engine';
import { digitLayers, flagLayers, mineLayers, questionLayers, wrongMineLayers } from '../ui/sprites';
import { Sprite } from './Sprite';

interface CellProps {
  index: number;
  x: number;
  y: number;
  view: CellView;
  pressed: boolean;
  focused: boolean;
}

function describe(view: CellView): string {
  switch (view.kind) {
    case 'hidden':
      return 'hidden';
    case 'flag':
      return 'flagged';
    case 'question':
      return 'question mark';
    case 'open':
      return view.count === 0 ? 'empty' : `${view.count}`;
    case 'mine':
      return 'mine';
    case 'exploded':
      return 'exploded mine';
    case 'wrong-flag':
      return 'wrong flag, no mine';
  }
}

function content(view: CellView) {
  switch (view.kind) {
    case 'flag':
      return <Sprite layers={flagLayers} />;
    case 'question':
      return <Sprite layers={questionLayers} />;
    case 'open':
      return view.count > 0 ? <Sprite layers={digitLayers(view.count, 'currentColor')} /> : null;
    case 'mine':
    case 'exploded':
      return <Sprite layers={mineLayers} />;
    case 'wrong-flag':
      return <Sprite layers={wrongMineLayers} />;
    default:
      return null;
  }
}

/**
 * One tile. Input is handled by the Board through event delegation, so a
 * tile only re-renders when its own look changes.
 */
export const Cell = memo(function Cell({ index, x, y, view, pressed, focused }: CellProps) {
  const opened = view.kind === 'open' || view.kind === 'mine' || view.kind === 'exploded' || view.kind === 'wrong-flag';
  const cls =
    'cell ' +
    (opened ? 'cell--open' : pressed ? 'cell--open cell--pressed' : 'cell--closed') +
    (view.kind === 'open' && view.count > 0 ? ` n${view.count}` : '') +
    (view.kind === 'exploded' ? ' cell--exploded' : '');
  return (
    <div
      role="gridcell"
      className={cls}
      data-index={index}
      data-kind={view.kind}
      tabIndex={focused ? 0 : -1}
      aria-label={`Row ${y + 1}, column ${x + 1}: ${describe(view)}`}
    >
      {content(view)}
    </div>
  );
});
