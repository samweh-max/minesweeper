import { useState } from 'react';
import { DIFFICULTY_LABELS, PRESET_ORDER, describeConfig, parseCustomKey } from '../../engine';
import type { Records, TimeRecord } from '../../storage/records';
import { ConfirmDialog } from './ConfirmDialog';
import { Dialog } from './Dialog';

interface BestTimesDialogProps {
  records: Records;
  zoom: number;
  onClear: () => void;
  onClose: () => void;
}

function secondsText(t: TimeRecord | null) {
  const s = t ? t.seconds : 999;
  return `${s} ${s === 1 ? 'second' : 'seconds'}`;
}

export function BestTimesDialog({ records, zoom, onClear, onClose }: BestTimesDialogProps) {
  const [confirming, setConfirming] = useState(false);
  const custom = Object.entries(records.customBestTimes)
    .map(([key, time]) => ({ key, time, config: parseCustomKey(key)! }))
    .filter((c) => c.config)
    .sort(
      (a, b) =>
        a.config.width * a.config.height - b.config.width * b.config.height ||
        a.config.mines - b.config.mines ||
        a.key.localeCompare(b.key),
    );

  return (
    <>
      <Dialog
        title="Fastest Mine Sweepers"
        onClose={onClose}
        zoom={zoom}
        className="best-times"
        footer={
          <>
            <button type="button" className="btn" aria-label="Reset Scores" onClick={() => setConfirming(true)}>
              <u>R</u>eset Scores
            </button>
            <button type="button" className="btn btn--default" onClick={onClose}>
              OK
            </button>
          </>
        }
      >
        <table className="best-times__table">
          <tbody>
            {PRESET_ORDER.map((d) => {
              const t = records.bestTimes[d];
              return (
                <tr key={d}>
                  <th scope="row">{DIFFICULTY_LABELS[d]}:</th>
                  <td className="num">{secondsText(t)}</td>
                  <td>{t ? t.name : 'Anonymous'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="groupbox">
          <span className="groupbox__label">Custom boards</span>
          {custom.length === 0 ? (
            <p className="muted">No custom board has been won yet.</p>
          ) : (
            <div className="listbox" tabIndex={0} aria-label="Custom board best times">
              <table>
                <tbody>
                  {custom.map(({ key, time, config }) => (
                    <tr key={key}>
                      <th scope="row">{describeConfig(config)}</th>
                      <td className="num">{secondsText(time)}</td>
                      <td>{time.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Dialog>
      {confirming && (
        <ConfirmDialog
          title="Reset Scores"
          message="Clear all best times, including custom boards? Statistics are not affected."
          zoom={zoom}
          onConfirm={() => {
            onClear();
            setConfirming(false);
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}
