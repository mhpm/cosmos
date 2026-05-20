import { useState, useEffect, useRef } from 'react';
import type { Body, PhysicsConfig, Spaceship } from './physics/types';
import { PRESETS } from './physics/presets';
import { stepPhysics, stepSpaceship } from './physics/engine';
import { SolarCanvas } from './components/SolarCanvas';
import { ControlPanel } from './components/ControlPanel';
import { PlanetInspector } from './components/PlanetInspector';
import './App.css';

const DEFAULT_CONFIG: PhysicsConfig = {
  G: 0.1,
  timeScale: 1.0,
  collisionMode: 'merge',
  trailsEnabled: true,
  gridEnabled: true,
  vectorsEnabled: false,
  forceVectorsEnabled: false,
  gridResolution: 50,
  elasticity: 0.7,
  followBodyId: null,
  cameraZoom: 1.0,
  cameraOffsetX: 0,
  cameraOffsetY: 0,
  shipSpawned: false,
  followShip: false,
};

function App() {
  // Config state (used to sync controls UI)
  const [config, setConfig] = useState<PhysicsConfig>(DEFAULT_CONFIG);
  const configRef = useRef<PhysicsConfig>(DEFAULT_CONFIG);

  // Sync config state to ref for physics loop
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Selected Planet ID
  const [selectedBodyId, setSelectedBodyId] = useState<string | null>(null);

  // Spawning planet template
  const [launchPreset, setLaunchPreset] = useState<{ mass: number; radius: number; color: string; name: string } | null>(null);

  // Bodies mutable ref for high-fps simulations
  const bodiesRef = useRef<Body[]>([]);
  
  // Spaceship state and mutable ref for high-fps updates
  const [ship, setShip] = useState<Spaceship | null>(null);
  const shipRef = useRef<Spaceship | null>(null);

  useEffect(() => {
    shipRef.current = ship;
  }, [ship]);

  // Keyboard input states
  const keysPressedRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (
        ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)
      ) {
        keysPressedRef.current[e.key] = true;
        // Prevent browser scrolling with arrow keys
        if (e.key.startsWith('Arrow')) {
          e.preventDefault();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (
        ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)
      ) {
        keysPressedRef.current[e.key] = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);
  
  // HUD states (polled at intervals to prevent component lag)
  const [bodyCount, setBodyCount] = useState<number>(0);
  const [fps, setFps] = useState<number>(60);
  const frameCountRef = useRef<number>(0);
  const lastFpsTimeRef = useRef<number>(0);

  // Canvas draw callback registration
  const drawCallbackRef = useRef<(() => void) | null>(null);

  // Preset loader
  const loadPreset = (key: string) => {
    const preset = PRESETS[key];
    if (!preset) return;

    // Build bodies with trail and accelerations
    const initializedBodies: Body[] = preset.bodies.map(b => ({
      ...b,
      ax: 0,
      ay: 0,
      trail: []
    }));

    bodiesRef.current = initializedBodies;
    setBodyCount(initializedBodies.length);
    setSelectedBodyId(null);
    setLaunchPreset(null);
    setShip(null);

    // Apply config changes from preset
    setConfig(prev => ({
      ...prev,
      ...preset.config,
      followBodyId: null,
      shipSpawned: false,
      followShip: false,
      cameraZoom: key === 'accretionDisk' ? 0.75 : 1.0,
      cameraOffsetX: window.innerWidth / 2,
      cameraOffsetY: window.innerHeight / 2,
    }));
  };

  // Clear all bodies from simulation
  const clearSimulation = () => {
    bodiesRef.current = [];
    setBodyCount(0);
    setSelectedBodyId(null);
    setLaunchPreset(null);
    setShip(null);
    setConfig(prev => ({
      ...prev,
      followBodyId: null,
      shipSpawned: false,
      followShip: false
    }));
  };

  // Delete specific body
  const deleteBody = (id: string) => {
    bodiesRef.current = bodiesRef.current.filter(b => b.id !== id);
    setBodyCount(bodiesRef.current.length);
    if (config.followBodyId === id) {
      setConfig(prev => ({ ...prev, followBodyId: null }));
    }
  };

  const spawnShip = () => {
    const zoom = configRef.current.cameraZoom;
    const offsetX = configRef.current.cameraOffsetX;
    const offsetY = configRef.current.cameraOffsetY;
    const screenCenterX = window.innerWidth / 2;
    const screenCenterY = window.innerHeight / 2;

    const simX = (screenCenterX - offsetX) / zoom;
    const simY = (screenCenterY - offsetY) / zoom;

    const newShip: Spaceship = {
      x: simX,
      y: simY - 140,
      vx: 35,
      vy: 0,
      angle: 0,
      active: true,
      thrusting: false,
      braking: false,
    };

    setShip(newShip);
    setConfig(prev => ({
      ...prev,
      shipSpawned: true,
      followShip: true,
      followBodyId: null
    }));
  };

  const destroyShip = () => {
    setShip(null);
    setConfig(prev => ({
      ...prev,
      shipSpawned: false,
      followShip: false,
    }));
    keysPressedRef.current = {};
  };

  // Load initial preset (Solar System)
  useEffect(() => {
    loadPreset('solarSystem');
    lastFpsTimeRef.current = performance.now();
  }, []);

  // Main simulation and render loop
  useEffect(() => {
    let animationId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      let dt = (time - lastTime) / 1000;
      lastTime = time;

      if (dt > 0.05) dt = 0.02;

      // 2. Physics step (if not paused)
      if (configRef.current.timeScale > 0) {
        if (bodiesRef.current.length > 0) {
          bodiesRef.current = stepPhysics(bodiesRef.current, configRef.current, dt);
        }

        // Spaceship physics step
        const currentShip = shipRef.current;
        if (currentShip && currentShip.active) {
          const { ship: updatedShip, collided } = stepSpaceship(
            currentShip,
            bodiesRef.current,
            configRef.current,
            keysPressedRef.current,
            dt
          );

          shipRef.current = updatedShip;
          
          if (collided) {
            setShip(updatedShip); // instantly trigger React state update for crash HUD
          }
        }
      }

      // 3. Draw scene
      if (drawCallbackRef.current) {
        drawCallbackRef.current();
      }

      // 4. Track FPS, Body Count, and Spaceship HUD telemetry
      frameCountRef.current++;
      if (time - lastFpsTimeRef.current >= 200) {
        const measuredFps = Math.round((frameCountRef.current * 1000) / (time - lastFpsTimeRef.current));
        setFps(measuredFps);
        setBodyCount(bodiesRef.current.length);

        if (shipRef.current) {
          setShip(shipRef.current);
        }

        frameCountRef.current = 0;
        lastFpsTimeRef.current = time;
      }

      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, []);

  const registerDrawCallback = (callback: () => void) => {
    drawCallbackRef.current = callback;
  };

  return (
    <div className="app-container">
      {/* Simulation viewport canvas */}
      <SolarCanvas
        bodiesRef={bodiesRef}
        config={config}
        selectedBodyId={selectedBodyId}
        setSelectedBodyId={setSelectedBodyId}
        launchPreset={launchPreset}
        onSimulationTick={registerDrawCallback}
        shipRef={shipRef}
      />

      {/* Floating control panel */}
      <ControlPanel
        config={config}
        setConfig={setConfig}
        loadPreset={loadPreset}
        clearSimulation={clearSimulation}
        launchPreset={launchPreset}
        setLaunchPreset={setLaunchPreset}
        ship={ship}
        spawnShip={spawnShip}
        destroyShip={destroyShip}
      />

      {/* Floating inspector panel */}
      {selectedBodyId && (
        <PlanetInspector
          selectedBodyId={selectedBodyId}
          setSelectedBodyId={setSelectedBodyId}
          bodiesRef={bodiesRef}
          config={config}
          setConfig={setConfig}
          onDeleteBody={deleteBody}
        />
      )}

      {/* Bottom HUD stats */}
      <div className="bottom-hud">
        <div className="hud-metric">
          <span className="hud-label">CUERPOS:</span>
          <span className="hud-val text-cyan">{bodyCount}</span>
        </div>
        <div className="hud-separator">|</div>
        <div className="hud-metric">
          <span className="hud-label">FPS:</span>
          <span className="hud-val text-green">{fps}</span>
        </div>
        {launchPreset && (
          <>
            <div className="hud-separator">|</div>
            <div className="hud-notification blinking">
              HAZ CLIC Y ARRASTRA PARA PROYECTAR EL VECTOR DE VELOCIDAD
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
