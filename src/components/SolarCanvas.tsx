import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import {
  Application,
  Color,
  Container,
  Graphics,
  Rectangle,
  Text,
} from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';

const lerpColor = (baseColorHex: string, targetColorHex: string, factor: number): string => {
  const c1 = new Color(baseColorHex).toRgba();
  const c2 = new Color(targetColorHex).toRgba();
  const r = c1.r + (c2.r - c1.r) * factor;
  const g = c1.g + (c2.g - c1.g) * factor;
  const b = c1.b + (c2.b - c1.b) * factor;
  return new Color([r, g, b]).toHex();
};

const getAlienSeed = (id: string): number => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 100;
};
import type {
  AlienShip,
  Body,
  Bullet,
  Particle,
  PhysicsConfig,
  Point,
  Satellite,
  Spaceship,
} from '../physics/types';

interface SolarCanvasProps {
  bodiesRef: MutableRefObject<Body[]>;
  config: PhysicsConfig;
  selectedBodyId: string | null;
  setSelectedBodyId: (id: string | null) => void;
  launchPreset: {
    mass: number;
    radius: number;
    color: string;
    name: string;
  } | null;
  onSimulationTick: (callback: (dt: number) => void) => void;
  shipRef: MutableRefObject<Spaceship | null>;
  bulletsRef: MutableRefObject<Bullet[]>;
  alienShipsRef: MutableRefObject<AlienShip[]>;
  satellitesRef: MutableRefObject<Satellite[]>;
}


type CameraState = {
  zoom: number;
  offsetX: number;
  offsetY: number;
  isDragging: boolean;
  dragStartX: number;
  dragStartY: number;
};

type TextPools = {
  bodyLabels: Map<string, Text>;
  alienDistances: Map<string, Text>;
  earthHp: Text | null;
  launchVelocity: Text | null;
};

type PixiLayers = {
  background: Graphics;
  stars: Graphics;
  grid: Graphics;
  trails: Graphics;
  bodies: Graphics;
  satellites: Graphics;
  particles: Graphics;
  bullets: Graphics;
  aliens: Graphics;
  ship: Graphics;
  overlays: Graphics;
  labels: Container;
};


type PixiScene = {
  app: Application;
  hitArea: Rectangle;
  layers: PixiLayers;
};

const BODY_LABEL_STYLE = {
  fontFamily: 'Orbitron, Inter, sans-serif',
  fontSize: 11,
  fill: '#ffffff',
};

const SMALL_HUD_STYLE = {
  fontFamily: 'Orbitron, Inter, sans-serif',
  fontSize: 8,
  fill: '#ffffff',
};

const ALIEN_DISTANCE_STYLE = {
  fontFamily: 'monospace',
  fontSize: 9,
  fill: '#10b981',
};

const LAUNCH_TEXT_STYLE = {
  fontFamily: 'Inter, sans-serif',
  fontSize: 12,
  fill: '#ffffff',
};

const createLayers = (): PixiLayers => ({
  background: new Graphics({ label: 'background-layer' }),
  stars: new Graphics({ label: 'stars-layer' }),
  grid: new Graphics({ label: 'grid-layer' }),
  trails: new Graphics({ label: 'trails-layer' }),
  bodies: new Graphics({ label: 'bodies-layer' }),
  satellites: new Graphics({ label: 'satellites-layer' }),
  particles: new Graphics({ label: 'particles-layer' }),
  bullets: new Graphics({ label: 'bullets-layer' }),
  aliens: new Graphics({ label: 'aliens-layer' }),
  ship: new Graphics({ label: 'ship-layer' }),
  overlays: new Graphics({ label: 'overlay-layer' }),
  labels: new Container({ label: 'labels-layer' }),
});

const clearLayers = (layers: PixiLayers) => {
  layers.background.clear();
  layers.stars.clear();
  layers.grid.clear();
  layers.trails.clear();
  layers.bodies.clear();
  layers.satellites.clear();
  layers.particles.clear();
  layers.bullets.clear();
  layers.aliens.clear();
  layers.ship.clear();
  layers.overlays.clear();
};


const destroyTextPools = (pools: TextPools) => {
  pools.bodyLabels.forEach((text) => text.destroy());
  pools.alienDistances.forEach((text) => text.destroy());
  pools.earthHp?.destroy();
  pools.launchVelocity?.destroy();
  pools.bodyLabels.clear();
  pools.alienDistances.clear();
  pools.earthHp = null;
  pools.launchVelocity = null;
};

const getPooledText = (
  pool: Map<string, Text>,
  id: string,
  layer: Container,
  style: typeof BODY_LABEL_STYLE,
) => {
  let text = pool.get(id);
  if (!text) {
    text = new Text({ text: '', style });
    text.anchor.set(0.5);
    layer.addChild(text);
    pool.set(id, text);
  }
  text.visible = true;
  return text;
};

const removeUnusedText = (pool: Map<string, Text>, activeIds: Set<string>) => {
  pool.forEach((text, id) => {
    if (!activeIds.has(id)) {
      text.destroy();
      pool.delete(id);
    }
  });
};

const distance = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
};

const createStars = () => {
  const stars = [];
  for (let i = 0; i < 200; i++) {
    stars.push({
      x: Math.random() * 4000 - 2000,
      y: Math.random() * 4000 - 2000,
      size: Math.random() * 1.5 + 0.5,
      alpha: Math.random() * 0.7 + 0.3,
    });
  }
  return stars;
};

