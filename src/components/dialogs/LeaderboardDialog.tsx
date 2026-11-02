import { useCallback, useEffect, useState } from 'react';
import { DIFFICULTY_LABELS, PRESET_ORDER, type PresetDifficulty } from '../../engine';
import {
  LEADERBOARD_SIZE,
  ONLINE_NAME_MAX,
  canPostAs,
  cleanOnlineName,
  formatOnlineTime,
  type LeaderboardClient,
  type LeaderboardRow,
} from '../../online/leaderboard';
import { Dialog } from './Dialog';

interface LeaderboardDialogProps {
  client: LeaderboardClient | null;
  playerId: string;
  level: PresetDifficulty;
  playerName: string;
  sending: boolean;
  /** Settles once this device's latest times have been sent, so they show up. */
  synced: () => Promise<unknown>;
  zoom: number;
  onLevelChange: (level: PresetDifficulty) => void;
  onNameChange: (name: string) => void;
  onSendingChange: (on: boolean) => void;
  onClose: () => void;
}

type Load = { state: 'loading' } | { state: 'error' } | { state: 'done'; rows: LeaderboardRow[] };
type Result = { key: string; load: Load };

/** The shared top-ten table for each level, with the player's own place. */
export function LeaderboardDialog({
  client,
  playerId,
  level,
  playerName,
  sending,
  synced,
  zoom,
  onLevelChange,
  onNameChange,
  onSendingChange,
  onClose,
}: LeaderboardDialogProps) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const requestKey = `${level}:${attempt}`;
  const load: Load = result?.key === requestKey ? result.load : { state: 'loading' };
  const named = canPostAs(playerName);
  const [draft, setDraft] = useState(named ? cleanOnlineName(playerName) : '');

  useEffect(() => {
    if (!client) return;
    let live = true;
    const key = `${level}:${attempt}`;
    synced()
      .catch(() => undefined)
      .then(() => client.fetchBoard(level, playerId, LEADERBOARD_SIZE))
      .then(
        (rows) => live && setResult({ key, load: { state: 'done', rows } }),
        () => live && setResult({ key, load: { state: 'error' } }),
      );
    return () => {
      live = false;
    };
  }, [client, level, playerId, synced, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  const draftClean = cleanOnlineName(draft);
  const draftChanged = draftClean !== cleanOnlineName(playerName);
  const saveName = () => {
    if (!canPostAs(draftClean) || !draftChanged) return;
    onNameChange(draftClean);
    retry();
  };

  let body;
  if (!client) {
    body = <p className="muted leaderboard__msg">The leaderboard isn't set up yet.</p>;
  } else if (load.state === 'loading') {
    body = <p className="muted leaderboard__msg">Loading...</p>;
  } else if (load.state === 'error') {
    body = (
      <p className="leaderboard__msg">
        Couldn't reach the leaderboard. Check your connection.{' '}
        <button type="button" className="btn btn--small" onClick={retry}>
          Retry
        </button>
      </p>
    );
  } else if (load.rows.length === 0) {
    body = <p className="muted leaderboard__msg">No times yet. Win a game to be first!</p>;
  } else {
    const rows = load.rows;
    body = (
      <table className="leaderboard__table">
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.rank} className={(r.isMe ? 'is-me' : '') + (i > 0 && r.rank > rows[i - 1].rank + 1 ? ' gap' : '')}>
              <td className="num">{r.rank}.</td>
              <td className="leaderboard__name">{r.name}</td>
              <td className="num">{formatOnlineTime(r.ms)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <Dialog
      title="Leaderboard"
      onClose={onClose}
      zoom={zoom}
      className="leaderboard"
      initialFocus=".btn--default"
      footer={
        <button type="button" className="btn btn--default" onClick={onClose}>
          OK
        </button>
      }
    >
      <div className="leaderboard__levels" role="tablist" aria-label="Level">
        {PRESET_ORDER.map((d) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={d === level}
            className={'btn btn--toggle' + (d === level ? ' is-active' : '')}
            onClick={() => onLevelChange(d)}
          >
            {DIFFICULTY_LABELS[d]}
          </button>
        ))}
      </div>
      <div className="leaderboard__list" role="tabpanel" aria-label={`${DIFFICULTY_LABELS[level]} leaderboard`}>
        {body}
      </div>
      <p className="leaderboard__unit muted">Times in seconds. Each player's best time counts.</p>
      {client && (
        <div className="groupbox">
          <span className="groupbox__label">You</span>
          <form
            className="leaderboard__name-form"
            onSubmit={(e) => {
              e.preventDefault();
              saveName();
            }}
          >
            <label htmlFor="leaderboard-name">Name:</label>
            <input
              id="leaderboard-name"
              className="input input--wide"
              maxLength={ONLINE_NAME_MAX}
              value={draft}
              placeholder="Your name"
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" className="btn btn--small" disabled={!canPostAs(draftClean) || !draftChanged}>
              Save
            </button>
          </form>
          {!named && <p className="leaderboard__hint">Type your name to join the leaderboard.</p>}
          <label className="checkbox">
            <input type="checkbox" checked={sending} onChange={(e) => onSendingChange(e.target.checked)} />
            Send my best times
          </label>
        </div>
      )}
    </Dialog>
  );
}
