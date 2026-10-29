import { Dialog } from './Dialog';

interface HelpDialogProps {
  topic: 'help' | 'about';
  zoom: number;
  persistent: boolean;
  onClose: () => void;
}

export function HelpDialog({ topic, zoom, persistent, onClose }: HelpDialogProps) {
  const footer = (
    <button type="button" className="btn btn--default" onClick={onClose}>
      OK
    </button>
  );

  if (topic === 'about') {
    return (
      <Dialog title="About Minesweeper" onClose={onClose} zoom={zoom} footer={footer} className="about">
        <p>
          <strong>Minesweeper</strong>
        </p>
        <p>A browser recreation of the classic desktop game.</p>
        <p className="muted">
          {persistent
            ? 'Best times, statistics and options are saved in this browser only.'
            : 'This browser is blocking storage, so results are not saved after you leave.'}
        </p>
      </Dialog>
    );
  }

  return (
    <Dialog title="How to Play" onClose={onClose} zoom={zoom} footer={footer} className="help">
      <div className="help__scroll sunken-panel" tabIndex={0} aria-label="How to play">
        <p>
          Open every square that does not hide a mine. A number tells you how many mines touch that square, including
          diagonally. Your first click is always safe.
        </p>
        <h3>Mouse</h3>
        <ul>
          <li>Left-click: open a square.</li>
          <li>Right-click: place or remove a flag.</li>
          <li>
            Both buttons, middle button, or a click on an opened number: open its neighbours when it has enough flags
            around it (chording).
          </li>
        </ul>
        <h3>Touch</h3>
        <ul>
          <li>Tap: open a square, or chord on a number.</li>
          <li>Flag button below the board: switch taps to placing flags.</li>
          <li>Press and hold: place or remove a flag.</li>
        </ul>
        <h3>Keyboard</h3>
        <ul>
          <li>Arrow keys, Home, End: move around the board.</li>
          <li>Enter or Space: open a square, or chord on a number.</li>
          <li>F: place or remove a flag.</li>
          <li>F2: new game. Alt+G, Alt+O, Alt+H: open the menus. Esc: close a dialog.</li>
        </ul>
        <p>The mine counter shows mines minus flags placed, so it can go below zero.</p>
      </div>
    </Dialog>
  );
}
