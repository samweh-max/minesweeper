import { useState } from 'react';
import { DIFFICULTY_LABELS, PRESET_ORDER } from '../../engine';
import { STATS_CATEGORIES, overallTotals, totalsFor, type Records, type Totals } from '../../storage/records';
import { ConfirmDialog } from './ConfirmDialog';
import { Dialog } from './Dialog';

interface StatisticsDialogProps {
  records: Records;
  zoom: number;
  persistent: boolean;
  onReset: () => void;
  onClose: () => void;
}

function Row({ label, totals }: { label: string; totals: Totals }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td className="num">{totals.played}</td>
      <td className="num">{totals.won}</td>
      <td className="num">{totals.lost}</td>
      <td className="num">{totals.winPercent}%</td>
    </tr>
  );
}

export function StatisticsDialog({ records, zoom, persistent, onReset, onClose }: StatisticsDialogProps) {
  const [confirming, setConfirming] = useState(false);
  const overall = overallTotals(records);

  return (
    <>
      <Dialog
        title="Statistics"
        onClose={onClose}
        zoom={zoom}
        className="stats"
        footer={
          <>
            <button type="button" className="btn" aria-label="Reset" onClick={() => setConfirming(true)}>
              <u>R</u>eset
            </button>
            <button type="button" className="btn btn--default" onClick={onClose}>
              Close
            </button>
          </>
        }
      >
        <div className="sunken-panel">
          <table className="stats__table">
            <thead>
              <tr>
                <th scope="col">Level</th>
                <th scope="col">Played</th>
                <th scope="col">Won</th>
                <th scope="col">Lost</th>
                <th scope="col">Win %</th>
              </tr>
            </thead>
            <tbody>
              {STATS_CATEGORIES.map((c) => (
                <Row key={c} label={DIFFICULTY_LABELS[c]} totals={totalsFor(records.stats[c])} />
              ))}
            </tbody>
            <tfoot>
              <Row label="All levels" totals={overall} />
            </tfoot>
          </table>
        </div>
        <dl className="stats__list">
          <dt>Current winning streak:</dt>
          <dd>{records.currentStreak}</dd>
          <dt>Longest winning streak:</dt>
          <dd>{records.bestStreak}</dd>
          {PRESET_ORDER.map((d) => (
            <div key={d} className="stats__pair">
              <dt>Best {DIFFICULTY_LABELS[d]} time:</dt>
              <dd>{records.bestTimes[d] ? `${records.bestTimes[d]!.seconds} s` : '—'}</dd>
            </div>
          ))}
          <dt>Custom boards won:</dt>
          <dd>{Object.keys(records.customBestTimes).length}</dd>
        </dl>
        <p className="dialog__note">
          A game counts once it is won or lost. Games abandoned with New Game are not counted.
          {!persistent && ' Saving is unavailable in this browser, so results last only until the page is closed.'}
        </p>
      </Dialog>
      {confirming && (
        <ConfirmDialog
          title="Reset Statistics"
          message="Reset games played, wins and streaks? Best times are kept."
          zoom={zoom}
          onConfirm={() => {
            onReset();
            setConfirming(false);
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}
