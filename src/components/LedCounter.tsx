import { memo } from 'react';

// Seven-segment digit, 13 × 23 like the original counters.
const SEGMENTS: Record<string, string> = {
  a: '2,1 11,1 9,3 4,3',
  b: '12,2 12,10 11,11 10,10 10,4',
  c: '12,13 12,21 10,19 10,13 11,12',
  d: '4,20 9,20 11,22 2,22',
  e: '1,13 2,12 3,13 3,19 1,21',
  f: '1,2 3,4 3,10 2,11 1,10',
  g: '2,11.5 3,10.5 10,10.5 11,11.5 10,12.5 3,12.5',
};

const LIT: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abged',
  '3': 'abgcd',
  '4': 'fgbc',
  '5': 'afgcd',
  '6': 'afgedc',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
  '-': 'g',
  ' ': '',
};

function Digit({ char }: { char: string }) {
  const lit = LIT[char] ?? '';
  return (
    <svg className="led__digit" width={13} height={23} viewBox="0 0 13 23" aria-hidden="true" focusable="false">
      {Object.entries(SEGMENTS).map(([name, points]) => (
        <polygon key={name} points={points} className={lit.includes(name) ? 'led__on' : 'led__off'} />
      ))}
    </svg>
  );
}

/** Formats a value the way the classic three-digit counter shows it. */
export function formatLed(value: number): string {
  const v = Math.max(-99, Math.min(999, Math.trunc(value)));
  if (v < 0) return '-' + String(-v).padStart(2, '0');
  return String(v).padStart(3, '0');
}

interface LedCounterProps {
  value: number;
  label: string;
}

export const LedCounter = memo(function LedCounter({ value, label }: LedCounterProps) {
  const text = formatLed(value);
  return (
    <div className="led" role="img" aria-label={`${label}: ${value}`}>
      {text.split('').map((c, i) => (
        <Digit key={i} char={c} />
      ))}
    </div>
  );
});
