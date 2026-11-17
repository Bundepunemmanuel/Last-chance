import React, { useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import type { VirtualInputState } from '../game/types';

interface TouchControlsProps {
  inputRef: React.MutableRefObject<VirtualInputState>;
  movementMode: 'idle' | 'walk' | 'run' | 'air';
}

const MAX_RADIUS = 48;

export const TouchControls: React.FC<TouchControlsProps> = ({ inputRef, movementMode }) => {
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const stickPointerId = useRef<number | null>(null);
  const jumpPointerId = useRef<number | null>(null);

  const [stickActive, setStickActive] = useState(false);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [jumpActive, setJumpActive] = useState(false);

  const originRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const updateStickFromClient = (clientX: number, clientY: number) => {
    let dx = clientX - originRef.current.x;
    let dy = clientY - originRef.current.y;
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
    setOrigin(null);
    setKnobOffset({ x: 0, y: 0 });
    inputRef.current.moveX = 0;
    inputRef.current.moveY = 0;
  };

  const onZonePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stickPointerId.current !== null) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    stickPointerId.current = e.pointerId;

    const zone = zoneRef.current;
    if (zone) {
      const rect = zone.getBoundingClientRect();
      // Clamp floating joystick center inside safe zone bounds
      const localX = Math.max(62, Math.min(rect.width - 62, e.clientX - rect.left));
      const localY = Math.max(62, Math.min(rect.height - 62, e.clientY - rect.top));
      const screenOriginX = rect.left + localX;
      const screenOriginY = rect.top + localY;
      originRef.current = { x: screenOriginX, y: screenOriginY };
      setOrigin({ x: localX, y: localY });
    } else {
      originRef.current = { x: e.clientX, y: e.clientY };
    }

    setStickActive(true);
    setKnobOffset({ x: 0, y: 0 });
    inputRef.current.moveX = 0;
    inputRef.current.moveY = 0;
  };

  const onZonePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stickPointerId.current !== e.pointerId) return;
    e.preventDefault();
    updateStickFromClient(e.clientX, e.clientY);
  };

  const onZonePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
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

  const isRunning = stickActive && movementMode === 'run';

  return (
    <div className="pointer-events-none fixed inset-0 z-20">
      {/* Left-Half Floating Virtual Joystick Touch Zone */}
      <div
        ref={zoneRef}
        onPointerDown={onZonePointerDown}
        onPointerMove={onZonePointerMove}
        onPointerUp={onZonePointerUp}
        onPointerCancel={onZonePointerUp}
        aria-label="Movement Joystick Area"
        role="slider"
        aria-valuetext={movementMode}
        className="pointer-events-auto safe-controls-bottom absolute bottom-0 left-0 h-[66%] w-[46%] touch-none"
      >
        {/* Active floating stick OR subtle resting anchor in bottom-left */}
        <div
          style={
            stickActive && origin
              ? {
                  left: `${origin.x}px`,
                  top: `${origin.y}px`,
                  transform: 'translate(-50%, -50%)',
                }
              : undefined
          }
          className={`pointer-events-none flex h-28 w-28 items-center justify-center rounded-full border transition-opacity ${
            stickActive && origin
              ? `absolute opacity-100 ${
                  isRunning ? 'border-amber-400/80 bg-[#0d131c]/65' : 'border-emerald-400/70 bg-[#0d131c]/60'
                }`
              : 'absolute bottom-5 left-5 border-slate-400/35 bg-[#0d131c]/40 opacity-65 sm:bottom-7 sm:left-7'
          }`}
        >
          {/* Analog Walk vs Run Ring */}
          <div className="h-14 w-14 rounded-full border border-dashed border-slate-400/35" />

          {/* Thumbstick Knob */}
          <div
            style={{
              transform: `translate3d(${knobOffset.x}px, ${knobOffset.y}px, 0)`,
            }}
            className={`absolute h-12 w-12 rounded-full border shadow-lg transition-colors ${
              stickActive
                ? isRunning
                  ? 'border-amber-200 bg-amber-500/90'
                  : 'border-emerald-200 bg-emerald-400/85'
                : 'border-slate-300/50 bg-slate-200/20'
            }`}
          />
        </div>
      </div>

      {/* Right-Thumb Tactile Jump Button */}
      <div className="safe-controls-bottom pointer-events-none absolute right-0 bottom-0 flex items-end justify-end pr-4 pb-4 sm:pr-7 sm:pb-6">
        <button
          type="button"
          onPointerDown={onJumpPointerDown}
          onPointerUp={onJumpPointerUp}
          onPointerCancel={onJumpPointerUp}
          aria-label="Jump"
          className={`pointer-events-auto flex h-[84px] w-[84px] touch-none flex-col items-center justify-center rounded-full border-2 font-display text-xs font-bold tracking-wider transition-transform focus-visible:outline-2 focus-visible:outline-amber-400 ${
            jumpActive
              ? 'scale-92 border-amber-200 bg-amber-500 text-slate-950 shadow-[0_0_24px_rgba(245,158,11,0.5)]'
              : 'border-amber-400/85 bg-[#101722]/75 text-amber-300 shadow-lg'
          }`}
        >
          <ArrowUp className="h-6 w-6 stroke-[2.5]" />
          <span>JUMP</span>
        </button>
      </div>
    </div>
  );
};
