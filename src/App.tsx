import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { playSound } from './audio/sound';
import { Board } from './components/Board';
import { BestTimesDialog } from './components/dialogs/BestTimesDialog';
import { ConfirmDialog } from './components/dialogs/ConfirmDialog';
import { CustomDialog } from './components/dialogs/CustomDialog';
import { HelpDialog } from './components/dialogs/HelpDialog';
import { NameDialog } from './components/dialogs/NameDialog';
import { StatisticsDialog } from './components/dialogs/StatisticsDialog';
import { FaceButton } from './components/FaceButton';
import { LedCounter } from './components/LedCounter';
import { Marquee } from './components/Marquee';
import { ScrollFrame } from './components/ScrollFrame';
import { Fireworks } from './components/Fireworks';
import { MenuBar, type MenuDef } from './components/MenuBar';
import { Sprite } from './components/Sprite';
import { Timer } from './components/Timer';
import { TitleBar } from './components/TitleBar';
import {
  DIFFICULTY_LABELS,
  activate,
  chord,
  createGame,
  describeConfig,
  elapsedMs,
  isOver,
  randomSeed,
  remainingMines,
  toggleMark,
  type BoardConfig,
  type Difficulty,
  type GameState,
} from './engine';
import { useZoom } from './hooks/useZoom';
import {
  bestTimeFor,
  clearBestTimes,
  loadRecords,
  recordGame,
  renameBestTime,
  resetStatistics,
  saveRecords,
  type RecordSlot,
  type Records,
} from './storage/records';
import { configForDifficulty, loadSettings, saveSettings, type Settings, type ZoomSetting } from './storage/settings';
import { createBrowserStore, type KeyValueStore } from './storage/storage';
import { flagLayers } from './ui/sprites';
import type { FaceKind } from './ui/sprites';

type GameAction =
  | { type: 'replace'; game: GameState }
  | { type: 'activate'; index: number; now: number; seed: number }
  | { type: 'chord'; index: number; now: number }
  | { type: 'mark'; index: number; questionMarks: boolean };

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'replace':
      return action.game;
    case 'activate':
      return activate(state, action.index, action.now, action.seed);
    case 'chord':
      return chord(state, action.index, action.now);
    case 'mark':
      return toggleMark(state, action.index, action.questionMarks);
  }
}

type DialogState =
  | { kind: 'custom' }
  | { kind: 'best' }
  | { kind: 'stats' }
  | { kind: 'help' }
  | { kind: 'about' }
  | { kind: 'reset-stats' }
  | { kind: 'confirm-new'; difficulty: Difficulty }
  | { kind: 'name'; slot: RecordSlot; seconds: number; levelText: string };

interface LastResult {
  gameId: number;
  won: boolean;
  newBest: boolean;
}

const ZOOM_LABELS: Record<string, string> = { auto: 'Auto Size', 1: '100%', 1.5: '150%', 2: '200%', 3: '300%' };

const defaultStore = createBrowserStore();
const NAME_PROMPT_DELAY_MS = import.meta.env.MODE === 'test' ? 0 : 2200;