export const SolarCanvas = ({
  bodiesRef,
  config,
  selectedBodyId,
  setSelectedBodyId,
  launchPreset,
  onSimulationTick,
  shipRef,
  bulletsRef,
  alienShipsRef,
  satellitesRef,
}: SolarCanvasProps) => {

  const containerRef = useRef<HTMLDivElement | null>(null);
  const pixiSceneRef = useRef<PixiScene | null>(null);
  const drawSceneRef = useRef<(dt?: number) => void>(() => undefined);

  const configRef = useRef(config);
  const selectedBodyIdRef = useRef(selectedBodyId);
  const launchPresetRef = useRef(launchPreset);

  const cameraRef = useRef<CameraState>({
    zoom: 1.0,
    offsetX: 0,
    offsetY: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
  });

  const launchStartRef = useRef<Point | null>(null);
  const launchCurrentRef = useRef<Point | null>(null);

  const [stars] = useState(createStars);
  const particlesRef = useRef<Particle[]>([]);
  const wasShipActiveRef = useRef(false);
  const wasShipPosRef = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const prevAlienShipsRef = useRef<AlienShip[] | null>(null);
  const prevBodiesRef = useRef<Body[] | null>(null);
  const textPoolsRef = useRef<TextPools>({
    bodyLabels: new Map(),
    alienDistances: new Map(),
    earthHp: null,
    launchVelocity: null,
  });

  useEffect(() => {
    configRef.current = config;
    cameraRef.current.zoom = config.cameraZoom;
    cameraRef.current.offsetX = config.cameraOffsetX;
    cameraRef.current.offsetY = config.cameraOffsetY;
  }, [config]);

  useEffect(() => {
    selectedBodyIdRef.current = selectedBodyId;
  }, [selectedBodyId]);

  useEffect(() => {
    launchPresetRef.current = launchPreset;
    if (!launchPreset) {
      launchStartRef.current = null;
      launchCurrentRef.current = null;
    }
  }, [launchPreset]);

  const screenToSim = (screenX: number, screenY: number): Point => {
    const { zoom, offsetX, offsetY } = cameraRef.current;
    return {
      x: (screenX - offsetX) / zoom,
      y: (screenY - offsetY) / zoom,
    };
  };

  const simToScreen = (simX: number, simY: number): Point => {
    const { zoom, offsetX, offsetY } = cameraRef.current;
    return {
      x: simX * zoom + offsetX,
      y: simY * zoom + offsetY,
    };
  };

  const findBodyAt = (simCoords: Point) => {
    const bodies = bodiesRef.current;
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      const minClickRadius = Math.max(body.radius, 15 / cameraRef.current.zoom);
      if (distance(body.x, body.y, simCoords.x, simCoords.y) <= minClickRadius) {
        return body;
      }
    }
    return null;
  };

  const finishLaunchOrDrag = () => {
    if (cameraRef.current.isDragging) {
      cameraRef.current.isDragging = false;
      return;
    }

    const launchStart = launchStartRef.current;
    const launchCurrent = launchCurrentRef.current;
    const preset = launchPresetRef.current;

    if (!launchStart || !launchCurrent || !preset) return;

    const vx = (launchCurrent.x - launchStart.x) * 0.04;
    const vy = (launchCurrent.y - launchStart.y) * 0.04;
    const newBody: Body = {
      id: `custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: preset.name,
      mass: preset.mass,
      radius: preset.radius,
      x: launchStart.x,
      y: launchStart.y,
      vx,
      vy,
      ax: 0,
      ay: 0,
      color: preset.color,
      trail: [],
      isStatic: false,
      isBlackHole: preset.name === 'Agujero Negro',
    };

    bodiesRef.current = [...bodiesRef.current, newBody];
    setSelectedBodyId(newBody.id);
    launchStartRef.current = null;
    launchCurrentRef.current = null;
  };

  const handlePointerDown = (event: FederatedPointerEvent) => {
    event.preventDefault();

    const screenX = event.global.x;
    const screenY = event.global.y;
    const simCoords = screenToSim(screenX, screenY);
    const clickedBody = findBodyAt(simCoords);

    if (event.button === 0) {
      if (launchPresetRef.current) {
        launchStartRef.current = simCoords;
        launchCurrentRef.current = simCoords;
      } else if (clickedBody) {
        setSelectedBodyId(clickedBody.id);
      } else {
        setSelectedBodyId(null);
        cameraRef.current.isDragging = true;
        cameraRef.current.dragStartX = screenX - cameraRef.current.offsetX;
        cameraRef.current.dragStartY = screenY - cameraRef.current.offsetY;
      }
      return;
    }

    if (event.button === 1 || event.button === 2) {
      cameraRef.current.isDragging = true;
      cameraRef.current.dragStartX = screenX - cameraRef.current.offsetX;
      cameraRef.current.dragStartY = screenY - cameraRef.current.offsetY;
    }
  };

  const handlePointerMove = (event: FederatedPointerEvent) => {
    const screenX = event.global.x;
    const screenY = event.global.y;

    if (cameraRef.current.isDragging) {
      cameraRef.current.offsetX = screenX - cameraRef.current.dragStartX;
      cameraRef.current.offsetY = screenY - cameraRef.current.dragStartY;
      return;
    }

    if (launchStartRef.current) {
      launchCurrentRef.current = screenToSim(screenX, screenY);
    }
  };

  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();

    const scene = pixiSceneRef.current;
    if (!scene) return;

    const rect = scene.app.canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const zoomFactor = event.deltaY < 0 ? 1.15 : 0.85;
    const camera = cameraRef.current;
    const newZoom = Math.min(Math.max(camera.zoom * zoomFactor, 0.05), 10);
    const mouseSimX = (mouseX - camera.offsetX) / camera.zoom;
    const mouseSimY = (mouseY - camera.offsetY) / camera.zoom;

    camera.zoom = newZoom;
    camera.offsetX = mouseX - mouseSimX * newZoom;
    camera.offsetY = mouseY - mouseSimY * newZoom;
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    const app = new Application();

    const initPixi = async () => {
      await app.init({
        width: container.clientWidth || window.innerWidth,
        height: container.clientHeight || window.innerHeight,
        backgroundColor: 0x05050e,
        antialias: true,
        autoDensity: true,
        autoStart: false,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
      });

      if (disposed) {
        app.destroy();
        return;
      }

      const layers = createLayers();
      app.stage.addChild(
        layers.background,
        layers.stars,
        layers.grid,
        layers.trails,
        layers.bodies,
        layers.satellites,
        layers.particles,
        layers.bullets,
        layers.aliens,
        layers.labels,
        layers.ship,
        layers.overlays,
      );


      app.canvas.style.display = 'block';
      app.canvas.style.width = '100%';
      app.canvas.style.height = '100%';
      app.canvas.style.touchAction = 'none';
      container.appendChild(app.canvas);
      app.stop();

      const hitArea = new Rectangle(0, 0, app.screen.width, app.screen.height);
      app.stage.eventMode = 'static';
      app.stage.hitArea = hitArea;
      app.stage.on('pointerdown', handlePointerDown);
      app.stage.on('globalpointermove', handlePointerMove);
      app.stage.on('pointerup', finishLaunchOrDrag);
      app.stage.on('pointerupoutside', finishLaunchOrDrag);

      const preventContextMenu = (event: MouseEvent) => event.preventDefault();
      app.canvas.addEventListener('wheel', handleWheel, { passive: false });
      app.canvas.addEventListener('contextmenu', preventContextMenu);

      const resize = () => {
        const width = container.clientWidth || window.innerWidth;
        const height = container.clientHeight || window.innerHeight;
        app.renderer.resize(width, height);
        hitArea.width = width;
        hitArea.height = height;

        if (
          cameraRef.current.offsetX === 0 &&
          cameraRef.current.offsetY === 0
        ) {
          cameraRef.current.offsetX = width / 2;
          cameraRef.current.offsetY = height / 2;
        }
      };

      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);
      resize();

      pixiSceneRef.current = { app, layers, hitArea };
      drawSceneRef.current();

      return () => {
        resizeObserver.disconnect();
        app.canvas.removeEventListener('wheel', handleWheel);
        app.canvas.removeEventListener('contextmenu', preventContextMenu);
      };
    };

    let cleanupPixiListeners: (() => void) | undefined;
    void initPixi().then((cleanup) => {
      cleanupPixiListeners = cleanup;
    });

    return () => {
      disposed = true;
      cleanupPixiListeners?.();
      if (pixiSceneRef.current?.app === app) {
        pixiSceneRef.current = null;
        destroyTextPools(textPoolsRef.current);
        app.destroy();
      }
    };
  }, []);

  useEffect(() => {
    onSimulationTick((dt) => drawSceneRef.current(dt));
    return () => onSimulationTick(() => undefined);
  }, [onSimulationTick]);

  const drawBackground = (layers: PixiLayers, width: number, height: number) => {
    const { offsetX, offsetY } = cameraRef.current;

    layers.background.rect(0, 0, width, height).fill('#05050e');
    layers.background
      .circle(width / 2, height / 2, Math.max(width, height) * 0.75)
      .fill({ color: '#0c0c1c', alpha: 0.35 });

    for (let i = 0; i < stars.length; i++) {
      const star = stars[i];
      const sx = (star.x * 0.15 + offsetX * 0.1) % width;
      const sy = (star.y * 0.15 + offsetY * 0.1) % height;
      const x = sx < 0 ? sx + width : sx;
      const y = sy < 0 ? sy + height : sy;
      layers.stars
        .circle(x, y, star.size)
        .fill({ color: '#ffffff', alpha: star.alpha });
    }
  };

  const drawWarpGrid = (
    grid: Graphics,
    width: number,
    height: number,
    bodies: Body[],
  ) => {
    const { zoom, offsetX, offsetY } = cameraRef.current;
    const gridSpacing = configRef.current.gridResolution || 50;
    const minSimX = -offsetX / zoom;
    const maxSimX = (width - offsetX) / zoom;
    const minSimY = -offsetY / zoom;
    const maxSimY = (height - offsetY) / zoom;
    const startX = Math.floor(minSimX / gridSpacing) * gridSpacing - gridSpacing;
    const endX = Math.ceil(maxSimX / gridSpacing) * gridSpacing + gridSpacing;
    const startY = Math.floor(minSimY / gridSpacing) * gridSpacing - gridSpacing;
    const endY = Math.ceil(maxSimY / gridSpacing) * gridSpacing + gridSpacing;
    const lineCountX = (endX - startX) / gridSpacing;
    const lineCountY = (endY - startY) / gridSpacing;

    if (lineCountX > 150 || lineCountY > 150) return;

    const getDeformedPoint = (sx: number, sy: number) => {
      let dxTotal = 0;
      let dyTotal = 0;

      for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        if (body.crushed) continue;

        const dx = body.x - sx;
        const dy = body.y - sy;
        const rSq = dx * dx + dy * dy;
        const r = Math.sqrt(rSq);
        if (r === 0) continue;

        const softening = body.radius * body.radius * 2 + 100;
        const warpForce = (0.8 * body.mass) / (rSq + softening);
        const displacement = Math.min(r * 0.9, warpForce);
        dxTotal += (dx / r) * displacement;
        dyTotal += (dy / r) * displacement;
      }

      return {
        x: (sx + dxTotal) * zoom + offsetX,
        y: (sy + dyTotal) * zoom + offsetY,
      };
    };

    for (let x = startX; x <= endX; x += gridSpacing) {
      grid.beginPath();
      let first = true;
      for (let y = startY; y <= endY; y += gridSpacing / 4) {
        const point = getDeformedPoint(x, y);
        if (first) {
          grid.moveTo(point.x, point.y);
          first = false;
        } else {
          grid.lineTo(point.x, point.y);
        }
      }
      grid.stroke({ width: 1, color: '#4a90e2', alpha: 0.15 });
    }

    for (let y = startY; y <= endY; y += gridSpacing) {
      grid.beginPath();
      let first = true;
      for (let x = startX; x <= endX; x += gridSpacing / 4) {
        const point = getDeformedPoint(x, y);
        if (first) {
          grid.moveTo(point.x, point.y);
          first = false;
        } else {
          grid.lineTo(point.x, point.y);
        }
      }
      grid.stroke({ width: 1, color: '#4a90e2', alpha: 0.15 });
    }
  };

  const drawTrails = (trails: Graphics, bodies: Body[]) => {
    if (!configRef.current.trailsEnabled) return;

    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      if (body.trail.length < 2) continue;

      trails.beginPath();
      const start = simToScreen(body.trail[0].x, body.trail[0].y);
      trails.moveTo(start.x, start.y);

      for (let j = 1; j < body.trail.length; j++) {
        const point = simToScreen(body.trail[j].x, body.trail[j].y);
        trails.lineTo(point.x, point.y);
      }

      trails.stroke({
        width: Math.max(1, Math.min(2.5, body.radius * cameraRef.current.zoom * 0.15)),
        color: body.color,
        alpha: 0.27,
      });
    }
  };

  const drawBodies = (
    bodyGraphics: Graphics,
    labelsLayer: Container,
    bodies: Body[],
    dt: number = 0.016,
  ) => {
    const activeBodyIds = new Set<string>();
    const pools = textPoolsRef.current;
    const { zoom } = cameraRef.current;
    const width = pixiSceneRef.current?.app.screen.width ?? 0;
    const height = pixiSceneRef.current?.app.screen.height ?? 0;

    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      const screenPos = simToScreen(body.x, body.y);
      const screenRad = Math.max(1.5, body.radius * zoom);

      if (
        screenPos.x + screenRad < -100 ||
        screenPos.x - screenRad > width + 100 ||
        screenPos.y + screenRad < -100 ||
        screenPos.y - screenRad > height + 100
      ) {
        continue;
      }

      const isStar =
        body.id.includes('sun') ||
        body.id.includes('star') ||
        body.name.toLowerCase().includes('sol') ||
        body.name.toLowerCase().includes('estrella') ||
        body.mass >= 5000;

      const glowRad = screenRad * (body.isStatic || body.mass > 1000 ? 3.0 : 2.0);

      if (isStar) {
        const time = performance.now() * 0.001;
        const pulse = Math.sin(time * 2.0) * 0.08;
        bodyGraphics
          .circle(screenPos.x, screenPos.y, glowRad * (1.0 + pulse))
          .fill({ color: body.color, alpha: 0.07 });
        bodyGraphics
          .circle(screenPos.x, screenPos.y, glowRad * 0.6 * (1.0 + pulse * 0.5))
          .fill({ color: body.color, alpha: 0.13 });
      } else {
        bodyGraphics
          .circle(screenPos.x, screenPos.y, glowRad)
          .fill({ color: body.color, alpha: 0.1 });
        bodyGraphics
          .circle(screenPos.x, screenPos.y, glowRad * 0.55)
          .fill({ color: body.color, alpha: 0.17 });
      }

      if (body.isBlackHole) {
        bodyGraphics
          .circle(screenPos.x, screenPos.y, screenRad + 3)
          .stroke({ width: 2, color: '#ffffff', alpha: 0.8 });
        bodyGraphics
          .circle(screenPos.x, screenPos.y, screenRad + 6)
          .stroke({ width: 1, color: '#a855f7' });
        bodyGraphics.circle(screenPos.x, screenPos.y, screenRad).fill('#000000');
      } else if (isStar) {
        const time = performance.now() * 0.001;

        const drawFlameLayer = (
          graphics: Graphics,
          baseRadius: number,
          color: string,
          alpha: number,
          waveCount: number,
          speed: number,
          amplitude: number,
          noiseFreq: number,
          rotateDir: number
        ) => {
          const points: number[] = [];
          const steps = 72;
          const t = time * speed;
          
          for (let k = 0; k <= steps; k++) {
            const angle = (k / steps) * Math.PI * 2;
            const wave1 = Math.sin(angle * waveCount + t * rotateDir) * amplitude;
            const wave2 = Math.cos(angle * (waveCount * 1.7) - t * 1.3 * rotateDir) * (amplitude * 0.4);
            const wave3 = Math.sin(angle * noiseFreq + t * 2.5) * (amplitude * 0.25);
            
            const r = baseRadius + wave1 + wave2 + wave3;
            const x = screenPos.x + Math.cos(angle) * r;
            const y = screenPos.y + Math.sin(angle) * r;
            points.push(x, y);
          }
          graphics.poly(points, true).fill({ color, alpha });
        };

        // Layer 1: Deep outer plasma
        drawFlameLayer(
          bodyGraphics,
          screenRad * 1.15,
          lerpColor(body.color, '#000000', 0.2),
          0.22,
          6,
          1.1,
          screenRad * 0.18,
          14,
          1
        );

        // Layer 2: Main plasma body
        drawFlameLayer(
          bodyGraphics,
          screenRad * 1.0,
          body.color,
          0.45,
          8,
          1.6,
          screenRad * 0.12,
          20,
          -1
        );

        // Layer 3: Hot inner fire
        drawFlameLayer(
          bodyGraphics,
          screenRad * 0.88,
          lerpColor(body.color, '#ffffff', 0.35),
          0.7,
          10,
          2.2,
          screenRad * 0.08,
          26,
          1
        );

        // Draw Solar Prominences (loops of plasma)
        const prominenceCount = 3;
        for (let j = 0; j < prominenceCount; j++) {
          const baseAngle = (j / prominenceCount) * Math.PI * 2 + time * 0.05;
          const loopWidth = 0.3 + 0.1 * Math.sin(time * 2.0 + j);
          const startAngle = baseAngle - loopWidth / 2;
          const endAngle = baseAngle + loopWidth / 2;
          
          const heightMultiplier = 1.25 + 0.15 * Math.sin(time * 3.5 + j * 2);
          const peakRadius = screenRad * heightMultiplier;
          const peakAngle = baseAngle + 0.05 * Math.cos(time * 1.5 + j);
          
          const startX = screenPos.x + Math.cos(startAngle) * screenRad;
          const startY = screenPos.y + Math.sin(startAngle) * screenRad;
          const endX = screenPos.x + Math.cos(endAngle) * screenRad;
          const endY = screenPos.y + Math.sin(endAngle) * screenRad;
          
          const controlX = screenPos.x + Math.cos(peakAngle) * peakRadius;
          const controlY = screenPos.y + Math.sin(peakAngle) * peakRadius;
          
          bodyGraphics.beginPath();
          bodyGraphics.moveTo(startX, startY);
          bodyGraphics.quadraticCurveTo(controlX, controlY, endX, endY);
          bodyGraphics.stroke({
            width: Math.max(1.2, screenRad * 0.08),
            color: lerpColor(body.color, '#ffffff', 0.1),
            alpha: 0.45 + 0.15 * Math.sin(time * 4.0 + j),
          });
        }

        // Layer 4: Solid super-hot core
        bodyGraphics
          .circle(screenPos.x, screenPos.y, screenRad * 0.72)
          .fill(lerpColor(body.color, '#ffffff', 0.65));

        // Layer 5: White-hot center
        bodyGraphics
          .circle(screenPos.x, screenPos.y, screenRad * 0.4)
          .fill(lerpColor(body.color, '#ffffff', 0.9));

        // Emit dynamic solar wind particles!
        const actualDt = dt * configRef.current.timeScale;
        if (actualDt > 0 && Math.random() < 0.15 * (actualDt / 0.016)) {
          const emitAngle = Math.random() * Math.PI * 2;
          const dist = body.radius * (0.8 + Math.random() * 0.35);
          const pX = body.x + Math.cos(emitAngle) * dist;
          const pY = body.y + Math.sin(emitAngle) * dist;
          
          const speed = 15 + Math.random() * 25;
          const pVx = Math.cos(emitAngle) * speed + body.vx;
          const pVy = Math.sin(emitAngle) * speed + body.vy;
          
          particlesRef.current.push({
            x: pX,
            y: pY,
            vx: pVx,
            vy: pVy,
            color: lerpColor(body.color, '#ffffff', Math.random() * 0.4),
            size: 1.0 + Math.random() * 2.2,
            alpha: 0.85,
            decay: 0.015 + Math.random() * 0.015,
          });
        }
      } else {
        bodyGraphics.circle(screenPos.x, screenPos.y, screenRad).fill(body.color);
        bodyGraphics
          .circle(
            screenPos.x - screenRad * 0.25,
            screenPos.y - screenRad * 0.25,
            screenRad * 0.55,
          )
          .fill({ color: '#ffffff', alpha: 0.18 });
        bodyGraphics
          .circle(screenPos.x + screenRad * 0.18, screenPos.y + screenRad * 0.2, screenRad)
          .fill({ color: '#000000', alpha: 0.25 });
      }

      if (body.id === 'earth' && configRef.current.earthHp !== undefined) {
        const hp = configRef.current.earthHp;
        const maxHp = configRef.current.maxEarthHp ?? 100;
        if (hp > 0) {
          const pct = hp / maxHp;
          const barW = Math.max(30, screenRad * 2.2);
          const barH = 4;
          const barX = screenPos.x - barW / 2;
          const barY = screenPos.y - screenRad * 1.4 - 2;
          const barColor = pct < 0.3 ? '#ff4d4d' : pct < 0.6 ? '#ffb900' : '#54f2a7';

          bodyGraphics.rect(barX - 1, barY - 1, barW + 2, barH + 2).fill({
            color: '#000000',
            alpha: 0.6,
          });
          bodyGraphics.rect(barX, barY, barW * pct, barH).fill(barColor);

          if (!pools.earthHp) {
            pools.earthHp = new Text({ text: '', style: SMALL_HUD_STYLE });
            pools.earthHp.anchor.set(0.5);
            labelsLayer.addChild(pools.earthHp);
          }
          pools.earthHp.visible = true;
          pools.earthHp.text = `HP: ${Math.ceil(hp)}%`;
          pools.earthHp.position.set(screenPos.x, barY - 6);
        }
      }

      if (body.name.toLowerCase().includes('saturn')) {
        bodyGraphics.save();
        bodyGraphics.translateTransform(screenPos.x, screenPos.y);
        bodyGraphics.rotateTransform(-Math.PI / 8);
        bodyGraphics
          .ellipse(0, 0, screenRad * 1.55, screenRad * 0.3)
          .stroke({
            width: Math.max(1, screenRad * 0.3),
            color: '#e9c46a',
            alpha: 0.4,
          });
        bodyGraphics.restore();
      }

      if (selectedBodyIdRef.current === body.id) {
        bodyGraphics
          .circle(screenPos.x, screenPos.y, screenRad + 8)
          .stroke({ width: 1.5, color: '#00f2fe', alpha: 0.7 });
      }

      if (zoom > 0.3) {
        activeBodyIds.add(body.id);
        const label = getPooledText(
          pools.bodyLabels,
          body.id,
          labelsLayer,
          BODY_LABEL_STYLE,
        );
        label.text = body.name;
        label.alpha = 0.75;
        label.position.set(screenPos.x, screenPos.y - screenRad - 10);
      }

      if (configRef.current.vectorsEnabled && (Math.abs(body.vx) > 0.01 || Math.abs(body.vy) > 0.01)) {
        bodyGraphics.beginPath();
        bodyGraphics.moveTo(screenPos.x, screenPos.y);
        bodyGraphics.lineTo(
          screenPos.x + body.vx * 8 * zoom,
          screenPos.y + body.vy * 8 * zoom,
        );
        bodyGraphics.stroke({ width: 1.5, color: '#00f2fe' });
      }

      if (
        configRef.current.forceVectorsEnabled &&
        (Math.abs(body.ax) > 0.001 || Math.abs(body.ay) > 0.001)
      ) {
        bodyGraphics.beginPath();
        bodyGraphics.moveTo(screenPos.x, screenPos.y);
        bodyGraphics.lineTo(
          screenPos.x + body.ax * 40 * zoom,
          screenPos.y + body.ay * 40 * zoom,
        );
        bodyGraphics.stroke({ width: 1.2, color: '#ff7700' });
      }
    }

    if (pools.earthHp) {
      pools.earthHp.visible =
        bodies.some((body) => body.id === 'earth') &&
        configRef.current.earthHp !== undefined &&
        configRef.current.earthHp > 0;
    }

    removeUnusedText(pools.bodyLabels, activeBodyIds);
  };

  const spawnExplosionParticles = (
    x: number,
    y: number,
    vx: number,
    vy: number,
    count: number,
    colors: string[],
    speedMin: number,
    speedRange: number,
    sizeMin: number,
    sizeRange: number,
    decayMin: number,
    decayRange: number,
  ) => {
    for (let k = 0; k < count; k++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = speedMin + Math.random() * speedRange;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed + vx,
        vy: Math.sin(angle) * speed + vy,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: sizeMin + Math.random() * sizeRange,
        alpha: 1,
        decay: decayMin + Math.random() * decayRange,
      });
    }
  };

  const updateCombatEffects = (bodies: Body[], alienShips: AlienShip[]) => {
    if (prevAlienShipsRef.current) {
      const currentIds = new Set(alienShips.map((ship) => ship.id));
      for (const previous of prevAlienShipsRef.current) {
        if (!currentIds.has(previous.id)) {
          spawnExplosionParticles(
            previous.x,
            previous.y,
            previous.vx * 0.3,
            previous.vy * 0.3,
            25,
            ['#54f2a7', '#10b981'],
            20,
            85,
            2,
            3,
            0.025,
            0.02,
          );
        }
      }
    }
    prevAlienShipsRef.current = alienShips.map((ship) => ({ ...ship }));

    if (prevBodiesRef.current) {
      const wasEarthPresent = prevBodiesRef.current.some((body) => body.id === 'earth');
      const isEarthPresent = bodies.some((body) => body.id === 'earth');
      if (wasEarthPresent && !isEarthPresent) {
        const lastEarth = prevBodiesRef.current.find((body) => body.id === 'earth');
        if (lastEarth) {
          spawnExplosionParticles(
            lastEarth.x,
            lastEarth.y,
            lastEarth.vx * 0.25,
            lastEarth.vy * 0.25,
            150,
            ['#ffffff', '#ff7700', '#ff4d4d'],
            40,
            260,
            4,
            7.5,
            0.007,
            0.012,
          );
        }
      }
    }
    prevBodiesRef.current = bodies.map((body) => ({ ...body }));
  };

  const drawParticles = (particleGraphics: Graphics, dt: number = 0.016) => {
    const particles = particlesRef.current;
    const actualDt = dt * configRef.current.timeScale;
    const decayScale = actualDt / 0.016;

    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];
      particle.x += particle.vx * actualDt;
      particle.y += particle.vy * actualDt;
      particle.alpha -= particle.decay * decayScale;
      particle.size -= particle.decay * 3 * decayScale;

      if (particle.alpha <= 0 || particle.size <= 0) {
        particles.splice(i, 1);
        continue;
      }

      const screenPos = simToScreen(particle.x, particle.y);
      particleGraphics
        .circle(screenPos.x, screenPos.y, Math.max(0.5, particle.size * cameraRef.current.zoom))
        .fill({ color: particle.color, alpha: particle.alpha });
    }
  };

  const drawShip = (shipGraphics: Graphics, ship: Spaceship | null, dt: number = 0.016) => {
    if (!ship) return;

    const actualDt = dt * configRef.current.timeScale;

    if (ship.active) {
      wasShipActiveRef.current = true;
      wasShipPosRef.current = { x: ship.x, y: ship.y, vx: ship.vx, vy: ship.vy };

      const zoom = cameraRef.current.zoom;
      const size = Math.max(8, 6.5 * zoom);

      if (ship.thrusting && actualDt > 0) {
        const baseCount = 2 * (actualDt / 0.016);
        const intCount = Math.floor(baseCount);
        const extraProb = baseCount - intCount;
        const finalCount = intCount + (Math.random() < extraProb ? 1 : 0);

        for (let k = 0; k < finalCount; k++) {
          const backAngle = ship.angle + Math.PI + (Math.random() * 0.4 - 0.2);
          const speed = 120 + Math.random() * 60;
          const spawnOffset = (size * 1.05) / zoom;
          particlesRef.current.push({
            x: ship.x + Math.cos(backAngle) * spawnOffset,
            y: ship.y + Math.sin(backAngle) * spawnOffset,
            vx: ship.vx + Math.cos(backAngle) * speed,
            vy: ship.vy + Math.sin(backAngle) * speed,
            color: Math.random() > 0.4 ? '#00f2fe' : '#e58e26',
            size: 2 + Math.random() * 1.5,
            alpha: 0.9,
            decay: 0.03 + Math.random() * 0.02,
          });
        }
      }

      if (ship.braking && actualDt > 0) {
        const baseCount = 1 * (actualDt / 0.016);
        const intCount = Math.floor(baseCount);
        const extraProb = baseCount - intCount;
        const finalCount = intCount + (Math.random() < extraProb ? 1 : 0);

        for (let k = 0; k < finalCount; k++) {
          const sideAngle =
            ship.angle +
            (Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2) +
            (Math.random() * 0.3 - 0.15);
          const spawnOffset = (size * 0.5) / zoom;
          particlesRef.current.push({
            x: ship.x + Math.cos(ship.angle) * spawnOffset,
            y: ship.y + Math.sin(ship.angle) * spawnOffset,
            vx: ship.vx + Math.cos(sideAngle) * 50,
            vy: ship.vy + Math.sin(sideAngle) * 50,
            color: '#ffffff',
            size: 1.2,
            alpha: 0.8,
            decay: 0.06,
          });
        }
      }

      const screenShip = simToScreen(ship.x, ship.y);
      const pulse = 0.5 + Math.sin(performance.now() / 130) * 0.5;

      shipGraphics
        .circle(screenShip.x, screenShip.y, size * (1.85 + pulse * 0.12))
        .stroke({ width: 1.4, color: '#00f2fe', alpha: 0.4 });
      shipGraphics.beginPath();
      shipGraphics.moveTo(screenShip.x - size * 2.1, screenShip.y);
      shipGraphics.lineTo(screenShip.x - size * 1.55, screenShip.y);
      shipGraphics.moveTo(screenShip.x + size * 1.55, screenShip.y);
      shipGraphics.lineTo(screenShip.x + size * 2.1, screenShip.y);
      shipGraphics.moveTo(screenShip.x, screenShip.y - size * 2.1);
      shipGraphics.lineTo(screenShip.x, screenShip.y - size * 1.55);
      shipGraphics.moveTo(screenShip.x, screenShip.y + size * 1.55);
      shipGraphics.lineTo(screenShip.x, screenShip.y + size * 2.1);
      shipGraphics.stroke({ width: 1.4, color: '#54f2a7', alpha: 0.6 });

      const rotatePoint = (x: number, y: number) => {
        const cos = Math.cos(ship.angle);
        const sin = Math.sin(ship.angle);
        return {
          x: screenShip.x + x * cos - y * sin,
          y: screenShip.y + x * sin + y * cos,
        };
      };

      const rotatedPoly = (points: number[]) => {
        const rotated = [];
        for (let i = 0; i < points.length; i += 2) {
          const point = rotatePoint(points[i], points[i + 1]);
          rotated.push(point.x, point.y);
        }
        return rotated;
      };

      shipGraphics
        .circle(screenShip.x, screenShip.y, size * (1.45 + pulse * 0.15))
        .fill({ color: '#00f2fe', alpha: 0.09 });
      shipGraphics
        .circle(screenShip.x, screenShip.y, size * 1.15)
        .stroke({ width: 1.2, color: '#00f2fe', alpha: 0.45 });

      if (ship.thrusting) {
        shipGraphics
          .poly(
            rotatedPoly([
              -size * 0.95,
              0,
              -size * 2.05,
              -size * 0.34,
              -size * 1.7,
              0,
              -size * 2.05,
              size * 0.34,
            ]),
            true,
          )
          .fill({ color: '#00f2fe', alpha: 0.35 + pulse * 0.2 });
        shipGraphics
          .poly(
            rotatedPoly([
              -size * 0.75,
              0,
              -size * 1.45,
              -size * 0.18,
              -size * 1.25,
              0,
              -size * 1.45,
              size * 0.18,
            ]),
            true,
          )
          .fill({ color: '#ffffff', alpha: 0.65 });
      } else {
        shipGraphics
          .poly(
            rotatedPoly([
              -size * 0.88,
              0,
              -size * 1.28,
              -size * 0.14,
              -size * 1.12,
              0,
              -size * 1.28,
              size * 0.14,
            ]),
            true,
          )
          .fill({ color: '#00f2fe', alpha: 0.32 });
      }

      shipGraphics
        .poly(
          rotatedPoly([
            size * 1.35,
            0,
            size * 0.18,
            -size * 0.42,
            -size * 0.72,
            -size * 0.9,
            -size * 0.46,
            -size * 0.25,
            -size * 0.98,
            0,
            -size * 0.46,
            size * 0.25,
            -size * 0.72,
            size * 0.9,
            size * 0.18,
            size * 0.42,
          ]),
          true,
        )
        .fill('#e5f9ff')
        .stroke({ width: 1.8, color: '#00f2fe', alpha: 1 });

      shipGraphics
        .poly(
          rotatedPoly([
            size * 0.98,
            0,
            size * 0.12,
            -size * 0.22,
            -size * 0.24,
            0,
            size * 0.12,
            size * 0.22,
          ]),
          true,
        )
        .fill('#1f2937')
        .stroke({ width: 1, color: '#93c5fd', alpha: 0.75 });

      const cockpit = rotatePoint(size * 0.32, 0);
      shipGraphics
        .circle(cockpit.x, cockpit.y, size * 0.16)
        .fill({ color: '#54f2a7', alpha: 0.95 });
      shipGraphics
        .circle(cockpit.x, cockpit.y, size * 0.07)
        .fill('#ffffff');

      const leftLight = rotatePoint(-size * 0.62, -size * 0.46);
      const rightLight = rotatePoint(-size * 0.62, size * 0.46);
      shipGraphics
        .circle(leftLight.x, leftLight.y, size * 0.09)
        .fill('#ffb900');
      shipGraphics
        .circle(rightLight.x, rightLight.y, size * 0.09)
        .fill('#ffb900');
      return;
    }

    if (wasShipActiveRef.current) {
      const crash = wasShipPosRef.current;
      spawnExplosionParticles(
        crash.x,
        crash.y,
        crash.vx * 0.4,
        crash.vy * 0.4,
        35,
        ['#ffffff', '#ffdb58', '#e58e26', '#ff5a5a', '#d671ff'],
        30,
        150,
        3.5,
        4,
        0.015,
        0.02,
      );
      wasShipActiveRef.current = false;
    }
  };

  const drawBullets = (
    bulletGraphics: Graphics,
    bullets: Bullet[],
    width: number,
    height: number,
    dt: number = 0.016,
  ) => {
    const tSec = performance.now() * 0.001;

    for (let i = 0; i < bullets.length; i++) {
      const bullet = bullets[i];
      const screenPos = simToScreen(bullet.x, bullet.y);
      const screenRad = Math.max(1.5, bullet.radius * cameraRef.current.zoom);

      if (
        screenPos.x < -20 ||
        screenPos.x > width + 20 ||
        screenPos.y < -20 ||
        screenPos.y > height + 20
      ) {
        continue;
      }

      if (!bullet.isEnemy) {
        if (bullet.isMissile) {
          // Draw defensive space probe missile
          const angle = Math.atan2(bullet.vy, bullet.vx);
          const missileLen = Math.max(10, 8.5 * cameraRef.current.zoom);
          const missileW = Math.max(3.5, 2.8 * cameraRef.current.zoom);

          bulletGraphics.save();
          bulletGraphics.translateTransform(screenPos.x, screenPos.y);
          bulletGraphics.rotateTransform(angle);

          // Pulsing rocket flame exhaust
          const flamePulse = 0.75 + 0.35 * Math.sin(tSec * 28.0 + bullet.id.charCodeAt(0));
          const flameW = missileLen * 0.75 * flamePulse;
          
          bulletGraphics.moveTo(-missileLen * 0.5, -missileW * 0.4);
          bulletGraphics.lineTo(-missileLen * 0.5 - flameW, 0);
          bulletGraphics.lineTo(-missileLen * 0.5, missileW * 0.4);
          bulletGraphics.fill({ color: '#f97316', alpha: 0.95 });

          bulletGraphics.moveTo(-missileLen * 0.5, -missileW * 0.2);
          bulletGraphics.lineTo(-missileLen * 0.5 - flameW * 0.55, 0);
          bulletGraphics.lineTo(-missileLen * 0.5, missileW * 0.2);
          bulletGraphics.fill({ color: '#eab308', alpha: 0.95 });

          // Rocket body (metallic tube)
          bulletGraphics
            .rect(-missileLen * 0.5, -missileW * 0.5, missileLen * 0.9, missileW)
            .fill('#94a3b8')
            .stroke({ width: 0.6, color: '#38bdf8' });

          // Pointed red nose cone
          bulletGraphics.moveTo(missileLen * 0.4, -missileW * 0.5);
          bulletGraphics.lineTo(missileLen * 0.7, 0);
          bulletGraphics.lineTo(missileLen * 0.4, missileW * 0.5);
          bulletGraphics.fill('#ef4444');

          // Tail stabilizing fins
          bulletGraphics.moveTo(-missileLen * 0.5, -missileW * 0.5);
          bulletGraphics.lineTo(-missileLen * 0.7, -missileW * 1.1);
          bulletGraphics.lineTo(-missileLen * 0.35, -missileW * 0.5);
          bulletGraphics.fill('#ef4444');

          bulletGraphics.moveTo(-missileLen * 0.5, missileW * 0.5);
          bulletGraphics.lineTo(-missileLen * 0.7, missileW * 1.1);
          bulletGraphics.lineTo(-missileLen * 0.35, missileW * 0.5);
          bulletGraphics.fill('#ef4444');

          bulletGraphics.restore();

          // Emit smoke particles in simulation space
          const actualDt = dt * configRef.current.timeScale;
          if (actualDt > 0) {
            const baseCount = 0.65 * (actualDt / 0.016);
            const intCount = Math.floor(baseCount);
            const extraProb = baseCount - intCount;
            const finalCount = intCount + (Math.random() < extraProb ? 1 : 0);
            for (let k = 0; k < finalCount; k++) {
              const backAngle = angle + Math.PI + (Math.random() * 0.3 - 0.15);
              const pDist = bullet.radius * 2.2;
              const px = bullet.x + Math.cos(backAngle) * pDist;
              const py = bullet.y + Math.sin(backAngle) * pDist;

              const pSpeed = 15 + Math.random() * 35;
              const pVx = Math.cos(backAngle) * pSpeed + bullet.vx * 0.1;
              const pVy = Math.sin(backAngle) * pSpeed + bullet.vy * 0.1;

              particlesRef.current.push({
                x: px,
                y: py,
                vx: pVx,
                vy: pVy,
                color: Math.random() > 0.45 ? '#475569' : '#64748b',
                size: 2.2 + Math.random() * 2.5,
                alpha: 0.7,
                decay: 0.02 + Math.random() * 0.02,
              });

              if (Math.random() < 0.3) {
                particlesRef.current.push({
                  x: px,
                  y: py,
                  vx: pVx * 1.2,
                  vy: pVy * 1.2,
                  color: '#f97316',
                  size: 1.0 + Math.random() * 1.5,
                  alpha: 0.95,
                  decay: 0.035 + Math.random() * 0.025,
                });
              }
            }
          }
        } else {
          // Standard laser line
          const speed = Math.sqrt(bullet.vx * bullet.vx + bullet.vy * bullet.vy);
          const tail = simToScreen(
            bullet.x - (bullet.vx / (speed || 1)) * 15,
            bullet.y - (bullet.vy / (speed || 1)) * 15,
          );

          bulletGraphics.moveTo(screenPos.x, screenPos.y);
          bulletGraphics.lineTo(tail.x, tail.y);
          bulletGraphics.stroke({
            width: Math.max(2.5, 2.5 * cameraRef.current.zoom),
            color: '#00f2fe',
          });
        }
      } else {
        const bColor = bullet.color || '#ff3366';
        if (bullet.isMine) {
          // Draw slow-floating proximity mine
          const pulse = 1.0 + 0.15 * Math.sin(tSec * 12.0 + bullet.id.charCodeAt(0));
          const r = screenRad * pulse;
          
          // Outer warning shield
          bulletGraphics.circle(screenPos.x, screenPos.y, r * 2.2);
          bulletGraphics.fill({ color: bColor, alpha: 0.12 });
          bulletGraphics.stroke({ width: 0.8, color: bColor, alpha: 0.4 });
          
          // Outer spikes (rotating)
          const numSpikes = 8;
          const rotationOffset = tSec * 1.5;
          for (let k = 0; k < numSpikes; k++) {
            const angle = (k / numSpikes) * Math.PI * 2 + rotationOffset;
            const sx1 = screenPos.x + Math.cos(angle) * (r * 0.7);
            const sy1 = screenPos.y + Math.sin(angle) * (r * 0.7);
            const sx2 = screenPos.x + Math.cos(angle) * (r * 1.5);
            const sy2 = screenPos.y + Math.sin(angle) * (r * 1.5);
            bulletGraphics.moveTo(sx1, sy1);
            bulletGraphics.lineTo(sx2, sy2);
          }
          bulletGraphics.stroke({ width: 1.5, color: bColor });
          
          // Center core
          bulletGraphics.circle(screenPos.x, screenPos.y, r * 0.85);
          bulletGraphics.fill('#1e293b');
          bulletGraphics.stroke({ width: 1.2, color: bColor });
          
          // Blinking white light in the center
          const coreOn = Math.floor(tSec * 6.0) % 2 === 0;
          if (coreOn) {
            bulletGraphics.circle(screenPos.x, screenPos.y, r * 0.35);
            bulletGraphics.fill('#ffffff');
          }
        } else {
          // Standard enemy bullet
          bulletGraphics.circle(screenPos.x, screenPos.y, screenRad * 2);
          bulletGraphics.fill({ color: bColor, alpha: 0.28 });
          bulletGraphics.circle(screenPos.x, screenPos.y, screenRad).fill('#ffffff');
        }
      }
    }
  };

  const drawSatellites = (
    satGraphics: Graphics,
    satellites: Satellite[],
    alienShips: AlienShip[],
  ) => {
    const { zoom } = cameraRef.current;
    const tSec = performance.now() * 0.001;

    for (let i = 0; i < satellites.length; i++) {
      const sat = satellites[i];
      const screenPos = simToScreen(sat.x, sat.y);
      const screenRad = Math.max(1.5, sat.size * zoom);

      if (sat.type === 'defensive') {
        // Find nearest alien ship to point weapon barrel
        let angleToAlien = sat.angle + Math.PI / 2; // default: flight tangent
        let nearestAlien: AlienShip | null = null;
        let minDist = Infinity;

        for (let j = 0; j < alienShips.length; j++) {
          const alien = alienShips[j];
          const dx = alien.x - sat.x;
          const dy = alien.y - sat.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) {
            minDist = dist;
            nearestAlien = alien;
          }
        }

        if (nearestAlien) {
          angleToAlien = Math.atan2(nearestAlien.y - sat.y, nearestAlien.x - sat.x);
        }

        satGraphics.save();
        satGraphics.translateTransform(screenPos.x, screenPos.y);

        // Neon force shield
        const shieldPulse = 1.0 + 0.12 * Math.sin(tSec * 12.0 + i);
        satGraphics
          .circle(0, 0, screenRad * 2.1 * shieldPulse)
          .stroke({
            width: 1.1,
            color: '#38bdf8',
            alpha: 0.25 + 0.15 * Math.sin(tSec * 9.0),
          });
        satGraphics
          .circle(0, 0, screenRad * 2.1 * shieldPulse)
          .fill({ color: '#38bdf8', alpha: 0.04 });

        // Hexagonal armor hub (slowly rotating)
        satGraphics.beginPath();
        const hexPoints = [];
        for (let k = 0; k < 6; k++) {
          const ang = (k / 6) * Math.PI * 2 + tSec * 0.4;
          hexPoints.push(
            Math.cos(ang) * screenRad * 1.35,
            Math.sin(ang) * screenRad * 1.35
          );
        }
        satGraphics.poly(hexPoints, true).fill('#1e293b').stroke({ width: 1.2, color: '#38bdf8' });

        // Core glowing reactor
        const coreAlpha = 0.6 + 0.4 * Math.sin(tSec * 15.0);
        satGraphics.circle(0, 0, screenRad * 0.65).fill({ color: '#0ea5e9', alpha: coreAlpha });
        satGraphics.circle(0, 0, screenRad * 0.3).fill('#ffffff');

        // Tracking blinking status light
        const isBlinkingOn = Math.floor(tSec * 3.5) % 2 === 0;
        const trackingLightAngle = tSec * -0.6;
        const tx = Math.cos(trackingLightAngle) * screenRad * 1.0;
        const ty = Math.sin(trackingLightAngle) * screenRad * 1.0;
        satGraphics.circle(tx, ty, screenRad * 0.25).fill({
          color: isBlinkingOn ? '#10b981' : '#064e3b',
        });

        satGraphics.restore();

        // Gun turret layer
        satGraphics.save();
        satGraphics.translateTransform(screenPos.x, screenPos.y);
        satGraphics.rotateTransform(angleToAlien);

        // Mount base
        satGraphics.circle(0, 0, screenRad * 0.45).fill('#334155');
        // Turret gun barrel
        satGraphics
          .rect(0, -screenRad * 0.16, screenRad * 1.25, screenRad * 0.32)
          .fill('#475569')
          .stroke({ width: 0.8, color: '#38bdf8' });
        // Cannon tip
        satGraphics.rect(screenRad * 1.15, -screenRad * 0.22, screenRad * 0.22, screenRad * 0.44).fill('#0ea5e9');

        // Firing muzzle flash
        if (sat.shootCooldown !== undefined && sat.shootCooldown > 3.75) {
          const flashSize = screenRad * 1.8 * (4.0 - sat.shootCooldown) / 0.25;
          satGraphics
            .circle(screenRad * 1.35, 0, flashSize)
            .fill({ color: '#ffffff', alpha: 0.9 });
          satGraphics
            .circle(screenRad * 1.35, 0, flashSize * 1.6)
            .fill({ color: '#38bdf8', alpha: 0.4 });
        }

        satGraphics.restore();
      } else {
        // Decorative Space Probe
        satGraphics.save();
        satGraphics.translateTransform(screenPos.x, screenPos.y);

        const satAngle = sat.angle + Math.PI / 2 + tSec * 0.25;
        satGraphics.rotateTransform(satAngle);

        // Blue Solar panels
        const panelW = screenRad * 2.0;
        const panelH = screenRad * 0.72;
        const panelGap = screenRad * 0.75;

        // Left panel
        satGraphics
          .rect(-panelGap - panelW, -panelH / 2, panelW, panelH)
          .fill('#1e40af')
          .stroke({ width: 0.8, color: '#60a5fa' });
        // Right panel
        satGraphics
          .rect(panelGap, -panelH / 2, panelW, panelH)
          .fill('#1e40af')
          .stroke({ width: 0.8, color: '#60a5fa' });

        // Panel grid line
        satGraphics
          .rect(-panelGap - panelW / 2, -panelH / 2, 1, panelH)
          .fill({ color: '#60a5fa', alpha: 0.5 });
        satGraphics
          .rect(panelGap + panelW / 2, -panelH / 2, 1, panelH)
          .fill({ color: '#60a5fa', alpha: 0.5 });

        // Connectors
        satGraphics
          .rect(-panelGap, -screenRad * 0.1, panelGap * 2, screenRad * 0.2)
          .fill('#64748b');

        // Central body chassis
        if (sat.color.includes('ffd369')) {
          // Hexagonal gold communications bus
          const pts = [];
          for (let k = 0; k < 6; k++) {
            const ang = (k / 6) * Math.PI * 2;
            pts.push(Math.cos(ang) * screenRad * 0.75, Math.sin(ang) * screenRad * 0.75);
          }
          satGraphics.poly(pts, true).fill('#d97706').stroke({ width: 1, color: '#fbbf24' });
        } else {
          // Square silver research bus
          satGraphics
            .rect(-screenRad * 0.58, -screenRad * 0.58, screenRad * 1.16, screenRad * 1.16)
            .fill('#94a3b8')
            .stroke({ width: 1.0, color: '#cbd5e1' });
        }

        // Antenna dish pointing downward (to planet)
        satGraphics.beginPath();
        satGraphics.moveTo(-screenRad * 0.2, screenRad * 0.4);
        satGraphics.quadraticCurveTo(-screenRad * 0.4, screenRad * 1.0, -screenRad * 0.8, screenRad * 1.1);
        satGraphics.quadraticCurveTo(-screenRad * 1.0, screenRad * 0.6, -screenRad * 0.6, screenRad * 0.3);
        satGraphics.stroke({ width: 1, color: '#e2e8f0' });
        // Dish bowl
        satGraphics.beginPath();
        satGraphics.arc(-screenRad * 0.7, screenRad * 0.85, screenRad * 0.42, -Math.PI / 4, Math.PI * 0.75);
        satGraphics.stroke({ width: 1.5, color: '#94a3b8' });
        // Horn sensor tip
        satGraphics
          .rect(-screenRad * 0.85, screenRad * 1.0, screenRad * 0.22, screenRad * 0.22)
          .fill('#ef4444');

        // Blinking LED beacon (red/orange)
        const blinkTime = tSec + i * 0.65;
        const blinkVal = Math.floor(blinkTime * 2.2) % 2 === 0;
        const ledColor = sat.color.includes('ffd369') ? '#ea580c' : '#ef4444';
        satGraphics.circle(0, -screenRad * 0.2, screenRad * 0.2).fill({
          color: blinkVal ? ledColor : '#450a0a',
        });

        satGraphics.restore();
      }
    }
  };


  const drawAliens = (
    alienGraphics: Graphics,
    labelsLayer: Container,
    aliens: AlienShip[],
    bodies: Body[],
    width: number,
    height: number,
    dt: number = 0.016,
  ) => {
    const activeDistanceIds = new Set<string>();
    const pools = textPoolsRef.current;

    for (let i = 0; i < aliens.length; i++) {
      const alien = aliens[i];
      const screenPos = simToScreen(alien.x, alien.y);
      const screenRad = Math.max(5.5, alien.radius * cameraRef.current.zoom);

      if (
        screenPos.x < 15 ||
        screenPos.x > width - 15 ||
        screenPos.y < 15 ||
        screenPos.y > height - 15
      ) {
        const padding = 20;
        const cx = Math.max(padding, Math.min(width - padding, screenPos.x));
        const cy = Math.max(padding, Math.min(height - padding, screenPos.y));
        const angleToAlien = Math.atan2(screenPos.y - height / 2, screenPos.x - width / 2);

        alienGraphics.save();
        alienGraphics.translateTransform(cx, cy);
        alienGraphics.rotateTransform(angleToAlien);
        alienGraphics
          .poly([8, 0, -6, -6, -6, 6], true)
          .fill(alien.color || '#10b981');
        alienGraphics.restore();

        const ship = shipRef.current;
        const refPos =
          ship && ship.active
            ? ship
            : bodies.find((body) => body.id === 'earth') || { x: 0, y: 0 };
        const simDist = Math.round(distance(alien.x, alien.y, refPos.x, refPos.y));
        activeDistanceIds.add(alien.id);

        const label = getPooledText(
          pools.alienDistances,
          alien.id,
          labelsLayer,
          ALIEN_DISTANCE_STYLE,
        );
        label.text = `${simDist}u`;
        label.position.set(
          cx - Math.cos(angleToAlien) * 16,
          cy - Math.sin(angleToAlien) * 16,
        );
        continue;
      }

      // Bobbing, wobble, and tilt movement animations (extremely smooth and slow)
      const tSec = performance.now() * 0.001;
      const seed = getAlienSeed(alien.id);
      const bobSimX = Math.cos(tSec * 0.35 + seed * 1.5) * (alien.radius * 0.08);
      const bobSimY = Math.sin(tSec * 0.45 + seed * 2.0) * (alien.radius * 0.08);
      const bobX = bobSimX * cameraRef.current.zoom;
      const bobY = bobSimY * cameraRef.current.zoom;
      const wobble = Math.sin(tSec * 0.6 + seed) * 0.03; // Gentle float balance sway
      const speed = Math.sqrt(alien.vx * alien.vx + alien.vy * alien.vy);
      const velAngle = speed > 0.01 ? Math.atan2(alien.vy, alien.vx) : -Math.PI / 2;
      const finalRotation = velAngle + Math.PI / 2 + wobble;

      // Save graphics context for local transformations
      alienGraphics.save();
      alienGraphics.translateTransform(screenPos.x + bobX, screenPos.y + bobY);
      alienGraphics.rotateTransform(finalRotation);

      const type = alien.shipType || 'saucer';
      const shieldPulse = 1.0 + 0.08 * Math.sin(tSec * 8.0 + seed);

      if (type === 'scout') {
        // --- 1. SCOUT RENDER ---
        // A. Anti-Gravity Propulsion Beam (violet/magenta)
        const beamW = screenRad * 0.6;
        const beamH = screenRad * 2.8;
        const beamPulse = 0.55 + 0.2 * Math.sin(tSec * 18.0 + seed);
        alienGraphics.moveTo(-beamW * 0.4, screenRad * 0.2);
        alienGraphics.lineTo(beamW * 0.4, screenRad * 0.2);
        alienGraphics.lineTo(beamW * 1.1, beamH);
        alienGraphics.lineTo(-beamW * 1.1, beamH);
        alienGraphics.fill({ color: '#c084fc', alpha: 0.18 * beamPulse });

        // B. Force Field Strobe Diamond Shield
        const shieldRadius = screenRad * 1.8 * shieldPulse;
        for (let k = 0; k < 6; k++) {
          const angle = (k / 6) * Math.PI * 2;
          const sx = Math.cos(angle) * shieldRadius;
          const sy = Math.sin(angle) * shieldRadius;
          if (k === 0) alienGraphics.moveTo(sx, sy);
          else alienGraphics.lineTo(sx, sy);
        }
        alienGraphics.closePath();
        alienGraphics.stroke({ width: 1.0, color: '#d946ef', alpha: 0.2 + 0.1 * Math.sin(tSec * 10.0) });
        alienGraphics.fill({ color: '#d946ef', alpha: 0.03 });

        // C. Delta Wing Hull
        alienGraphics.moveTo(0, -screenRad * 1.5); // Nose pointing up
        alienGraphics.lineTo(screenRad * 1.35, screenRad * 0.85); // Right wingtip
        alienGraphics.lineTo(screenRad * 0.35, screenRad * 0.6); // Inner tail right
        alienGraphics.lineTo(0, screenRad * 0.3); // Center tail indentation
        alienGraphics.lineTo(-screenRad * 0.35, screenRad * 0.6); // Inner tail left
        alienGraphics.lineTo(-screenRad * 1.35, screenRad * 0.85); // Left wingtip
        alienGraphics.closePath();
        alienGraphics.fill('#1e1b4b'); // Deep indigo/purple
        alienGraphics.stroke({ width: 1.5, color: '#c084fc' }); // Neon purple border

        // D. Cockpit Canopy
        alienGraphics.moveTo(0, -screenRad * 0.95);
        alienGraphics.lineTo(screenRad * 0.35, -screenRad * 0.05);
        alienGraphics.lineTo(0, screenRad * 0.15);
        alienGraphics.lineTo(-screenRad * 0.35, -screenRad * 0.05);
        alienGraphics.closePath();
        alienGraphics.fill({ color: '#701a75', alpha: 0.85 }); // Glassy violet
        alienGraphics.stroke({ width: 1.2, color: '#f472b6' });

        // Canopy Glare
        alienGraphics.ellipse(-screenRad * 0.08, -screenRad * 0.4, screenRad * 0.1, screenRad * 0.22)
          .fill({ color: '#ffffff', alpha: 0.3 });

        // E. Blinking beacons
        // Amber nose beacon (flashing at 6Hz)
        const beaconOn = Math.floor(tSec * 6.0) % 2 === 0;
        if (beaconOn) {
          alienGraphics.circle(0, -screenRad * 1.5, Math.max(1.8, screenRad * 0.25))
            .fill({ color: '#f59e0b', alpha: 0.9 });
          alienGraphics.circle(0, -screenRad * 1.5, Math.max(0.8, screenRad * 0.1))
            .fill('#ffffff');
        } else {
          alienGraphics.circle(0, -screenRad * 1.5, Math.max(1.0, screenRad * 0.15))
            .fill('#78350f');
        }

        // Left/Right wingtip strobes (alternating magenta/pink at 4Hz)
        const strobePhase = Math.floor(tSec * 4.0) % 2;
        const leftStrobeColor = strobePhase === 0 ? '#ec4899' : '#d946ef';
        const rightStrobeColor = strobePhase === 1 ? '#ec4899' : '#d946ef';
        alienGraphics.circle(-screenRad * 1.35, screenRad * 0.85, Math.max(1.5, screenRad * 0.2))
          .fill({ color: leftStrobeColor, alpha: 0.9 });
        alienGraphics.circle(screenRad * 1.35, screenRad * 0.85, Math.max(1.5, screenRad * 0.2))
          .fill({ color: rightStrobeColor, alpha: 0.9 });

      } else if (type === 'cruiser') {
        // --- 2. CRUISER RENDER ---
        // A. Triple Engine Exhaust (pulsing orange)
        const offsets = [-screenRad * 0.6, 0, screenRad * 0.6];
        for (let k = 0; k < offsets.length; k++) {
          const ox = offsets[k];
          const flamePulse = 0.55 + 0.3 * Math.sin(tSec * 22.0 + k * 5.0 + seed);
          const flameH = screenRad * 2.0 * flamePulse;
          const flameW = screenRad * 0.45;
          alienGraphics.moveTo(ox - flameW * 0.5, screenRad * 0.4);
          alienGraphics.lineTo(ox + flameW * 0.5, screenRad * 0.4);
          alienGraphics.lineTo(ox, screenRad * 0.4 + flameH);
          alienGraphics.closePath();
          alienGraphics.fill({ color: '#f97316', alpha: 0.75 * flamePulse });
        }

        // B. Heavy Shield Ring
        const shieldRadius = screenRad * 1.7 * shieldPulse;
        alienGraphics
          .circle(0, 0, shieldRadius)
          .stroke({ width: 1.8, color: '#f97316', alpha: 0.3 + 0.15 * Math.sin(tSec * 12.0) });
        alienGraphics
          .circle(0, 0, shieldRadius)
          .fill({ color: '#f97316', alpha: 0.02 });

        // C. Crescent Battlecruiser Hull
        alienGraphics.moveTo(-screenRad * 1.7, screenRad * 0.4);
        alienGraphics.bezierCurveTo(
          -screenRad * 1.0, -screenRad * 1.5,
          screenRad * 1.0, -screenRad * 1.5,
          screenRad * 1.7, screenRad * 0.4
        );
        alienGraphics.lineTo(screenRad * 1.0, screenRad * 0.4);
        alienGraphics.bezierCurveTo(
          screenRad * 0.6, -screenRad * 0.2,
          -screenRad * 0.6, -screenRad * 0.2,
          -screenRad * 1.0, screenRad * 0.4
        );
        alienGraphics.closePath();
        alienGraphics.fill('#334155'); // Dark steel armor
        alienGraphics.stroke({ width: 1.8, color: '#fb923c' }); // Bright copper border

        // Armor Plates Overlay
        alienGraphics.moveTo(-screenRad * 0.8, -screenRad * 0.1);
        alienGraphics.bezierCurveTo(
          -screenRad * 0.5, -screenRad * 0.8,
          screenRad * 0.5, -screenRad * 0.8,
          screenRad * 0.8, -screenRad * 0.1
        );
        alienGraphics.lineTo(screenRad * 0.5, 0);
        alienGraphics.lineTo(-screenRad * 0.5, 0);
        alienGraphics.closePath();
        alienGraphics.fill('#1e293b');
        alienGraphics.stroke({ width: 1.0, color: '#f97316', alpha: 0.5 });

        // D. Red Cylon Scanning Searchlight
        const sweepAngle = Math.sin(tSec * 3.5 + seed) * 0.52; // Sweeps +/- 30 degrees
        const beamLength = screenRad * 4.2;
        const beamAngleWidth = 0.22;

        alienGraphics.save();
        alienGraphics.translateTransform(0, -screenRad * 0.8);
        alienGraphics.rotateTransform(sweepAngle);

        alienGraphics.moveTo(0, 0);
        alienGraphics.lineTo(-Math.sin(beamAngleWidth) * beamLength, -Math.cos(beamAngleWidth) * beamLength);
        alienGraphics.lineTo(Math.sin(beamAngleWidth) * beamLength, -Math.cos(beamAngleWidth) * beamLength);
        alienGraphics.closePath();
        alienGraphics.fill({ color: '#ef4444', alpha: 0.14 });
        
        alienGraphics.circle(0, 0, Math.max(1.5, screenRad * 0.12))
          .fill({ color: '#ef4444' });
        alienGraphics.restore();

        // E. Hull Deck Lights
        const leftX = -screenRad * 1.1;
        const rightX = screenRad * 1.1;
        const hullY = screenRad * 0.05;
        const hullLightPulse = 0.4 + 0.6 * Math.sin(tSec * 4.0 + seed);
        alienGraphics.circle(leftX, hullY, Math.max(1.2, screenRad * 0.1))
          .fill({ color: '#fbbf24', alpha: hullLightPulse });
        alienGraphics.circle(rightX, hullY, Math.max(1.2, screenRad * 0.1))
          .fill({ color: '#fbbf24', alpha: hullLightPulse });

        const warningLightOn = Math.floor(tSec * 2.0) % 2 === 0;
        alienGraphics.circle(-screenRad * 0.5, -screenRad * 0.3, Math.max(1.0, screenRad * 0.08))
          .fill({ color: warningLightOn ? '#ef4444' : '#7f1d1d' });
        alienGraphics.circle(screenRad * 0.5, -screenRad * 0.3, Math.max(1.0, screenRad * 0.08))
          .fill({ color: warningLightOn ? '#ef4444' : '#7f1d1d' });

      } else if (type === 'bomber') {
        // --- 4. BOMBER RENDER ---
        // A. Heavy Double Thruster Exhaust (pulsing amber/yellow)
        const thrusterOffsets = [-screenRad * 0.7, screenRad * 0.7];
        for (let k = 0; k < thrusterOffsets.length; k++) {
          const ox = thrusterOffsets[k];
          const flamePulse = 0.6 + 0.3 * Math.sin(tSec * 15.0 + k * 3.0 + seed);
          const flameH = screenRad * 2.2 * flamePulse;
          const flameW = screenRad * 0.5;
          alienGraphics.moveTo(ox - flameW * 0.5, screenRad * 0.4);
          alienGraphics.lineTo(ox + flameW * 0.5, screenRad * 0.4);
          alienGraphics.lineTo(ox, screenRad * 0.4 + flameH);
          alienGraphics.closePath();
          alienGraphics.fill({ color: '#f59e0b', alpha: 0.8 * flamePulse });
        }

        // B. Bulky Force Shield (Yellow/Amber Hexagon)
        const shieldRadius = screenRad * 1.9 * shieldPulse;
        for (let k = 0; k < 6; k++) {
          const angle = (k / 6) * Math.PI * 2 + Math.PI / 6;
          const sx = Math.cos(angle) * shieldRadius;
          const sy = Math.sin(angle) * shieldRadius;
          if (k === 0) alienGraphics.moveTo(sx, sy);
          else alienGraphics.lineTo(sx, sy);
        }
        alienGraphics.closePath();
        alienGraphics.stroke({ width: 1.5, color: '#eab308', alpha: 0.25 + 0.1 * Math.sin(tSec * 8.0) });
        alienGraphics.fill({ color: '#eab308', alpha: 0.03 });

        // C. Heavy Hexagonal Armor Hull
        const hr = screenRad * 1.5;
        for (let k = 0; k < 6; k++) {
          const angle = (k / 6) * Math.PI * 2 + Math.PI / 6;
          const hx = Math.cos(angle) * hr;
          const hy = Math.sin(angle) * hr;
          if (k === 0) alienGraphics.moveTo(hx, hy);
          else alienGraphics.lineTo(hx, hy);
        }
        alienGraphics.closePath();
        alienGraphics.fill('#1e293b'); // Dark slate carbon
        alienGraphics.stroke({ width: 2.0, color: '#fbbf24' }); // Vivid amber/yellow border

        // Inner core armor plate
        const icr = screenRad * 0.9;
        for (let k = 0; k < 6; k++) {
          const angle = (k / 6) * Math.PI * 2 + Math.PI / 6;
          const hx = Math.cos(angle) * icr;
          const hy = Math.sin(angle) * icr;
          if (k === 0) alienGraphics.moveTo(hx, hy);
          else alienGraphics.lineTo(hx, hy);
        }
        alienGraphics.closePath();
        alienGraphics.fill('#0f172a');
        alienGraphics.stroke({ width: 1.0, color: '#eab308', alpha: 0.4 });

        // D. Heavy Bomb Hatch / Warning Core (Pulsing bright yellow)
        const corePulse = 0.6 + 0.4 * Math.sin(tSec * 5.0 + seed);
        alienGraphics.circle(0, 0, screenRad * 0.45);
        alienGraphics.fill({ color: '#eab308', alpha: 0.8 * corePulse });
        alienGraphics.stroke({ width: 1.2, color: '#ffffff' });

        // E. Warning Strobes / Caution lights
        const strobeOn = Math.floor(tSec * 3.0) % 2 === 0;
        alienGraphics.circle(-screenRad * 1.1, -screenRad * 0.6, Math.max(1.5, screenRad * 0.15));
        alienGraphics.fill({ color: strobeOn ? '#f59e0b' : '#451a03' });

        alienGraphics.circle(screenRad * 1.1, -screenRad * 0.6, Math.max(1.5, screenRad * 0.15));
        alienGraphics.fill({ color: strobeOn ? '#f59e0b' : '#451a03' });

        alienGraphics.circle(0, screenRad * 0.9, Math.max(1.5, screenRad * 0.15));
        alienGraphics.fill({ color: !strobeOn ? '#f59e0b' : '#451a03' });

      } else if (type === 'kamikaze') {
        // --- 5. KAMIKAZE RENDER ---
        const earth = bodies.find(b => b.id === 'earth');
        const distToEarth = earth ? Math.sqrt((alien.x - earth.x)**2 + (alien.y - earth.y)**2) : 1000;
        const isCharging = distToEarth < 300;

        // A. High-Intensity Overload Jet (Long pulsing red/white exhaust)
        const flamePulse = 0.6 + 0.4 * Math.sin(tSec * 35.0 + seed);
        const chargeMultiplier = isCharging ? 2.2 : 1.0;
        const flameH = screenRad * 2.8 * flamePulse * chargeMultiplier;
        const flameW = screenRad * (isCharging ? 0.8 : 0.55);
        alienGraphics.moveTo(-flameW * 0.5, screenRad * 0.4);
        alienGraphics.lineTo(flameW * 0.5, screenRad * 0.4);
        alienGraphics.lineTo(0, screenRad * 0.4 + flameH);
        alienGraphics.closePath();
        alienGraphics.fill({ color: isCharging ? '#ffffff' : '#f43f5e', alpha: 0.9 });
        alienGraphics.moveTo(-flameW * 0.25, screenRad * 0.4);
        alienGraphics.lineTo(flameW * 0.25, screenRad * 0.4);
        alienGraphics.lineTo(0, screenRad * 0.4 + flameH * 0.6);
        alienGraphics.closePath();
        alienGraphics.fill({ color: '#ef4444', alpha: 0.7 });

        // B. Glowing Red Overload Shield
        const shieldRadius = screenRad * 1.7 * shieldPulse;
        alienGraphics.circle(0, 0, shieldRadius);
        alienGraphics.stroke({
          width: isCharging ? 2.0 : 1.2,
          color: '#ef4444',
          alpha: isCharging ? 0.7 + 0.3 * Math.sin(tSec * 25.0) : 0.25 + 0.1 * Math.sin(tSec * 10.0)
        });
        alienGraphics.circle(0, 0, shieldRadius);
        alienGraphics.fill({ color: '#ef4444', alpha: isCharging ? 0.08 : 0.03 });

        // C. Charging Warning Halo (Expanding concentric circle rings if in suicide run)
        if (isCharging) {
          const ringScale = (tSec * 3.0) % 1.0; // 0 to 1 cycle
          alienGraphics.circle(0, 0, screenRad * 3.0 * ringScale);
          alienGraphics.stroke({ width: 1.0, color: '#ef4444', alpha: 0.8 * (1.0 - ringScale) });
        }

        // D. Spiked wedge hull (pointed nose, rear fins, spiked side pods)
        alienGraphics.moveTo(0, -screenRad * 1.6); // Sharp point nose
        alienGraphics.lineTo(screenRad * 0.7, -screenRad * 0.4);
        alienGraphics.lineTo(screenRad * 1.2, screenRad * 0.9); // Right wing tip
        alienGraphics.lineTo(screenRad * 0.4, screenRad * 0.5); // Right inner body
        alienGraphics.lineTo(0, screenRad * 0.3); // Rear center indentation
        alienGraphics.lineTo(-screenRad * 0.4, screenRad * 0.5); // Left inner body
        alienGraphics.lineTo(-screenRad * 1.2, screenRad * 0.9); // Left wing tip
        alienGraphics.lineTo(-screenRad * 0.7, -screenRad * 0.4);
        alienGraphics.closePath();
        alienGraphics.fill('#450a0a'); // Deep dark blood red hull
        alienGraphics.stroke({ width: 1.8, color: '#ef4444' }); // Glowing hot red border

        // Inner glowing core panel
        alienGraphics.moveTo(0, -screenRad * 0.9);
        alienGraphics.lineTo(screenRad * 0.35, screenRad * 0.1);
        alienGraphics.lineTo(0, screenRad * 0.2);
        alienGraphics.lineTo(-screenRad * 0.35, screenRad * 0.1);
        alienGraphics.closePath();
        alienGraphics.fill('#7f1d1d');
        alienGraphics.stroke({ width: 1.0, color: '#f43f5e', alpha: 0.5 });

        // E. Overheating Plasma Core (white-hot center strobe)
        const coreRate = isCharging ? 25.0 : 8.0;
        const heatPulse = 0.5 + 0.5 * Math.sin(tSec * coreRate + seed);
        alienGraphics.circle(0, -screenRad * 0.1, screenRad * 0.32);
        alienGraphics.fill({ color: isCharging ? '#ffffff' : '#f43f5e', alpha: 0.8 * heatPulse });
        alienGraphics.circle(0, -screenRad * 0.1, screenRad * 0.16);
        alienGraphics.fill({ color: '#ef4444' });

      } else {
        // --- 3. SAUCER RENDER (Standard Green) ---
        // A. Conical Anti-Gravity Propulsion Beam
        const beamW = screenRad * 1.0;
        const beamH = screenRad * 2.4;
        const beamPulse = 0.55 + 0.2 * Math.sin(tSec * 18.0 + seed);
        alienGraphics.moveTo(-beamW * 0.4, screenRad * 0.2);
        alienGraphics.lineTo(beamW * 0.4, screenRad * 0.2);
        alienGraphics.lineTo(beamW * 1.1, beamH);
        alienGraphics.lineTo(-beamW * 1.1, beamH);
        alienGraphics.fill({ color: '#54f2a7', alpha: 0.14 * beamPulse });

        // B. Shield / Force Field Neon Ring
        const shieldPulseRing = 1.0 + 0.08 * Math.sin(tSec * 8.0 + seed);
        alienGraphics
          .circle(0, 0, screenRad * 2.0 * shieldPulseRing)
          .stroke({ width: 1.2, color: '#10b981', alpha: 0.22 + 0.1 * Math.sin(tSec * 10.0) });
        alienGraphics
          .circle(0, 0, screenRad * 2.0 * shieldPulseRing)
          .fill({ color: '#10b981', alpha: 0.04 });

        // C. Metallic Saucer Hull
        alienGraphics
          .ellipse(0, 0, screenRad * 1.55, screenRad * 0.65)
          .fill('#1e293b')
          .stroke({ width: 1.5, color: '#34d399' });

        alienGraphics
          .ellipse(0, screenRad * 0.1, screenRad * 1.15, screenRad * 0.4)
          .fill('#0f172a')
          .stroke({ width: 1.0, color: '#10b981', alpha: 0.4 });

        // D. Cockpit Dome
        alienGraphics
          .ellipse(0, -screenRad * 0.25, screenRad * 0.68, screenRad * 0.5)
          .fill({ color: '#065f46', alpha: 0.85 })
          .stroke({ width: 1.5, color: '#34d399' });

        // Inner alien core
        const corePulse = 0.5 + 0.35 * Math.sin(tSec * 7.0 + seed);
        alienGraphics
          .circle(0, -screenRad * 0.25, screenRad * 0.22)
          .fill({ color: '#54f2a7', alpha: corePulse });

        // Windshield glare
        alienGraphics
          .ellipse(-screenRad * 0.2, -screenRad * 0.38, screenRad * 0.22, screenRad * 0.12)
          .fill({ color: '#ffffff', alpha: 0.35 });

        // E. Sequential LED Lights (smooth rotating light chase and dynamic color-shift)
        const numLights = 8;
        const lightRotation = tSec * 1.5;
        for (let k = 0; k < numLights; k++) {
          const baseLightAngle = (k / numLights) * Math.PI * 2;
          const lightAngle = baseLightAngle + lightRotation;
          const lx = Math.cos(lightAngle) * (screenRad * 1.3);
          const ly = Math.sin(lightAngle) * (screenRad * 0.5);
          
          const wavePos = (tSec * 1.8) % (Math.PI * 2);
          let distToWave = Math.abs(baseLightAngle - wavePos);
          if (distToWave > Math.PI) distToWave = Math.PI * 2 - distToWave;
          
          const intensity = Math.max(0.15, 1.0 - (distToWave / Math.PI) * 1.5);
          const gVal = 0.5 + 0.5 * Math.sin(tSec * 2.0 + k);
          const lightColor = lerpColor('#10b981', '#00f2fe', gVal);
          
          alienGraphics
            .circle(lx, ly, Math.max(1.2, screenRad * 0.16 * (0.8 + intensity * 0.4)))
            .fill({ color: lightColor, alpha: intensity });

          if (intensity > 0.7) {
            alienGraphics
              .circle(lx, ly, Math.max(0.6, screenRad * 0.08))
              .fill('#ffffff');
          }
        }
      }

      // 4. HP Bar in Local Coordinates
      if (alien.hp < alien.maxHp) {
        const barW = screenRad * 1.6;
        const barH = 3;
        const barX = -barW / 2;
        const barY = -screenRad * 1.0;
        alienGraphics.rect(barX, barY, barW, barH).fill({
          color: '#ff0000',
          alpha: 0.4,
        });
        alienGraphics
          .rect(barX, barY, barW * (alien.hp / alien.maxHp), barH)
          .fill('#34d399');
      }

      // Restore graphics context
      alienGraphics.restore();

      // 5. Emit Anti-Gravity Exhaust Particles in simulation space (from bobbed center and matching orientation)
      const actualDt = dt * configRef.current.timeScale;
      if (actualDt > 0) {
        const baseCount = 0.35 * (actualDt / 0.016);
        const intCount = Math.floor(baseCount);
        const extraProb = baseCount - intCount;
        const finalCount = intCount + (Math.random() < extraProb ? 1 : 0);

        const zoom = cameraRef.current.zoom;
        const scaleFactor = screenRad / (alien.radius * zoom);

        for (let k = 0; k < finalCount; k++) {
          // Determine local coordinate offsets in simulation space matching visual thruster positions
          let localX = 0;
          let localY = alien.radius * 0.2 * scaleFactor;

          if (type === 'cruiser') {
            // Cruiser has three thrusters, pick one at random
            const ox = [-alien.radius * 0.6, 0, alien.radius * 0.6][Math.floor(Math.random() * 3)];
            localX = ox * scaleFactor;
            localY = alien.radius * 0.4 * scaleFactor;
          } else if (type === 'scout') {
            localX = 0;
            localY = alien.radius * 0.2 * scaleFactor;
          } else if (type === 'bomber') {
            // Bomber has double thrusters
            const ox = [-alien.radius * 0.7, alien.radius * 0.7][Math.floor(Math.random() * 2)];
            localX = ox * scaleFactor;
            localY = alien.radius * 0.4 * scaleFactor;
          } else if (type === 'kamikaze') {
            // Kamikaze has single main engine
            localX = 0;
            localY = alien.radius * 0.4 * scaleFactor;
          }

          // Rotate the local offset to world/simulation space using finalRotation
          const cosR = Math.cos(finalRotation);
          const sinR = Math.sin(finalRotation);
          const worldX = localX * cosR - localY * sinR;
          const worldY = localX * sinR + localY * cosR;

          const pX = (alien.x + bobSimX) + worldX;
          const pY = (alien.y + bobSimY) + worldY;

          // Exhaust particles blast downwards in ship space (i.e. finalRotation + Math.PI / 2)
          const pAngle = finalRotation + Math.PI / 2 + (Math.random() * 0.3 - 0.15);
          
          let pSpeedBase = 35;
          let pSpeedRand = 45;
          if (type === 'kamikaze') {
            const earth = bodies.find(b => b.id === 'earth');
            const distToEarth = earth ? Math.sqrt((alien.x - earth.x)**2 + (alien.y - earth.y)**2) : 1000;
            if (distToEarth < 300) {
              pSpeedBase = 90;
              pSpeedRand = 80;
            }
          }
          const pSpeed = pSpeedBase + Math.random() * pSpeedRand;
          const pVx = Math.cos(pAngle) * pSpeed + alien.vx;
          const pVy = Math.sin(pAngle) * pSpeed + alien.vy;

          let partColor = '#34d399'; // Green default for saucer
          if (type === 'scout') partColor = '#c084fc'; // Purple
          else if (type === 'cruiser') partColor = '#fb923c'; // Orange
          else if (type === 'bomber') partColor = '#eab308'; // Amber/Yellow
          else if (type === 'kamikaze') {
            const earth = bodies.find(b => b.id === 'earth');
            const distToEarth = earth ? Math.sqrt((alien.x - earth.x)**2 + (alien.y - earth.y)**2) : 1000;
            partColor = distToEarth < 300 ? (Math.random() > 0.4 ? '#ffffff' : '#f43f5e') : '#ef4444'; // white/red hot when charging
          }

          particlesRef.current.push({
            x: pX,
            y: pY,
            vx: pVx,
            vy: pVy,
            color: partColor,
            size: 1.8 + Math.random() * 1.5,
            alpha: 0.9,
            decay: 0.02 + Math.random() * 0.015,
          });
        }
      }
    }

    removeUnusedText(pools.alienDistances, activeDistanceIds);
  };

  const drawLaunchPreview = (overlay: Graphics, labelsLayer: Container) => {
    const launchStart = launchStartRef.current;
    const launchCurrent = launchCurrentRef.current;
    const preset = launchPresetRef.current;
    const pools = textPoolsRef.current;

    if (!launchStart || !launchCurrent || !preset) {
      if (pools.launchVelocity) pools.launchVelocity.visible = false;
      return;
    }

    const start = simToScreen(launchStart.x, launchStart.y);
    const current = simToScreen(launchCurrent.x, launchCurrent.y);
    const previewRad = Math.max(1.5, preset.radius * cameraRef.current.zoom);

    overlay
      .circle(start.x, start.y, previewRad)
      .fill({ color: preset.color, alpha: 0.33 })
      .stroke({ width: 1, color: preset.color });

    overlay.beginPath();
    overlay.moveTo(start.x, start.y);
    overlay.lineTo(current.x, current.y);
    overlay.stroke({ width: 2, color: '#00f2fe' });

    const angle = Math.atan2(current.y - start.y, current.x - start.x);
    overlay
      .poly(
        [
          current.x,
          current.y,
          current.x - 12 * Math.cos(angle - Math.PI / 6),
          current.y - 12 * Math.sin(angle - Math.PI / 6),
          current.x - 12 * Math.cos(angle + Math.PI / 6),
          current.y - 12 * Math.sin(angle + Math.PI / 6),
        ],
        true,
      )
      .fill('#00f2fe');

    const velocityMagnitude =
      distance(launchStart.x, launchStart.y, launchCurrent.x, launchCurrent.y) * 0.04;

    if (!pools.launchVelocity) {
      pools.launchVelocity = new Text({ text: '', style: LAUNCH_TEXT_STYLE });
      pools.launchVelocity.anchor.set(0.5);
      labelsLayer.addChild(pools.launchVelocity);
    }

    pools.launchVelocity.visible = true;
    pools.launchVelocity.text = `V: ${velocityMagnitude.toFixed(2)} u/s`;
    pools.launchVelocity.position.set(start.x, start.y + previewRad + 20);
  };

  const applyCameraFollow = (width: number, height: number, bodies: Body[]) => {
    const camera = cameraRef.current;
    const ship = shipRef.current;

    if (configRef.current.followShip && ship && ship.active) {
      camera.offsetX = width / 2 - ship.x * camera.zoom;
      camera.offsetY = height / 2 - ship.y * camera.zoom;
      return;
    }

    if (configRef.current.followBodyId) {
      const followBody = bodies.find((body) => body.id === configRef.current.followBodyId);
      if (followBody) {
        camera.offsetX = width / 2 - followBody.x * camera.zoom;
        camera.offsetY = height / 2 - followBody.y * camera.zoom;
      }
    }
  };

  const drawScene = (dt: number = 0.016) => {
    const scene = pixiSceneRef.current;
    if (!scene) return;

    const { app, layers } = scene;
    const width = app.screen.width;
    const height = app.screen.height;
    const bodies = bodiesRef.current;
    const ship = shipRef.current;
    const bullets = bulletsRef.current;
    const alienShips = alienShipsRef.current;
    const satellites = satellitesRef.current;

    const camera = cameraRef.current;
    configRef.current.cameraZoom = camera.zoom;
    configRef.current.cameraOffsetX = camera.offsetX;
    configRef.current.cameraOffsetY = camera.offsetY;
    config.cameraZoom = camera.zoom;
    config.cameraOffsetX = camera.offsetX;
    config.cameraOffsetY = camera.offsetY;

    applyCameraFollow(width, height, bodies);
    clearLayers(layers);
    updateCombatEffects(bodies, alienShips);

    drawBackground(layers, width, height);
    if (configRef.current.gridEnabled) {
      drawWarpGrid(layers.grid, width, height, bodies);
    }
    drawTrails(layers.trails, bodies);
    drawBodies(layers.bodies, layers.labels, bodies, dt);
    drawSatellites(layers.satellites, satellites, alienShips);
    drawParticles(layers.particles, dt);
    drawShip(layers.ship, ship, dt);
    drawBullets(layers.bullets, bullets, width, height, dt);
    drawAliens(layers.aliens, layers.labels, alienShips, bodies, width, height, dt);
    drawLaunchPreview(layers.overlays, layers.labels);

    app.render();
  };


  useEffect(() => {
    drawSceneRef.current = drawScene;
  });

  return (
    <div
      ref={containerRef}
      className="canvas-container"
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        cursor: launchPreset ? 'crosshair' : 'default',
      }}
    />
  );
};
