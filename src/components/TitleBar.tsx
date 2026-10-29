import { mineLayers } from '../ui/sprites';
import { Sprite } from './Sprite';

const MIN = ['........', '........', '........', '........', '........', '........', 'xxxxxx..', 'xxxxxx..'];
const MAX = ['xxxxxxxxx', 'xxxxxxxxx', 'x.......x', 'x.......x', 'x.......x', 'x.......x', 'x.......x', 'xxxxxxxxx'];
const CLOSE = ['xx....xx', '.xx..xx.', '..xxxx..', '...xx...', '..xxxx..', '.xx..xx.', 'xx....xx'];

function Glyph({ rows }: { rows: string[] }) {
  const w = rows[0].length;
  const h = rows.length;
  const rects: string[] = [];
  rows.forEach((r, y) => r.split('').forEach((c, x) => c === 'x' && rects.push(`M${x} ${y}h1v1h-1z`)));
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" aria-hidden="true">
      <path d={rects.join('')} fill="#000" />
    </svg>
  );
}

/** The window caption. Its buttons are decoration, as a browser tab cannot be minimised. */
export function TitleBar({ title }: { title: string }) {
  return (
    <div className="titlebar">
      <Sprite layers={mineLayers} className="titlebar__icon" />
      <span className="titlebar__text">{title}</span>
      <span className="titlebar__buttons" aria-hidden="true">
        <span className="titlebar__btn">
          <Glyph rows={MIN} />
        </span>
        <span className="titlebar__btn">
          <Glyph rows={MAX} />
        </span>
        <span className="titlebar__btn titlebar__btn--close">
          <Glyph rows={CLOSE} />
        </span>
      </span>
    </div>
  );
}