export default function App({ store = defaultStore }: { store?: KeyValueStore }) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings(store));
  const [records, setRecords] = useState<Records>(() => loadRecords(store));
  const [game, dispatch] = useReducer(gameReducer, undefined, () =>
    createGame(configForDifficulty(settings.difficulty, settings.custom)),
  );
  const [pressing, setPressing] = useState(false);
  const [flagMode, setFlagMode] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [lastResult, setLastResult] = useState<LastResult | null>(null);

  const settingsRef = useRef(settings);
  const recordsRef = useRef(records);
  useLayoutEffect(() => {
    settingsRef.current = settings;
    recordsRef.current = records;
  });

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      const next = { ...settingsRef.current, ...patch };
      settingsRef.current = next;
      setSettings(next);
      saveSettings(store, next);
    },
    [store],
  );

  const updateRecords = useCallback(
    (fn: (r: Records) => Records) => {
      const next = fn(recordsRef.current);
      recordsRef.current = next;
      setRecords(next);
      saveRecords(store, next);
    },
    [store],
  );

  const { zoom, maxWindowWidth, dialogZoom } = useZoom(game.config, settings.zoom);

  // ---- Starting games -----------------------------------------------------

  const startGame = useCallback(
    (difficulty: Difficulty, custom?: BoardConfig) => {
      const nextCustom = custom ?? settingsRef.current.custom;
      if (difficulty !== settingsRef.current.difficulty || custom) {
        updateSettings({ difficulty, custom: nextCustom });
      }
      dispatch({ type: 'replace', game: createGame(configForDifficulty(difficulty, nextCustom)) });
      setLastResult(null);
      setPressing(false);
    },
    [updateSettings],
  );

  /** New game, asking first when that would throw away a game in progress. */
  const requestGame = useCallback(
    (difficulty: Difficulty) => {
      const changing = difficulty !== settingsRef.current.difficulty;
      if (game.status === 'playing' && (changing || settingsRef.current.confirmAbandon)) {
        setDialog({ kind: 'confirm-new', difficulty });
      } else {
        startGame(difficulty);
      }
    },
    [game.status, startGame],
  );

  const newGame = useCallback(() => requestGame(settingsRef.current.difficulty), [requestGame]);

  // F2 starts a new game, as in the original.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'F2' && !dialog) {
        e.preventDefault();
        newGame();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, newGame]);

  // ---- Board input --------------------------------------------------------

  const onActivate = useCallback((index: number) => {
    dispatch({ type: 'activate', index, now: Date.now(), seed: randomSeed() });
  }, []);
  const onChord = useCallback((index: number) => {
    dispatch({ type: 'chord', index, now: Date.now() });
  }, []);
  const onMark = useCallback((index: number) => {
    dispatch({ type: 'mark', index, questionMarks: settingsRef.current.questionMarks });
  }, []);

  // ---- Recording results --------------------------------------------------

  const recordedGameId = useRef<number | null>(null);
  useEffect(() => {
    if (!isOver(game) || game.startTime === null || game.endTime === null) return;
    if (recordedGameId.current === game.id) return; // each game is counted once
    recordedGameId.current = game.id;

    const won = game.status === 'won';
    const ms = elapsedMs(game, game.endTime);
    const outcome = recordGame(recordsRef.current, {
      config: game.config,
      won,
      ms,
      date: new Date(game.endTime),
      name: settingsRef.current.playerName,
    });
    updateRecords(() => outcome.records);
    setLastResult({ gameId: game.id, won, newBest: outcome.newBest });
    if (settingsRef.current.sound) playSound(won ? 'win' : 'boom');
    if (outcome.newBest) {
      const best = bestTimeFor(outcome.records, outcome.slot)!;
      const nameDialog: DialogState = {
        kind: 'name',
        slot: outcome.slot,
        seconds: best.seconds,
        levelText:
          outcome.slot.kind === 'preset'
            ? `${DIFFICULTY_LABELS[outcome.slot.difficulty]} level`
            : `the ${describeConfig(game.config)} board`,
      };
      // Let the fireworks play before asking for a name. The time is already saved.
      if (NAME_PROMPT_DELAY_MS === 0) {
        setDialog(nameDialog);
      } else {
        // Not cancelled by a new game: the player can still name the record.
        window.setTimeout(() => setDialog((d) => d ?? nameDialog), NAME_PROMPT_DELAY_MS);
      }
    }
  }, [game, updateRecords]);

  const onTick = useCallback(() => {
    if (settingsRef.current.sound) playSound('tick');
  }, []);

  // ---- Derived display ----------------------------------------------------

  let face: FaceKind = 'smile';
  if (game.status === 'lost') face = 'dead';
  else if (game.status === 'won') face = 'cool';
  else if (pressing) face = 'surprised';

  let message = game.status === 'ready' ? 'Ready' : flagMode ? 'Flag mode' : 'Playing';
  if (game.status === 'won') {
    message = lastResult?.gameId === game.id && lastResult.newBest ? 'You won! New best time!' : 'You won!';
  } else if (game.status === 'lost') {
    message = 'Game over.';
  }

  const levelText =
    settings.difficulty === 'custom'
      ? `Custom ${game.config.width}×${game.config.height}, ${game.config.mines}`
      : DIFFICULTY_LABELS[settings.difficulty];

  const menus: MenuDef[] = useMemo(() => {
    const d = settings.difficulty;
    const level = (diff: Difficulty, access: string) => ({
      label: DIFFICULTY_LABELS[diff],
      access,
      checked: d === diff,
      onSelect: () => requestGame(diff),
    });
    const zoomItem = (z: ZoomSetting) => ({
      label: ZOOM_LABELS[String(z)],
      checked: settings.zoom === z,
      onSelect: () => updateSettings({ zoom: z }),
    });
    return [
      {
        id: 'game',
        label: 'Game',
        access: 'G',
        items: [
          { label: 'New', access: 'N', shortcut: 'F2', onSelect: newGame },
          { type: 'separator' },
          level('beginner', 'B'),
          level('intermediate', 'I'),
          level('expert', 'E'),
          { label: 'Custom...', access: 'C', checked: d === 'custom', onSelect: () => setDialog({ kind: 'custom' }) },
          { type: 'separator' },
          { label: 'Best Times...', access: 'T', onSelect: () => setDialog({ kind: 'best' }) },
          { label: 'Statistics...', access: 'S', onSelect: () => setDialog({ kind: 'stats' }) },
        ],
      },
      {
        id: 'options',
        label: 'Options',
        access: 'O',
        items: [
          {
            label: 'Marks (?)',
            access: 'M',
            checked: settings.questionMarks,
            onSelect: () => updateSettings({ questionMarks: !settings.questionMarks }),
          },
          { label: 'Sound', access: 'S', checked: settings.sound, onSelect: () => updateSettings({ sound: !settings.sound }) },
          {
            label: 'Colour-blind Numbers',
            access: 'C',
            checked: settings.colorBlind,
            onSelect: () => updateSettings({ colorBlind: !settings.colorBlind }),
          },
          {
            label: 'Confirm New Game',
            access: 'f',
            checked: settings.confirmAbandon,
            onSelect: () => updateSettings({ confirmAbandon: !settings.confirmAbandon }),
          },
          { type: 'separator' },
          ...(['auto', 1, 1.5, 2, 3] as ZoomSetting[]).map(zoomItem),
          { type: 'separator' },
          { label: 'Reset Statistics...', access: 'R', onSelect: () => setDialog({ kind: 'reset-stats' }) },
        ],
      },
      {
        id: 'help',
        label: 'Help',
        access: 'H',
        items: [
          { label: 'How to Play', access: 'H', onSelect: () => setDialog({ kind: 'help' }) },
          { type: 'separator' },
          { label: 'About Minesweeper...', access: 'A', onSelect: () => setDialog({ kind: 'about' }) },
        ],
      },
    ];
  }, [settings, requestGame, newGame, updateSettings]);

  const closeDialog = useCallback(() => setDialog(null), []);

  return (
    <div className={'desktop' + (settings.colorBlind ? ' palette-cb' : '')}>
      <div className="window app-window" style={{ zoom, maxWidth: maxWindowWidth }}>
        <TitleBar title="Minesweeper" />
        <MenuBar menus={menus} />
        <main className="game">
          <div className="status-panel">
            <LedCounter value={remainingMines(game)} label="Mines left" />
            <FaceButton face={face} onClick={newGame} />
            <Timer startTime={game.startTime} endTime={game.endTime} onTick={onTick} />
          </div>
          <ScrollFrame overlay={game.status === 'won' ? <Fireworks key={game.id} /> : null}>
            <Board
              game={game}
              flagMode={flagMode}
              onActivate={onActivate}
              onChord={onChord}
              onMark={onMark}
              onPressChange={setPressing}
            />
          </ScrollFrame>
        </main>
        <div className="statusbar">
          <button
            type="button"
            className={'btn btn--toggle flag-toggle' + (flagMode ? ' is-active' : '')}
            aria-pressed={flagMode}
            title="Flag mode: taps place flags"
            onClick={() => setFlagMode((f) => !f)}
          >
            <Sprite layers={flagLayers} />
            <span>Flag</span>
          </button>
          <div className="statusbar__field statusbar__field--grow" role="status" aria-live="polite">
            <Marquee text={message} />
          </div>
          <div className="statusbar__field statusbar__level" title={describeConfig(game.config)}>
            <Marquee text={levelText} />
          </div>
        </div>
      </div>

      {dialog?.kind === 'custom' && (
        <CustomDialog
          initial={settings.custom}
          gameInProgress={game.status === 'playing'}
          zoom={dialogZoom}
          onClose={closeDialog}
          onApply={(config) => {
            setDialog(null);
            startGame('custom', config);
          }}
        />
      )}
      {dialog?.kind === 'best' && (
        <BestTimesDialog
          records={records}
          zoom={dialogZoom}
          onClear={() => updateRecords(clearBestTimes)}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'stats' && (
        <StatisticsDialog
          records={records}
          zoom={dialogZoom}
          persistent={store.persistent}
          onReset={() => updateRecords(resetStatistics)}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'reset-stats' && (
        <ConfirmDialog
          title="Reset Statistics"
          message="Reset games played, wins and streaks? Best times are kept."
          zoom={dialogZoom}
          onConfirm={() => {
            updateRecords(resetStatistics);
            setDialog(null);
          }}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'confirm-new' && (
        <ConfirmDialog
          title="Minesweeper"
          message={
            <>
              Start a new {DIFFICULTY_LABELS[dialog.difficulty]} game?
              <br />
              The current game will be abandoned. Your records are kept.
            </>
          }
          zoom={dialogZoom}
          onConfirm={() => {
            setDialog(null);
            startGame(dialog.difficulty);
          }}
          onClose={closeDialog}
        />
      )}
      {(dialog?.kind === 'help' || dialog?.kind === 'about') && (
        <HelpDialog topic={dialog.kind} zoom={dialogZoom} persistent={store.persistent} onClose={closeDialog} />
      )}
      {dialog?.kind === 'name' && (
        <NameDialog
          levelText={dialog.levelText}
          seconds={dialog.seconds}
          initialName={settings.playerName}
          zoom={dialogZoom}
          onSave={(name) => {
            updateRecords((r) => renameBestTime(r, dialog.slot, name));
            updateSettings({ playerName: name });
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
