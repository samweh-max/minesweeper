import { useState } from 'react';
import type { FormEvent } from 'react';
import { LIMITS, maxMinesFor, validateConfig, type BoardConfig, type ConfigErrors } from '../../engine';
import { Dialog } from './Dialog';

interface CustomDialogProps {
  initial: BoardConfig;
  /** A game is in progress and will be abandoned. */
  gameInProgress: boolean;
  zoom: number;
  onApply: (config: BoardConfig) => void;
  onClose: () => void;
}

type Field = 'height' | 'width' | 'mines';

function parse(value: string): number {
  const text = value.trim();
  if (text === '') return NaN;
  // Only plain decimal numbers; "1e2", "0x10" and the like are rejected.
  if (!/^-?\d+(\.\d+)?$/.test(text)) return NaN;
  return Number(text);
}

export function CustomDialog({ initial, gameInProgress, zoom, onApply, onClose }: CustomDialogProps) {
  const [values, setValues] = useState<Record<Field, string>>({
    height: String(initial.height),
    width: String(initial.width),
    mines: String(initial.mines),
  });
  const [errors, setErrors] = useState<ConfigErrors>({});

  const width = parse(values.width);
  const height = parse(values.height);
  const maxMines =
    Number.isInteger(width) && Number.isInteger(height) && width >= 1 && height >= 1 && width <= LIMITS.maxWidth && height <= LIMITS.maxHeight
      ? maxMinesFor(width, height)
      : null;

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const config = { width, height, mines: parse(values.mines) };
    const found = validateConfig(config);
    for (const key of Object.keys(found) as Field[]) {
      if (values[key].trim() === '') found[key] = `Enter a value for ${key}.`;
    }
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const first = (['height', 'width', 'mines'] as Field[]).find((f) => found[f]);
      document.getElementById(`custom-${first}`)?.focus();
      return;
    }
    onApply(config);
  }

  const field = (name: Field, label: string, access: string, hint: string) => (
    <div className="field">
      <label htmlFor={`custom-${name}`}>
        {label.split(access)[0]}
        <u>{access}</u>
        {label.split(access).slice(1).join(access)}:
      </label>
      <input
        id={`custom-${name}`}
        aria-label={label}
        className="input"
        inputMode="numeric"
        autoComplete="off"
        value={values[name]}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={`custom-${name}-hint${errors[name] ? ` custom-${name}-error` : ''}`}
        accessKey={access.toLowerCase()}
        onChange={(e) => {
          setValues((v) => ({ ...v, [name]: e.target.value }));
          if (errors[name]) setErrors((err) => ({ ...err, [name]: undefined }));
        }}
      />
      <span className="field__hint" id={`custom-${name}-hint`}>
        {hint}
      </span>
      {errors[name] && (
        <span className="field__error" id={`custom-${name}-error`} role="alert">
          {errors[name]}
        </span>
      )}
    </div>
  );

  return (
    <Dialog
      title="Custom Field"
      onClose={onClose}
      zoom={zoom}
      className="custom-dialog"
      footer={
        <>
          <button type="submit" form="custom-form" className="btn btn--default">
            OK
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <form id="custom-form" onSubmit={submit} noValidate>
        {field('height', 'Height', 'H', `${LIMITS.minHeight}–${LIMITS.maxHeight}`)}
        {field('width', 'Width', 'W', `${LIMITS.minWidth}–${LIMITS.maxWidth}`)}
        {field('mines', 'Mines', 'M', maxMines === null ? '0 or more' : `0–${maxMines}`)}
      </form>
      <p className="dialog__note">At least one cell is always kept free for a safe first click.</p>
      {gameInProgress && (
        <p className="dialog__note dialog__note--warn">OK starts a new game. The current game will be abandoned; your records are kept.</p>
      )}
    </Dialog>
  );
}
