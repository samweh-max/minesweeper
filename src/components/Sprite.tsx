import type { PixelLayer } from '../ui/pixel';

interface SpriteProps {
  layers: readonly PixelLayer[];
  size?: number;
  className?: string;
}

/** Renders pixel-art layers as a crisp SVG. Decorative: hidden from screen readers. */
export function Sprite({ layers, size = 16, className }: SpriteProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {layers.map((l, i) => (
        <path key={i} d={l.d} fill={l.fill} />
      ))}
    </svg>
  );
}
