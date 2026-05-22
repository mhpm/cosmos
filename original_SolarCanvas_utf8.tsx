import React, { useRef, useState, useEffect } from 'react';
import type { Body, PhysicsConfig, Point, Spaceship, Particle, Bullet, AlienShip } from '../physics/types';
import { drawSpaceGrid } from './SpaceGrid';

interface SolarCanvasProps {
  bodiesRef: React.MutableRefObject<Body[]>;
  config: PhysicsConfig;
  selectedBodyId: string | null;
  setSelectedBodyId: (id: string | null) => void;
  launchPreset: { mass: number; radius: number; color: string; name: string } | null;
  onSimulationTick: (callback: () => void) => void;
  shipRef: React.MutableRefObject<Spaceship | null>;
  bulletsRef: React.MutableRefObject<Bullet[]>;
  alienShipsRef: React.MutableRefObject<AlienShip[]>;
}

export const SolarCanvas: React.FC<SolarCanvasProps> = ({
  bodiesRef,
  config,
  selectedBodyId,
  setSelectedBodyId,
  launchPreset,
  onSimulationTick,
  shipRef,
  bulletsRef,
  alienShipsRef,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  // Camera State (stored in refs for high-frequency access in animation loop)
  const cameraRef = useRef({
    zoom: 1.0,
    offsetX: 0,
    offsetY: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
  });

  // Launch interaction state
  const [launchStart, setLaunchStart] = useState<Point | null>(null);
  const [launchCurrent, setLaunchCurrent] = useState<Point | null>(null);

  // Parallax Stars (generated once)
  const starsRef = useRef<{ x: number; y: number; size: number; alpha: number }[]>([]);
  
  // Spaceship local drawing and visual particle state
  const particlesRef = useRef<Particle[]>([]);
  const wasShipActiveRef = useRef<boolean>(false);
  const wasShipPosRef = useRef<{ x: number; y: number; vx: number; vy: number }>({ x: 0, y: 0, vx: 0, vy: 0 });

  // Combat history trackers for animations
  const prevAlienShipsRef = useRef<AlienShip[] | null>(null);
  const prevBodiesRef = useRef<Body[] | null>(null);

  if (starsRef.current.length === 0) {
    const list = [];
    for (let i = 0; i < 200; i++) {
      list.push({
        x: Math.random() * 4000 - 2000,
        y: Math.random() * 4000 - 2000,
        size: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.7 + 0.3,
      });
    }
    starsRef.current = list;
  }

  // Update canvas offsets from config (if followed body or reset)
  useEffect(() => {
    cameraRef.current.zoom = config.cameraZoom;
    cameraRef.current.offsetX = config.cameraOffsetX;
    cameraRef.current.offsetY = config.cameraOffsetY;
  }, [config.cameraZoom, config.cameraOffsetX, config.cameraOffsetY]);

  // Center camera initially when canvas is ready
  useEffect(() => {
    if (canvasRef.current && cameraRef.current.offsetX === 0 && cameraRef.current.offsetY === 0) {
      cameraRef.current.offsetX = canvasRef.current.width / 2;
      cameraRef.current.offsetY = canvasRef.current.height / 2;
    }
  }, []);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Conversions between Screen Space and Simulation Space
  const screenToSim = (screenX: number, screenY: number) => {
    const { zoom, offsetX, offsetY } = cameraRef.current;
    return {
      x: (screenX - offsetX) / zoom,
      y: (screenY - offsetY) / zoom,
    };
  };

  const simToScreen = (simX: number, simY: number) => {
    const { zoom, offsetX, offsetY } = cameraRef.current;
    return {
      x: simX * zoom + offsetX,
      y: simY * zoom + offsetY,
    };
  };

  // Mouse Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    // Check if clicked on a planet
    const simCoords = screenToSim(clientX, clientY);
    let clickedBody: Body | null = null;
    const bodies = bodiesRef.current;

    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      const dx = b.x - simCoords.x;
      const dy = b.y - simCoords.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Give a small margin of clickability (at least 15 pixels radius in screen space)
      const minClickRadius = Math.max(b.radius, 15 / cameraRef.current.zoom);
      if (dist <= minClickRadius) {
        clickedBody = b;
        break;
      }
    }

    if (e.button === 0) { // Left click
      if (launchPreset) {
        // Launch Mode: Start placing new planet
        setLaunchStart(simCoords);
        setLaunchCurrent(simCoords);
      } else {
        // Select Mode
        if (clickedBody) {
          setSelectedBodyId(clickedBody.id);
        } else {
          // Clicked empty space: start dragging camera (or deselect if not dragging much)
          setSelectedBodyId(null);
          cameraRef.current.isDragging = true;
          cameraRef.current.dragStartX = clientX - cameraRef.current.offsetX;
          cameraRef.current.dragStartY = clientY - cameraRef.current.offsetY;
        }
      }
    } else if (e.button === 1 || e.button === 2) { // Middle or Right click: Pan camera
      cameraRef.current.isDragging = true;
      cameraRef.current.dragStartX = clientX - cameraRef.current.offsetX;
      cameraRef.current.dragStartY = clientY - cameraRef.current.offsetY;
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    if (cameraRef.current.isDragging) {
      cameraRef.current.offsetX = clientX - cameraRef.current.dragStartX;
      cameraRef.current.offsetY = clientY - cameraRef.current.dragStartY;
    } else if (launchStart) {
      setLaunchCurrent(screenToSim(clientX, clientY));
    }
  };

  const handleMouseUp = () => {
    if (cameraRef.current.isDragging) {
      cameraRef.current.isDragging = false;
      return;
    }

    if (launchStart && launchCurrent && launchPreset) {
      // Calculate velocity vector based on drag length and direction
      // Direction is from launchStart to launchCurrent
      const dx = launchCurrent.x - launchStart.x;
      const dy = launchCurrent.y - launchStart.y;
      
      // Speed scalar: make it feel intuitive to launch (we scale the speed down)
      const speedScaling = 0.04;
      const vx = dx * speedScaling;
      const vy = dy * speedScaling;

      const newBody: Body = {
        id: `custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: launchPreset.name,
        mass: launchPreset.mass,
        radius: launchPreset.radius,
        x: launchStart.x,
        y: launchStart.y,
        vx,
        vy,
        ax: 0,
        ay: 0,
        color: launchPreset.color,
        trail: [],
        isStatic: false,
        isBlackHole: launchPreset.name === 'Agujero Negro',
      };

      // Add new body to simulation
      bodiesRef.current = [...bodiesRef.current, newBody];
      setSelectedBodyId(newBody.id);

      // Reset launch states
      setLaunchStart(null);
      setLaunchCurrent(null);
    }
  };

  // Zoom Handler
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Zoom speed
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newZoom = Math.min(Math.max(cameraRef.current.zoom * zoomFactor, 0.05), 10);

    // Zoom centered on mouse position:
    // mouseSim = (mouseX - offsetX) / zoom => offsetX = mouseX - mouseSim * zoom
    const mouseSimX = (mouseX - cameraRef.current.offsetX) / cameraRef.current.zoom;
    const mouseSimY = (mouseY - cameraRef.current.offsetY) / cameraRef.current.zoom;

    cameraRef.current.zoom = newZoom;
    cameraRef.current.offsetX = mouseX - mouseSimX * newZoom;
    cameraRef.current.offsetY = mouseY - mouseSimY * newZoom;
  };

  // Main Drawing Function (called inside requestAnimationFrame loop)
  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    const { zoom, offsetX, offsetY } = cameraRef.current;
    const bodies = bodiesRef.current;
    const ship = shipRef.current;
    const bullets = bulletsRef.current;
    const alienShips = alienShipsRef.current;

    // A. Detect Alien Ship explosions
    if (prevAlienShipsRef.current) {
      const currentIds = new Set(alienShips.map(s => s.id));
      for (const prevShip of prevAlienShipsRef.current) {
        if (!currentIds.has(prevShip.id)) {
          // Spawn green sparks
          for (let k = 0; k < 25; k++) {
            const expAngle = Math.random() * Math.PI * 2;
            const expSpeed = 20 + Math.random() * 85;
            particlesRef.current.push({
              x: prevShip.x,
              y: prevShip.y,
              vx: Math.cos(expAngle) * expSpeed + prevShip.vx * 0.3,
              vy: Math.sin(expAngle) * expSpeed + prevShip.vy * 0.3,
              color: Math.random() > 0.4 ? '#54f2a7' : '#10b981',
              size: 2.0 + Math.random() * 3.0,
              alpha: 1.0,
              decay: 0.025 + Math.random() * 0.02,
            });
          }
        }
      }
    }
    prevAlienShipsRef.current = alienShips.map(s => ({ ...s }));

    // B. Detect Earth explosion
    if (prevBodiesRef.current) {
      const wasEarthPresent = prevBodiesRef.current.some(b => b.id === 'earth');
      const isEarthPresent = bodies.some(b => b.id === 'earth');
      if (wasEarthPresent && !isEarthPresent) {
        const lastEarth = prevBodiesRef.current.find(b => b.id === 'earth');
        if (lastEarth) {
          // Spawn massive fire storm
          for (let k = 0; k < 150; k++) {
            const expAngle = Math.random() * Math.PI * 2;
            const expSpeed = 40 + Math.random() * 260;
            particlesRef.current.push({
              x: lastEarth.x,
              y: lastEarth.y,
              vx: Math.cos(expAngle) * expSpeed + lastEarth.vx * 0.25,
              vy: Math.sin(expAngle) * expSpeed + lastEarth.vy * 0.25,
              color: Math.random() > 0.65 ? '#ffffff' : (Math.random() > 0.3 ? '#ff7700' : '#ff4d4d'),
              size: 4.0 + Math.random() * 7.5,
              alpha: 1.0,
              decay: 0.007 + Math.random() * 0.012,
            });
          }
        }
      }
    }
    prevBodiesRef.current = bodies.map(b => ({ ...b }));

    // 1. Clear Screen
    ctx.fillStyle = '#05050e'; // Super deep space black
    ctx.fillRect(0, 0, width, height);

    // Subtle space dust / ambient gradient
    const gradient = ctx.createRadialGradient(width / 2, height / 2, 10, width / 2, height / 2, Math.max(width, height));
    gradient.addColorStop(0, 'rgba(12, 12, 28, 0.6)');
    gradient.addColorStop(1, 'rgba(3, 3, 8, 0.9)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // 2. Draw Stars (with Parallax based on camera position)
    ctx.save();
    for (let i = 0; i < starsRef.current.length; i++) {
      const star = starsRef.current[i];
      // Parallax effect: stars scroll at a fraction of camera offsets
      const sx = (star.x * 0.15 + offsetX * 0.1) % width;
      const sy = (star.y * 0.15 + offsetY * 0.1) % height;

      // Wrap around screen edge
      const screenStarX = sx < 0 ? sx + width : sx;
      const screenStarY = sy < 0 ? sy + height : sy;

      ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
      ctx.beginPath();
      ctx.arc(screenStarX, screenStarY, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 3. Draw Warp Space Grid
    if (config.gridEnabled) {
      drawSpaceGrid(ctx, width, height, bodies, zoom, offsetX, offsetY, 50);
    }

    // 4. Draw Trails
    if (config.trailsEnabled) {
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        if (b.trail.length < 2) continue;

        ctx.save();
        ctx.beginPath();
        
        // Transform the first point
        const startPt = simToScreen(b.trail[0].x, b.trail[0].y);
        ctx.moveTo(startPt.x, startPt.y);

        // Connect the rest
        for (let j = 1; j < b.trail.length; j++) {
          const pt = simToScreen(b.trail[j].x, b.trail[j].y);
          ctx.lineTo(pt.x, pt.y);
        }

        // Draw orbit trail as a beautiful solid semi-transparent line
        ctx.strokeStyle = b.color + '44'; // Clean neon path with 25% alpha
        ctx.lineWidth = Math.max(1, Math.min(2.5, b.radius * zoom * 0.15));
        ctx.stroke();
        ctx.restore();
      }
    }

    // 5. Draw Bodies (Planets/Stars)
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      const screenPos = simToScreen(b.x, b.y);
      const screenRad = Math.max(1.5, b.radius * zoom);

      // Skip drawing if outside screen bounds
      if (
        screenPos.x + screenRad < -100 ||
        screenPos.x - screenRad > width + 100 ||
        screenPos.y + screenRad < -100 ||
        screenPos.y - screenRad > height + 100
      ) {
        continue;
      }

      ctx.save();

      // Soft glow effect around planets/stars
      const glowRad = screenRad * (b.isStatic || b.mass > 1000 ? 3.0 : 2.0);
      const glowGrad = ctx.createRadialGradient(
        screenPos.x, screenPos.y, screenRad * 0.5,
        screenPos.x, screenPos.y, glowRad
      );
      glowGrad.addColorStop(0, b.color);
      glowGrad.addColorStop(0.3, b.color + '44');
      glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, glowRad, 0, Math.PI * 2);
      ctx.fill();

      // Body core drawing
      if (b.isBlackHole) {
        // Einstein lensing ring
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, screenRad + 3, 0, Math.PI * 2);
        ctx.stroke();

        // Neon outer ring
        ctx.strokeStyle = '#a855f7'; // Purple neon
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, screenRad + 6, 0, Math.PI * 2);
        ctx.stroke();

        // Black core
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, screenRad, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Standard planet core
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, screenRad, 0, Math.PI * 2);
        ctx.fill();

        // 3D sphere lighting effect (shading)
        const shadeGrad = ctx.createRadialGradient(
          screenPos.x - screenRad * 0.3, screenPos.y - screenRad * 0.3, screenRad * 0.1,
          screenPos.x, screenPos.y, screenRad
        );
        shadeGrad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
        shadeGrad.addColorStop(0.2, 'rgba(255, 255, 255, 0.0)');
        shadeGrad.addColorStop(0.85, 'rgba(0, 0, 0, 0.4)');
        shadeGrad.addColorStop(1, 'rgba(0, 0, 0, 0.85)');

        ctx.fillStyle = shadeGrad;
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, screenRad, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw Earth's health bar hovering above Earth
      if (b.id === 'earth' && config.earthHp !== undefined && config.maxEarthHp !== undefined) {
        const hp = config.earthHp;
        const maxHp = config.maxEarthHp;

        if (hp > 0) {
          ctx.save();
          const barW = Math.max(30, screenRad * 2.2);
          const barH = 4;
          const barX = screenPos.x - barW / 2;
          const barY = screenPos.y - screenRad * 1.4 - 2;

          // Bar Border & Glow Background
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

          // Bar Health Fill (Green -> Yellow -> Red)
          const pct = hp / maxHp;
          let barCol = '#54f2a7'; // green
          if (pct < 0.3) {
            barCol = '#ff4d4d'; // red
          } else if (pct < 0.6) {
            barCol = '#ffb900'; // yellow
          }

          ctx.fillStyle = barCol;
          ctx.fillRect(barX, barY, barW * pct, barH);

          // Render small text percentage
          ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.font = 'bold 8px Orbitron, Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`HP: ${hp}%`, screenPos.x, barY - 4);
          ctx.restore();
        }
      }

      // Draw planet rings (special visual for Saturn-like body)
      if (b.name.toLowerCase().includes('saturn')) {
        ctx.strokeStyle = 'rgba(233, 196, 106, 0.4)';
        ctx.lineWidth = Math.max(1, screenRad * 0.3);
        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);
        ctx.rotate(-Math.PI / 8); // Tilted rings
        ctx.scale(2.2, 0.4); // Oval rings
        ctx.beginPath();
        ctx.arc(0, 0, screenRad * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Selection indicator
      if (selectedBodyId === b.id) {
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, screenRad + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Text labels
      if (zoom > 0.3) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.font = `11px 'Orbitron', 'Inter', sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(b.name, screenPos.x, screenPos.y - screenRad - 10);
      }

      // 6. Draw Physics Vectors
      // Velocity Vector (Cyan)
      if (config.vectorsEnabled && (Math.abs(b.vx) > 0.01 || Math.abs(b.vy) > 0.01)) {
        ctx.strokeStyle = '#00f2fe';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(screenPos.x, screenPos.y);
        // Arrow length represents speed scaled for camera zoom
        const vectorLen = 8;
        ctx.lineTo(screenPos.x + b.vx * vectorLen * zoom, screenPos.y + b.vy * vectorLen * zoom);
        ctx.stroke();
      }

      // Force/Gravity acceleration Vector (Orange)
      if (config.forceVectorsEnabled && (Math.abs(b.ax) > 0.001 || Math.abs(b.ay) > 0.001)) {
        ctx.strokeStyle = '#ff7700';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(screenPos.x, screenPos.y);
        // Acceleration scaling for visual display
        const accLen = 40;
        ctx.lineTo(screenPos.x + b.ax * accLen * zoom, screenPos.y + b.ay * accLen * zoom);
        ctx.stroke();
      }

      ctx.restore();
    }

    // --- SPACESHIP & PARTICLES ---
    // A. Update and draw particles
    const particles = particlesRef.current;
    const dtSeconds = 0.016; // approximate dt since we draw at ~60fps
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dtSeconds;
      p.y += p.vy * dtSeconds;
      p.alpha -= p.decay;
      p.size -= p.decay * 3; // shrink size

      if (p.alpha <= 0 || p.size <= 0) {
        particles.splice(i, 1);
        continue;
      }

      // Draw particle in screen space
      const screenP = simToScreen(p.x, p.y);
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(screenP.x, screenP.y, Math.max(0.5, p.size * zoom), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // B. Check collision transition for explosion trigger
    if (ship) {
      if (ship.active) {
        // Record current positions for explosion when crash happens
        wasShipActiveRef.current = true;
        wasShipPosRef.current = { x: ship.x, y: ship.y, vx: ship.vx, vy: ship.vy };

        // Generate engine flame particles if thrusting
        if (ship.thrusting) {
          for (let k = 0; k < 2; k++) {
            const backAngle = ship.angle + Math.PI + (Math.random() * 0.4 - 0.2); // opposite with noise
            const spawnDist = 6;
            const px = ship.x + Math.cos(backAngle) * spawnDist;
            const py = ship.y + Math.sin(backAngle) * spawnDist;
            
            const speedFactor = 120 + Math.random() * 60;
            const pvx = ship.vx + Math.cos(backAngle) * speedFactor;
            const pvy = ship.vy + Math.sin(backAngle) * speedFactor;

            const color = Math.random() > 0.4 ? '#00f2fe' : '#e58e26'; // Blue hot center, orange edges
            
            particles.push({
              x: px,
              y: py,
              vx: pvx,
              vy: pvy,
              color,
              size: 2.0 + Math.random() * 1.5,
              alpha: 0.9,
              decay: 0.03 + Math.random() * 0.02
            });
          }
        }

        // Generate RCS brake sparks if braking
        if (ship.braking) {
          for (let k = 0; k < 1; k++) {
            const sideAngle = ship.angle + (Math.random() > 0.5 ? Math.PI/2 : -Math.PI/2) + (Math.random() * 0.3 - 0.15);
            const px = ship.x + Math.cos(ship.angle) * 4;
            const py = ship.y + Math.sin(ship.angle) * 4;
            const pvx = ship.vx + Math.cos(sideAngle) * 50;
            const pvy = ship.vy + Math.sin(sideAngle) * 50;

            particles.push({
              x: px,
              y: py,
              vx: pvx,
              vy: pvy,
              color: '#ffffff',
              size: 1.2,
              alpha: 0.8,
              decay: 0.06
            });
          }
        }

        // Draw the spaceship
        const screenShip = simToScreen(ship.x, ship.y);
        const shipSize = 7.0 * zoom;

        ctx.save();
        ctx.translate(screenShip.x, screenShip.y);
        ctx.rotate(ship.angle);

        // Draw Spaceship shape (Sleek sci-fi triangle pointer)
        ctx.shadowBlur = ship.thrusting ? 10 * zoom : 2 * zoom;
        ctx.shadowColor = '#00f2fe';
        
        ctx.fillStyle = '#111122'; // dark metal hull
        ctx.strokeStyle = '#00f2fe'; // glowing cyan outline
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        // Nose pointer
        ctx.moveTo(shipSize * 1.3, 0);
        // Back left wing
        ctx.lineTo(-shipSize * 0.8, -shipSize * 0.7);
        // Inner engine nozzle
        ctx.lineTo(-shipSize * 0.4, 0);
        // Back right wing
        ctx.lineTo(-shipSize * 0.8, shipSize * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Draw cockpit windshield glow
        ctx.fillStyle = '#54f2a7'; // green window
        ctx.beginPath();
        ctx.moveTo(shipSize * 0.4, 0);
        ctx.lineTo(0, -shipSize * 0.25);
        ctx.lineTo(-shipSize * 0.1, 0);
        ctx.lineTo(0, shipSize * 0.25);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      } else {
        // Ship is inactive. Check if it just crashed!
        if (wasShipActiveRef.current) {
          const crashPos = wasShipPosRef.current;
          
          // Generate 35 glowing explosion particles
          for (let k = 0; k < 35; k++) {
            const expAngle = Math.random() * Math.PI * 2;
            const expSpeed = 30 + Math.random() * 150;
            const pvx = Math.cos(expAngle) * expSpeed + crashPos.vx * 0.4;
            const pvy = Math.sin(expAngle) * expSpeed + crashPos.vy * 0.4;

            const colors = ['#ffffff', '#ffdb58', '#e58e26', '#ff5a5a', '#d671ff'];
            const color = colors[Math.floor(Math.random() * colors.length)];

            particles.push({
              x: crashPos.x,
              y: crashPos.y,
              vx: pvx,
              vy: pvy,
              color,
              size: 3.5 + Math.random() * 4.0,
              alpha: 1.0,
              decay: 0.015 + Math.random() * 0.02
            });
          }

          wasShipActiveRef.current = false;
        }
      }
    }

    // 6. Draw Bullets (Lasers and Plasma)
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      const screenPos = simToScreen(b.x, b.y);
      const screenRad = Math.max(1.5, b.radius * zoom);

      if (
        screenPos.x < -20 || screenPos.x > width + 20 ||
        screenPos.y < -20 || screenPos.y > height + 20
      ) {
        continue;
      }

      ctx.save();
      if (!b.isEnemy) {
        ctx.strokeStyle = '#00f2fe';
        ctx.lineWidth = Math.max(2.5, 2.5 * zoom);
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#00f2fe';

        const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        const length = 15;
        const tailSimX = b.x - (b.vx / (speed || 1)) * length;
        const tailSimY = b.y - (b.vy / (speed || 1)) * length;
        const tailScreen = simToScreen(tailSimX, tailSimY);

        ctx.beginPath();
        ctx.moveTo(screenPos.x, screenPos.y);
        ctx.lineTo(tailScreen.x, tailScreen.y);
        ctx.stroke();
      } else {
        const gradient = ctx.createRadialGradient(
          screenPos.x, screenPos.y, screenRad * 0.1,
          screenPos.x, screenPos.y, screenRad * 2
        );
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.3, '#ff3366');
        gradient.addColorStop(1, 'rgba(255, 51, 102, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, screenRad * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 7. Draw Alien Ships
    for (let i = 0; i < alienShips.length; i++) {
      const alien = alienShips[i];
      const screenPos = simToScreen(alien.x, alien.y);
      const screenRad = Math.max(5.5, alien.radius * zoom);

      if (
        screenPos.x < 15 || screenPos.x > width - 15 ||
        screenPos.y < 15 || screenPos.y > height - 15
      ) {
        const padding = 20;
        const cx = Math.max(padding, Math.min(width - padding, screenPos.x));
        const cy = Math.max(padding, Math.min(height - padding, screenPos.y));
        
        const centerX = width / 2;
        const centerY = height / 2;
        const angleToAlien = Math.atan2(screenPos.y - centerY, screenPos.x - centerX);
        
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angleToAlien);
        
        ctx.fillStyle = '#10b981';
        ctx.shadowColor = '#54f2a7';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-6, -6);
        ctx.lineTo(-6, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        
        const ship = shipRef.current;
        const refPos = ship && ship.active ? ship : (bodies.find(b => b.id === 'earth') || { x: 0, y: 0 });
        const simDist = Math.round(Math.sqrt((alien.x - refPos.x) ** 2 + (alien.y - refPos.y) ** 2));
        
        ctx.save();
        ctx.fillStyle = '#10b981';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const tx = cx - Math.cos(angleToAlien) * 16;
        const ty = cy - Math.sin(angleToAlien) * 16;
        ctx.fillText(`${simDist}u`, tx, ty);
        ctx.restore();
        
        continue;
      }

      ctx.save();

      // Thruster green aura glow
      const glowGrad = ctx.createRadialGradient(
        screenPos.x, screenPos.y, screenRad * 0.2,
        screenPos.x, screenPos.y, screenRad * 2.2
      );
      glowGrad.addColorStop(0, 'rgba(84, 242, 167, 0.45)');
      glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, screenRad * 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Saucer body shape
      ctx.fillStyle = '#065f46'; // dark green emerald body
      ctx.strokeStyle = '#34d399'; // glowing green edge
      ctx.lineWidth = 1.8;

      ctx.beginPath();
      ctx.ellipse(screenPos.x, screenPos.y, screenRad * 1.3, screenRad * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Saucer glass dome
      ctx.fillStyle = 'rgba(16, 185, 129, 0.7)'; // glass emerald dome
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y - screenRad * 0.25, screenRad * 0.5, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Blinking saucer lights
      const time = Date.now() / 150;
      const perimeterDots = 4;
      for (let d = 0; d < perimeterDots; d++) {
        const dotAngle = (d / perimeterDots) * Math.PI * 2 + time * 0.1;
        const dotX = screenPos.x + Math.cos(dotAngle) * screenRad * 1.0;
        const dotY = screenPos.y + Math.sin(dotAngle) * screenRad * 0.45;
        
        ctx.fillStyle = d % 2 === 0 ? '#ef4444' : '#34d399';
        ctx.beginPath();
        ctx.arc(dotX, dotY, Math.max(1, 1.2 * zoom), 0, Math.PI * 2);
        ctx.fill();
      }

      // Alien HP Bar
      if (alien.hp < alien.maxHp) {
        const barW = screenRad * 1.6;
        const barH = 3;
        const barX = screenPos.x - barW / 2;
        const barY = screenPos.y - screenRad * 1.0;

        ctx.fillStyle = 'rgba(255, 0, 0, 0.4)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = '#34d399';
        ctx.fillRect(barX, barY, barW * (alien.hp / alien.maxHp), barH);
      }

      ctx.restore();
    }

    // 8. Draw Camera Follow Mode Indicator
    if (config.followShip && ship && ship.active) {
      cameraRef.current.offsetX = width / 2 - ship.x * zoom;
      cameraRef.current.offsetY = height / 2 - ship.y * zoom;
    } else if (config.followBodyId) {
      const fb = bodies.find(b => b.id === config.followBodyId);
      if (fb) {
        cameraRef.current.offsetX = width / 2 - fb.x * zoom;
        cameraRef.current.offsetY = height / 2 - fb.y * zoom;
      }
    }

    // 8. Draw Launcher Vector (Drag & Shoot preview)
    if (launchStart && launchCurrent && launchPreset) {
      const scrStart = simToScreen(launchStart.x, launchStart.y);
      const scrCurrent = simToScreen(launchCurrent.x, launchCurrent.y);

      ctx.save();
      // Draw preview of launching body
      const previewRad = Math.max(1.5, launchPreset.radius * zoom);
      ctx.fillStyle = launchPreset.color + '55';
      ctx.beginPath();
      ctx.arc(scrStart.x, scrStart.y, previewRad, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = launchPreset.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(scrStart.x, scrStart.y, previewRad, 0, Math.PI * 2);
      ctx.stroke();

      // Draw vector path (line from launch start to current mouse)
      ctx.strokeStyle = '#00f2fe';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(scrStart.x, scrStart.y);
      ctx.lineTo(scrCurrent.x, scrCurrent.y);
      ctx.stroke();

      // Draw arrowhead at end
      const angle = Math.atan2(scrCurrent.y - scrStart.y, scrCurrent.x - scrStart.x);
      ctx.fillStyle = '#00f2fe';
      ctx.beginPath();
      ctx.moveTo(scrCurrent.x, scrCurrent.y);
      ctx.lineTo(
        scrCurrent.x - 12 * Math.cos(angle - Math.PI / 6),
        scrCurrent.y - 12 * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        scrCurrent.x - 12 * Math.cos(angle + Math.PI / 6),
        scrCurrent.y - 12 * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fill();

      // Text showing speed preview
      const dx = launchCurrent.x - launchStart.x;
      const dy = launchCurrent.y - launchStart.y;
      const velocityMagnitude = Math.sqrt(dx * dx + dy * dy) * 0.04;
      ctx.fillStyle = '#ffffff';
      ctx.font = "12px 'Inter', sans-serif";
      ctx.fillText(
        `V: ${velocityMagnitude.toFixed(2)} u/s`,
        scrStart.x,
        scrStart.y + previewRad + 20
      );

      ctx.restore();
    }
  };

  // Wire tick simulation trigger to draw canvas
  useEffect(() => {
    onSimulationTick(draw);
  }, [onSimulationTick, config]);

  return (
    <div 
      ref={containerRef} 
      className="canvas-container"
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', cursor: launchPreset ? 'crosshair' : 'default' }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
        style={{ display: 'block' }}
      />
    </div>
  );
};
