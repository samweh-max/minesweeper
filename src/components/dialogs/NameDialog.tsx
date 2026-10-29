import { useState } from 'react';
import { Dialog } from './Dialog';

interface NameDialogProps {
  /** e.g. "Beginner level" or "this 20 × 12, 40 mines board". */
  levelText: string;
  seconds: number;
  initialName: string;
  zoom: number;
  onSave: (name: string) => void;
}

/**
 * The original asks for a name when you set a record. The time is already
 * saved under the remembered name; this only changes the name.
 */
export function NameDialog({ levelText, seconds, initialName, zoom, onSave }: NameDialogProps) {
  const [name, setName] = useState(initialName);
  const save = () => onSave(name.trim() || 'Anonymous');
  return (
    <Dialog
      title="Congratulations"
      onClose={save}
      zoom={zoom}
      className="name-dialog"
      footer={
        <button type="submit" form="name-form" className="btn btn--default">
          OK
        </button>
      }
    >
      <form
        id="name-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <p className="name-dialog__text">
          You have the fastest time for {levelText}: {seconds} {seconds === 1 ? 'second' : 'seconds'}.
          <br />
          Please type your name:
        </p>
        <input
          className="input input--wide"
          aria-label="Your name"
          maxLength={32}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </form>
    </Dialog>
  );
}
