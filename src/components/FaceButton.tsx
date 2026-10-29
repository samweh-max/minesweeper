import { memo } from 'react';
import { faceLayers, type FaceKind } from '../ui/sprites';
import { Sprite } from './Sprite';

const LABELS: Record<FaceKind, string> = {
  smile: 'New game',
  surprised: 'New game',
  cool: 'You won. New game',
  dead: 'Game over. New game',
};

interface FaceButtonProps {
  face: FaceKind;
  onClick: () => void;
}

export const FaceButton = memo(function FaceButton({ face, onClick }: FaceButtonProps) {
  return (
    <button
      type="button"
      className="face"
      data-face={face}
      aria-label={LABELS[face]}
      title="New game (F2)"
      onClick={onClick}
    >
      <Sprite layers={faceLayers[face]} size={17} className="face__img" />
    </button>
  );
});
