import React, { useRef, useState } from 'react';
import { ArrowUp, Footprints } from 'lucide-react';
import type { VirtualInputState } from '../game/types';

interface TouchControlsProps {
  inputRef: React.MutableRefObject<VirtualInputState>;
  movementMode: 'idle' | 'walk' | 'run' | 'air';
}

const MAX_RADIUS = 46;

export const TouchControls: React.FC<TouchControlsProps> = ({ inputRef, movementMode }) => {
  const padRef = useRef<HTMLDivElement | null>(null);
  const stickPointerId = useRef<number | null>(null);
  const jumpPointerId = useRef<number | null>(null);

  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [stickActive, setStickActive] = useState(false);
  const [jumpActive, setJumpActive] = useState(false);
  const [walkLocked, setWalkLocked] = useState(false);

  const updateStickFromClient = (clientX: number, clientY: number) => {
    const el = padRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > MAX_RADIUS) {
      dx = (dx / dist) * MAX_RADIUS;
      dy = (dy / dist) * MAX_RADIUS;
    }
    setKnobOffset({ x: dx, y: dy });
    inputRef.current.moveX = dx / MAX_RADIUS;
    // Screen up (-dy) corresponds to forward (+moveY)
    inputRef.current.moveY = -dy / MAX_RADIUS;
  };

  const resetStick = () => {
    stickPointerId.current = null;
    setStickActive(false);
    setKnobOffset({ x: 0, y: 0 });
    inputRef.current.moveX = 0;
    inputRef.current.moveY = 0;
  };

  const onStickPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    stickPointerId.current = e.pointerId;
    setStickActive(true);
    updateStickFromClient(e.clientX, e.clientY);
  };

  const onStickPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stickPointerId.current !== e.pointerId) return;
    e.preventDefault();
    updateStickFromClient(e.clientX, e.clientY);
  };

  const onStickPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stickPointerId.current !== e.pointerId) return;
    e.preventDefault();
    resetStick();
  };

  const onJumpPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    jumpPointerId.current = e.pointerId;
    setJumpActive(true);
    inputRef.current.jumpPressed = true;
  };

  const onJumpPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (jumpPointerId.current !== e.pointerId) return;
    e.preventDefault();
    jumpPointerId.current = null;
    setJumpActive(false);
    inputRef.current.jumpPressed = false;
  };

  const toggleWalk = () => {
    const next = !walkLocked;
    setWalkLocked(next);
    inputRef.current.walkModifier = next;
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex items-end justify-between px-5 pb-5 sm:px-8 sm:pb-7">
      {/* Left Thumb Zone: Virtual Analog Joystick */}
      <div className="pointer-events-auto flex flex-col items-center gap-2">
        <div
          ref={padRef}
          onPointerDown={onStickPointerDown}
          onPointerMove={onStickPointerMove}
          onPointerUp={onStickPointerUp}
          onPointerCancel={onStickPointerUp}
          aria-label="Movement Joystick"
          role="slider"
          aria-valuetext={movementMode}
          className={`relative flex h-32 w-32 touch-none items-center justify-center rounded-full border transition-colors ${
            stickActive
              ? 'border-amber-400/80 bg-[#0d131c]/85'
              : 'border-slate-500/45 bg-[#0d131c]/70'
          }`}
        >
          {/* Inner Walk-Threshold Ring */}
          <div className="pointer-events-none h-16 w-16 rounded-full border border-dashed border-slate-500/35" />

          {/* Draggable Thumbstick Knob */}
          <div
            style={{
              transform: `translate3d(${knobOffset.x}px, ${knobOffset.y}px, 0)`,
            }}
            className={`pointer-events-none absolute h-12 w-12 rounded-full border shadow-lg transition-colors ${
              stickActive
                ? 'border-amber-300 bg-amber-500/90'
                : 'border-slate-300/60 bg-slate-200/25'
            }`}
          />
        </div>
        <span className="text-[11px] font-medium tracking-wide text-slate-300/80">
          {movementMode === 'walk' ? 'Walking' : movementMode === 'run' ? 'Running' : 'Move'}
        </span>
      </div>

      {/* Right Thumb Zone: Precision Walk Toggle + Jump Button */}
      <div className="pointer-events-auto flex items-end gap-4">
        <button
          type="button"
          onClick={toggleWalk}
          aria-pressed={walkLocked}
          className={`flex h-12 min-w-[48px] items-center justify-center gap-1.5 rounded-xl border px-3.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
            walkLocked
              ? 'border-amber-400 bg-amber-500/25 text-amber-200'
              : 'border-slate-500/45 bg-[#0d131c]/75 text-slate-300 hover:border-slate-400'
          }`}
        >
          <Footprints className="h-4 w-4" />
          <span>Walk</span>
        </button>

        <button
          type="button"
          onPointerDown={onJumpPointerDown}
          onPointerUp={onJumpPointerUp}
          onPointerCancel={onJumpPointerUp}
          aria-label="Jump"
          className={`flex h-20 w-20 touch-none flex-col items-center justify-center rounded-full border-2 font-display text-xs font-bold tracking-wider transition-transform focus-visible:outline-2 focus-visible:outline-amber-400 ${
            jumpActive
              ? 'scale-95 border-amber-300 bg-amber-500 text-slate-950'
              : 'border-amber-400/80 bg-[#121924]/85 text-amber-300 hover:bg-[#182230]/90'
          }`}
        >
          <ArrowUp className="h-6 w-6" />
          <span>JUMP</span>
        </button>
      </div>
    </div>
  );
};
