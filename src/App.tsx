import { useState, useEffect, useRef } from 'react';
import type {
  Body,
  PhysicsConfig,
  Spaceship,
  Bullet,
  AlienShip,
} from './physics/types';
import { PRESETS } from './physics/presets';
import { stepPhysics, stepSpaceship, stepCombat } from './physics/engine';
import { SolarCanvas } from './components/SolarCanvas';
import { PlanetInspector } from './components/PlanetInspector';
import './App.css';

type SpaceAmbienceHandle = {
  stop: () => void;
};

const createSpaceMissionMusic = (
  audioContext: AudioContext,
): SpaceAmbienceHandle => {
  const audio = new Audio('/space.mp3');
  audio.loop = true;
  audio.volume = 0.5;

  const source = audioContext.createMediaElementSource(audio);
  source.connect(audioContext.destination);

  void audio.play();

  return {
    stop: () => {
      audio.pause();
      audio.src = '';
      source.disconnect();
    },
  };
};

const playExplosionSound = () => {
  const audio = new Audio('/explosion.mp3');
  audio.volume = 0.7;
  void audio.play();
};

const playEnemyExplosionSound = () => {
  const audio = new Audio('/enemies_explosion.mp3');
  audio.volume = 0.4;
  void audio.play();
};

const playLazerSound = () => {
  const audio = new Audio('/lazer.mp3');
  audio.volume = 0.1;
  void audio.play();
};

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

  const audioContextRef = useRef<AudioContext | null>(null);
  const ambienceRef = useRef<SpaceAmbienceHandle | null>(null);

  useEffect(() => {
    let cancelled = false;

    const startAudio = async () => {
      if (cancelled) return;
      if (audioContextRef.current) return;

      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctx) return;

      const ctx = new Ctx();
      audioContextRef.current = ctx;
      ambienceRef.current = createSpaceMissionMusic(ctx);

      try {
        await ctx.resume();
      } catch {}
    };

    const onFirstInteraction = () => {
      void startAudio();
    };

    window.addEventListener('pointerdown', onFirstInteraction, { once: true });
    window.addEventListener('keydown', onFirstInteraction, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener('pointerdown', onFirstInteraction);
      window.removeEventListener('keydown', onFirstInteraction);

      ambienceRef.current?.stop();
      ambienceRef.current = null;

      const ctx = audioContextRef.current;
      audioContextRef.current = null;
      if (ctx) {
        void ctx.close();
      }
    };
  }, []);

  // Sync config state to ref for physics loop
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Selected Planet ID
  const [selectedBodyId, setSelectedBodyId] = useState<string | null>(null);

  // Spawning planet template
  const [launchPreset, setLaunchPreset] = useState<{
    mass: number;
    radius: number;
    color: string;
    name: string;
  } | null>(null);

  // Bodies mutable ref for high-fps simulations
  const bodiesRef = useRef<Body[]>([]);

  // Spaceship state and mutable ref for high-fps updates
  const [ship, setShip] = useState<Spaceship | null>(null);
  const shipRef = useRef<Spaceship | null>(null);

  useEffect(() => {
    shipRef.current = ship;
  }, [ship]);

  // Combat mutable refs for high-fps updates
  const bulletsRef = useRef<Bullet[]>([]);
  const alienShipsRef = useRef<AlienShip[]>([]);
  const spawnAlienTimerRef = useRef<number>(0);
  const shootCooldownRef = useRef<number>(0);

  // Keyboard input states
  const keysPressedRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (
        [
          'w',
          'a',
          's',
          'd',
          'arrowup',
          'arrowdown',
          'arrowleft',
          'arrowright',
          ' ',
        ].includes(key)
      ) {
        keysPressedRef.current[e.key] = true;
        // Prevent browser scrolling with space or arrow keys
        if (e.key === ' ' || e.key.startsWith('Arrow')) {
          e.preventDefault();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (
        [
          'w',
          'a',
          's',
          'd',
          'arrowup',
          'arrowdown',
          'arrowleft',
          'arrowright',
          ' ',
        ].includes(key)
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
  const [killCount, setKillCount] = useState<number>(0);
  const killCountRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const lastFpsTimeRef = useRef<number>(0);

  // Canvas draw callback registration
  const drawCallbackRef = useRef<(() => void) | null>(null);

  // Spawners for Aliens and Player Laser
  const spawnAlienShip = () => {
    const angle = Math.random() * Math.PI * 2;
    const distance = 450 + Math.random() * 150;

    const sun = bodiesRef.current.find((b) => b.id === 'sun') || { x: 0, y: 0 };
    const sx = sun.x + Math.cos(angle) * distance;
    const sy = sun.y + Math.sin(angle) * distance;

    const tx = -Math.sin(angle);
    const ty = Math.cos(angle);
    const orbitalSpeed = (Math.random() - 0.5) * 15;
    const inwardSpeed = -20 - Math.random() * 15;

    const vx = tx * orbitalSpeed + Math.cos(angle) * inwardSpeed;
    const vy = ty * orbitalSpeed + Math.sin(angle) * inwardSpeed;

    const newAlien: AlienShip = {
      id: `alien-${Math.random().toString(36).substr(2, 9)}`,
      x: sx,
      y: sy,
      vx,
      vy,
      radius: 6.0,
      color: '#10b981',
      hp: 20,
      maxHp: 20,
      shootCooldown: 1.5 + Math.random() * 1.5,
    };

    alienShipsRef.current.push(newAlien);
  };

  const firePlayerLaser = () => {
    const currentShip = shipRef.current;
    if (!currentShip || !currentShip.active) return;

    const noseDist = 9.0;
    const px = currentShip.x + Math.cos(currentShip.angle) * noseDist;
    const py = currentShip.y + Math.sin(currentShip.angle) * noseDist;

    const bulletSpeed = 280;
    const bVx = Math.cos(currentShip.angle) * bulletSpeed + currentShip.vx;
    const bVy = Math.sin(currentShip.angle) * bulletSpeed + currentShip.vy;

    const newBullet: Bullet = {
      id: `player-laser-${Math.random().toString(36).substr(2, 9)}`,
      x: px,
      y: py,
      vx: bVx,
      vy: bVy,
      isEnemy: false,
      radius: 2,
      color: '#00f2fe',
      lifeTime: 3.0,
    };

    bulletsRef.current.push(newBullet);
    playLazerSound();
  };

  // Preset loader
  const loadPreset = (key: string) => {
    const preset = PRESETS[key];
    if (!preset) return;

    // Build bodies with trail and accelerations
    const initializedBodies: Body[] = preset.bodies.map((b) => {
      let x = b.x;
      let y = b.y;
      let vx = b.vx;
      let vy = b.vy;

      // Randomize initial planet positions for the solar system preset (stable Keplerian orbits)
      if (key === 'solarSystem' && !b.isStatic) {
        const theta = Math.random() * Math.PI * 2;
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);

        // Rotate position vector around origin
        x = b.x * cos - b.y * sin;
        y = b.x * sin + b.y * cos;

        // Rotate velocity vector around origin
        vx = b.vx * cos - b.vy * sin;
        vy = b.vx * sin + b.vy * cos;
      }

      return {
        ...b,
        x,
        y,
        vx,
        vy,
        ax: 0,
        ay: 0,
        trail: [],
      };
    });

    bodiesRef.current = initializedBodies;
    setBodyCount(initializedBodies.length);
    setSelectedBodyId(null);
    setLaunchPreset(null);

    // Reset Combat States
    bulletsRef.current = [];
    alienShipsRef.current = [];
    spawnAlienTimerRef.current = 3.0; // Start at 3.0 so the next one spawns in 3 seconds (with a 6-second cooldown)
    shootCooldownRef.current = 0;
    killCountRef.current = 0;
    setKillCount(0);

    const hasEarth = preset.bodies.some((b) => b.id === 'earth');

    let initialShip: Spaceship | null = null;
    if (hasEarth) {
      spawnAlienShip();
      spawnAlienShip();

      const earthBody = initializedBodies.find((b) => b.id === 'earth');
      if (earthBody) {
        initialShip = {
          x: earthBody.x,
          y: earthBody.y - 35,
          vx: earthBody.vx + 25, // Match Earth velocity + offset orbital speed
          vy: earthBody.vy,
          angle: -Math.PI / 2, // Heading upwards
          active: true,
          thrusting: false,
          braking: false,
        };
      }
    }
    setShip(initialShip);
    shipRef.current = initialShip;

    // Apply config changes from preset
    setConfig((prev) => ({
      ...prev,
      ...preset.config,
      followBodyId: null,
      shipSpawned: hasEarth,
      followShip: hasEarth,
      cameraZoom: key === 'accretionDisk' ? 0.75 : 1.0,
      cameraOffsetX: window.innerWidth / 2,
      cameraOffsetY: window.innerHeight / 2,
      gameStatus: hasEarth ? 'playing' : undefined,
      earthHp: hasEarth ? 100 : undefined,
      maxEarthHp: hasEarth ? 100 : undefined,
    }));
  };

  // Delete specific body
  const deleteBody = (id: string) => {
    bodiesRef.current = bodiesRef.current.filter((b) => b.id !== id);
    setBodyCount(bodiesRef.current.length);
    if (config.followBodyId === id) {
      setConfig((prev) => ({ ...prev, followBodyId: null }));
    }
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
          bodiesRef.current = stepPhysics(
            bodiesRef.current,
            configRef.current,
            dt,
          );
        }

        // Spaceship physics step
        const currentShip = shipRef.current;
        if (currentShip && currentShip.active) {
          const { ship: updatedShip, collided } = stepSpaceship(
            currentShip,
            bodiesRef.current,
            configRef.current,
            keysPressedRef.current,
            dt,
          );

          shipRef.current = updatedShip;

          if (collided) {
            setShip(updatedShip); // instantly trigger React state update for crash HUD
          }
        }

        // Combat updates
        if (configRef.current.gameStatus === 'playing') {
          // Alien spawning timer
          const earthExists = bodiesRef.current.some((b) => b.id === 'earth');
          if (earthExists) {
            spawnAlienTimerRef.current += dt * configRef.current.timeScale;
            // Spawn an alien ship every 6 seconds (cap at 6 ships simultaneously)
            if (spawnAlienTimerRef.current >= 6.0) {
              spawnAlienTimerRef.current = 0;
              if (alienShipsRef.current.length < 6) {
                spawnAlienShip();
              }
            }
          }

          // Spacebar shooting trigger
          if (shootCooldownRef.current > 0) {
            shootCooldownRef.current -= dt * configRef.current.timeScale;
          }
          if (
            keysPressedRef.current[' '] &&
            shootCooldownRef.current <= 0 &&
            currentShip &&
            currentShip.active
          ) {
            firePlayerLaser();
            shootCooldownRef.current = 0.22; // 220ms firing delay
          }

          // Step combat physics (moves bullets, steps aliens, checks hits/HP)
          const {
            bullets: nextB,
            alienShips: nextA,
            earthDamage,
          } = stepCombat(
            bulletsRef.current,
            alienShipsRef.current,
            bodiesRef.current,
            configRef.current,
            dt,
            () => {
              killCountRef.current++;
              playEnemyExplosionSound();
            },
          );

          bulletsRef.current = nextB;
          alienShipsRef.current = nextA;

          if (earthDamage > 0 && configRef.current.earthHp !== undefined) {
            configRef.current.earthHp = Math.max(
              0,
              configRef.current.earthHp - earthDamage,
            );

            if (configRef.current.earthHp <= 0) {
              configRef.current.gameStatus = 'gameover';
              playExplosionSound();
              // Delete Earth body so it explodes
              bodiesRef.current = bodiesRef.current.filter(
                (b) => b.id !== 'earth',
              );
            }
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
        const measuredFps = Math.round(
          (frameCountRef.current * 1000) / (time - lastFpsTimeRef.current),
        );
        setFps(measuredFps);
        setBodyCount(bodiesRef.current.length);

        if (shipRef.current) {
          setShip(shipRef.current);
        }

        setKillCount(killCountRef.current);

        // Synchronize combat config state to React state
        setConfig((prev) => ({
          ...prev,
          earthHp: configRef.current.earthHp,
          gameStatus: configRef.current.gameStatus,
        }));

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
        bulletsRef={bulletsRef}
        alienShipsRef={alienShipsRef}
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

      {/* Game Over holographic overlay screen */}
      {config.gameStatus === 'gameover' && (
        <div className="game-over-overlay">
          <div className="game-over-card">
            <h1 className="game-over-title">FIN DE LA TRANSMISIÓN</h1>
            <div className="game-over-divider"></div>
            <p className="game-over-desc">
              La Tierra ha sido destruida por el bombardeo de las naves
              invasoras extraterrestres. La raza humana se ha extinguido.
            </p>
            <div className="game-over-stats">
              <div className="stat-row">
                <span className="stat-label">Enemigos Derrotados:</span>
                <span className="stat-val text-cyan">{killCount}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">
                  Amenazas Alienígenas Restantes:
                </span>
                <span className="stat-val text-red">
                  {alienShipsRef.current.length} cazas
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Estado de tu Caza Estelar:</span>
                <span
                  className={`stat-val ${ship && ship.active ? 'text-green' : 'text-red'}`}
                >
                  {ship && ship.active ? 'INTEGRO' : 'DESTRUIDO'}
                </span>
              </div>
            </div>
            <button
              className="game-over-btn"
              onClick={() => loadPreset('solarSystem')}
            >
              RE-DESPLEGAR INTERCEPTOR Y DEFENDER LA TIERRA
            </button>
          </div>
        </div>
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
        {config.gameStatus === 'playing' && (
          <>
            <div className="hud-separator">|</div>
            <div className="hud-metric">
              <span className="hud-label">BAJAS:</span>
              <span className="hud-val text-cyan">{killCount}</span>
            </div>
          </>
        )}
        {config.gameStatus === 'playing' && config.earthHp !== undefined && (
          <>
            <div className="hud-separator">|</div>
            <div className="hud-metric">
              <span className="hud-label">VIDA TIERRA:</span>
              <span
                className={`hud-val ${config.earthHp < 30 ? 'text-red' : 'text-green'}`}
              >
                {Math.ceil(config.earthHp)}%
              </span>
            </div>
          </>
        )}
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
