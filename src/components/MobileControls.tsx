import React, { useRef, useState } from 'react';

interface MobileControlsProps {
  keysPressedRef: React.MutableRefObject<Record<string, boolean>>;
}

export const MobileControls: React.FC<MobileControlsProps> = ({
  keysPressedRef,
}) => {
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  const baseRef = useRef<HTMLDivElement>(null);
  const touchIdRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (touchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    touchIdRef.current = touch.identifier;
    updateJoystick(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchIdRef.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchIdRef.current) {
        updateJoystick(
          e.changedTouches[i].clientX,
          e.changedTouches[i].clientY,
        );
        break;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchIdRef.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchIdRef.current) {
        touchIdRef.current = null;
        setJoystickPos({ x: 0, y: 0 });
        updateKeys(0, 0);
        break;
      }
    }
  };

  const updateJoystick = (clientX: number, clientY: number) => {
    if (!baseRef.current) return;
    const rect = baseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxDist = rect.width / 2;

    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > maxDist) {
      dx = (dx / dist) * maxDist;
      dy = (dy / dist) * maxDist;
    }

    setJoystickPos({ x: dx, y: dy });

    // Normalizamos el movimiento a valores de entre -1 y 1
    updateKeys(dx / maxDist, dy / maxDist);
  };

  const updateKeys = (nx: number, ny: number) => {
    const threshold = 0.3; // Umbral de sensibilidad
    const keys = keysPressedRef.current;

    keys['w'] = ny < -threshold;
    keys['s'] = ny > threshold;
    keys['a'] = nx < -threshold;
    keys['d'] = nx > threshold;
  };

  const handleFireStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    keysPressedRef.current[' '] = true;
  };

  const handleFireEnd = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    keysPressedRef.current[' '] = false;
  };

  return (
    <div className="mobile-controls">
      <div
        className="joystick-base"
        ref={baseRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div
          className="joystick-knob"
          style={{
            transform: `translate(${joystickPos.x}px, ${joystickPos.y}px)`,
          }}
        />
      </div>

      <button
        className="fire-btn"
        onTouchStart={handleFireStart}
        onTouchEnd={handleFireEnd}
        onMouseDown={handleFireStart}
        onMouseUp={handleFireEnd}
        onMouseLeave={handleFireEnd}
      >
        FUEGO
      </button>
    </div>
  );
};
