import type { Body, PhysicsConfig, Spaceship, Bullet, AlienShip, Satellite } from './types';

// Softening factor to prevent divide-by-zero or infinite forces at close distances
const SOFTENING = 15;

/**
 * Calculates the acceleration for all bodies in the system using N-body gravity.
 */
export function updateAccelerations(bodies: Body[], G: number) {
  // Reset accelerations
  for (let i = 0; i < bodies.length; i++) {
    bodies[i].ax = 0;
    bodies[i].ay = 0;
  }

  // Double loop for gravity calculation (Newton's Law of Gravitation)
  for (let i = 0; i < bodies.length; i++) {
    const p1 = bodies[i];
    if (p1.crushed) continue;

    for (let j = i + 1; j < bodies.length; j++) {
      const p2 = bodies[j];
      if (p2.crushed) continue;

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const distSq = dx * dx + dy * dy;
      const dist = Math.sqrt(distSq);

      if (dist === 0) continue;

      // Gravity force magnitude: F = G * m1 * m2 / (r^2 + softening^2)
      // We use softening to avoid mathematical singularity
      const distSoftened = Math.sqrt(distSq + SOFTENING * SOFTENING);
      const forceMag = (G * p1.mass * p2.mass) / (distSoftened * distSoftened * distSoftened);

      // Force vectors
      const fx = forceMag * dx;
      const fy = forceMag * dy;

      // Add to accelerations if not static: a = F / m
      if (!p1.isStatic) {
        p1.ax += fx / p1.mass;
        p1.ay += fy / p1.mass;
      }
      if (!p2.isStatic) {
        p2.ax -= fx / p2.mass;
        p2.ay -= fy / p2.mass;
      }
    }
  }
}

/**
 * Integrates equations of motion (Euler-Cromer) and updates positions/velocities.
 */
export function stepPhysics(bodies: Body[], config: PhysicsConfig, dt: number): Body[] {
  const { G, timeScale, collisionMode, elasticity, trailsEnabled } = config;
  const actualDt = dt * timeScale;

  if (actualDt <= 0) return bodies;

  // 1. Calculate accelerations
  updateAccelerations(bodies, G);

  // 2. Update velocities and positions (Euler-Cromer)
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (b.crushed) continue;

    if (!b.isStatic) {
      b.vx += b.ax * actualDt;
      b.vy += b.ay * actualDt;
      b.x += b.vx * actualDt;
      b.y += b.vy * actualDt;
    }

    // Update trail
    if (trailsEnabled) {
      b.trailCounter = (b.trailCounter || 0) + 1;
      if (b.trail.length === 0 || b.trailCounter % 4 === 0) {
        b.trail.push({ x: b.x, y: b.y });
      }
      // Keep trail length reasonable (1200 points represents 4800 frames of history)
      if (b.trail.length > 1200) {
        b.trail.shift();
      }
    } else {
      b.trail = [];
      b.trailCounter = 0;
    }
  }

  // 3. Resolve Collisions
  if (collisionMode !== 'none') {
    resolveCollisions(bodies, collisionMode, elasticity);
  }

  // Filter out crushed bodies
  return bodies.filter(b => !b.crushed);
}

/**
 * Resolves collisions between planetary bodies (either bouncing or merging).
 */
function resolveCollisions(bodies: Body[], mode: 'merge' | 'bounce', elasticity: number) {
  for (let i = 0; i < bodies.length; i++) {
    const b1 = bodies[i];
    if (b1.crushed) continue;

    for (let j = i + 1; j < bodies.length; j++) {
      const b2 = bodies[j];
      if (b2.crushed) continue;

      const dx = b2.x - b1.x;
      const dy = b2.y - b1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = b1.radius + b2.radius;

      if (dist < minDist) {
        if (mode === 'merge') {
          mergeBodies(b1, b2);
        } else if (mode === 'bounce') {
          bounceBodies(b1, b2, dx, dy, dist, minDist, elasticity);
        }
      }
    }
  }
}

/**
 * Merges two bodies into one (b1 absorbs b2).
 * Conservation of mass, volume (radius), and momentum is maintained.
 */
function mergeBodies(b1: Body, b2: Body) {
  // Let the heavier body swallow the lighter one
  const [heavy, light] = b1.mass >= b2.mass ? [b1, b2] : [b2, b1];

  // Conservation of momentum: v_new = (m1*v1 + m2*v2) / (m1 + m2)
  const totalMass = heavy.mass + light.mass;
  
  if (!heavy.isStatic) {
    heavy.vx = (heavy.vx * heavy.mass + light.vx * light.mass) / totalMass;
    heavy.vy = (heavy.vy * heavy.mass + light.vy * light.mass) / totalMass;
    
    // Weighted center of mass position update (slightly pull heavier body towards lighter body)
    heavy.x = (heavy.x * heavy.mass + light.x * light.mass) / totalMass;
    heavy.y = (heavy.y * heavy.mass + light.y * light.mass) / totalMass;
  }

  heavy.mass = totalMass;
  
  // Combine areas to get new radius: A = pi * r^2 => r_new = sqrt(r1^2 + r2^2)
  // Let's use 3D volume combination for more realistic mass-to-radius growth: r_new = (r1^3 + r2^3)^(1/3)
  heavy.radius = Math.pow(Math.pow(heavy.radius, 3) + Math.pow(light.radius, 3), 1/3);

  // If either was a black hole, the result is a black hole
  if (heavy.isBlackHole || light.isBlackHole) {
    heavy.isBlackHole = true;
  }

  // Mark the lighter body as crushed so it's deleted
  light.crushed = true;
}

/**
 * Resolves 2D elastic collision with overlap prevention.
 */
function bounceBodies(
  b1: Body,
  b2: Body,
  dx: number,
  dy: number,
  dist: number,
  minDist: number,
  elasticity: number
) {
  if (dist === 0) return;

  // 1. Separate the bodies so they don't overlap (overlap resolution)
  const overlap = minDist - dist;
  // Direction vector
  const nx = dx / dist;
  const ny = dy / dist;

  // Determine how much to move each body based on static status and mass ratio
  if (b1.isStatic && b2.isStatic) {
    // Both static, do nothing
    return;
  } else if (b1.isStatic) {
    b2.x += nx * overlap;
    b2.y += ny * overlap;
  } else if (b2.isStatic) {
    b1.x -= nx * overlap;
    b1.y -= ny * overlap;
  } else {
    // Both move proportional to the inverse of their mass
    const ratio1 = b2.mass / (b1.mass + b2.mass);
    const ratio2 = b1.mass / (b1.mass + b2.mass);
    
    b1.x -= nx * overlap * ratio1;
    b1.y -= ny * overlap * ratio1;
    b2.x += nx * overlap * ratio2;
    b2.y += ny * overlap * ratio2;
  }

  // 2. Resolve velocity change along normal (1D elastic collision resolution)
  // Relative velocity
  const rvx = b2.vx - b1.vx;
  const rvy = b2.vy - b1.vy;

  // Velocity along normal
  const velAlongNormal = rvx * nx + rvy * ny;

  // Do not resolve if velocities are separating
  if (velAlongNormal > 0) return;

  // Calculate impulse scalar
  const e = elasticity; // Coefficient of restitution: 0 is plastic (sticky), 1 is fully elastic
  
  let massInverseSum = 0;
  if (!b1.isStatic) massInverseSum += 1 / b1.mass;
  if (!b2.isStatic) massInverseSum += 1 / b2.mass;

  if (massInverseSum === 0) return;

  const impulseScalar = -(1 + e) * velAlongNormal / massInverseSum;

  // Apply impulse
  if (!b1.isStatic) {
    b1.vx -= (impulseScalar / b1.mass) * nx;
    b1.vy -= (impulseScalar / b1.mass) * ny;
  }
  if (!b2.isStatic) {
    b2.vx += (impulseScalar / b2.mass) * nx;
    b2.vy += (impulseScalar / b2.mass) * ny;
  }
}

/**
 * Simulates a step of the spaceship physics: gravity attraction from planets, keyboard thrust/brake, and planetary collision detection.
 */
export function stepSpaceship(
  ship: Spaceship,
  bodies: Body[],
  config: PhysicsConfig,
  keys: Record<string, boolean>,
  dt: number
): { ship: Spaceship; collided: boolean; hitBodyName: string } {
  const actualDt = dt * config.timeScale;
  
  if (actualDt <= 0 || !ship.active) {
    return { ship, collided: false, hitBodyName: '' };
  }

  // Rotation (responsive even when paused/slowed)
  const rotSpeed = 3.5; // radians per second
  
  // Normalize key checking
  const isThrusting = keys['w'] || keys['W'] || keys['ArrowUp'] || false;
  const isBraking = keys['s'] || keys['S'] || keys['ArrowDown'] || false;
  const isLeft = keys['a'] || keys['A'] || keys['ArrowLeft'] || false;
  const isRight = keys['d'] || keys['D'] || keys['ArrowRight'] || false;

  let finalAngle = ship.angle;
  if (isLeft) {
    finalAngle -= rotSpeed * dt;
  }
  if (isRight) {
    finalAngle += rotSpeed * dt;
  }
  finalAngle = (finalAngle + Math.PI * 2) % (Math.PI * 2);

  // 2. Accumulate Gravity Acceleration from planets
  let ax = 0;
  let ay = 0;

  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (b.crushed) continue;

    const dx = b.x - ship.x;
    const dy = b.y - ship.y;
    const distSq = dx * dx + dy * dy;
    const dist = Math.sqrt(distSq);

    if (dist === 0) continue;

    // Softened N-body gravity attraction on the ship
    const softening = 15;
    const distSoftened = Math.sqrt(distSq + softening * softening);
    const accMag = (config.G * b.mass) / (distSoftened * distSoftened * distSoftened);

    ax += accMag * dx;
    ay += accMag * dy;
  }

  // 3. Apply Thrust Acceleration
  const thrustForce = 220; // acceleration units
  if (isThrusting) {
    ax += Math.cos(finalAngle) * thrustForce;
    ay += Math.sin(finalAngle) * thrustForce;
  }
  
  // Apply Braking (retro damping)
  if (isBraking) {
    ax -= ship.vx * 3.0;
    ay -= ship.vy * 3.0;
  }

  // 4. Integrate velocity and position
  let vx = ship.vx + ax * actualDt;
  let vy = ship.vy + ay * actualDt;

  // Apply speed limit
  const speed = Math.sqrt(vx * vx + vy * vy);
  const maxSpeed = 450;
  if (speed > maxSpeed) {
    vx = (vx / speed) * maxSpeed;
    vy = (vy / speed) * maxSpeed;
  }

  const x = ship.x + vx * actualDt;
  const y = ship.y + vy * actualDt;

  const updatedShip: Spaceship = {
    ...ship,
    x,
    y,
    vx,
    vy,
    angle: finalAngle,
    thrusting: isThrusting,
    braking: isBraking,
  };

  // 5. Collision checks with bodies (Disabled by request so the ship can fly freely through stars and planets)
  let collided = false;
  let hitBodyName = '';

  if (collided) {
    updatedShip.active = false;
    updatedShip.thrusting = false;
    updatedShip.braking = false;
  }

  return {
    ship: updatedShip,
    collided,
    hitBodyName
  };
}

function getAlienSeed(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 100;
}

function pointInTriangle(px: number, py: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): boolean {
  const d1 = (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
  const d2 = (px - x3) * (y2 - y3) - (x2 - x3) * (py - y3);
  const d3 = (px - x1) * (y3 - y1) - (x3 - x1) * (py - y1);

  const has_neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const has_pos = (d1 > 0) || (d2 > 0) || (d3 > 0);

  return !(has_neg && has_pos);
}

/**
 * Steps the combat physics: moves bullets, updates alien ships, manages laser firing,
 * and handles damage checks and hits.
 */
export function stepCombat(
  bullets: Bullet[],
  alienShips: AlienShip[],
  bodies: Body[],
  config: PhysicsConfig,
  dt: number,
  onAlienDestroyed?: (shipId: string, x: number, y: number) => void
): {
  bullets: Bullet[];
  alienShips: AlienShip[];
  earthDamage: number;
} {
  const actualDt = dt * config.timeScale;
  if (actualDt <= 0) return { bullets, alienShips, earthDamage: 0 };

  const earth = bodies.find(b => b.id === 'earth');
  let earthDamage = 0;

  // 1. Move bullets and filter active ones
  const nextBullets: Bullet[] = [];
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    b.x += b.vx * actualDt;
    b.y += b.vy * actualDt;
    b.lifeTime -= actualDt;

    if (b.lifeTime > 0) {
      nextBullets.push(b);
    }
  }

  // 2. Move and step Alien Ships
  const nextAlienShips: AlienShip[] = [];
  const hitShipsSet = new Set<string>();

  for (let i = 0; i < alienShips.length; i++) {
    const alien = alienShips[i];
    
    // Decrease shoot cooldown
    if (alien.shootCooldown > 0) {
      alien.shootCooldown -= actualDt;
    }

    // Alien AI: Seek Earth or Sun if Earth is dead
    const target = earth || bodies.find(b => b.id === 'sun') || { x: 0, y: 0 };
    const dx = target.x - alien.x;
    const dy = target.y - alien.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Physical collision check with Earth
    if (earth && target === earth && dist < earth.radius + alien.radius) {
      hitShipsSet.add(alien.id);
      earthDamage += alien.shipType === 'kamikaze' ? 20 : 10;
      if (onAlienDestroyed) {
        onAlienDestroyed(alien.id, alien.x, alien.y);
      }
      continue; // Alien exploded on impact, skip moving/firing
    }

    // Kamikaze speed boost charging when close to Earth
    const isKamikaze = alien.shipType === 'kamikaze';
    const isCharging = isKamikaze && earth && dist < 300;

    // Apply thrust towards target
    let ax = 0;
    let ay = 0;
    if (dist > 0) {
      let seekAcceleration = 50; // units/s^2
      if (isCharging) {
        seekAcceleration = 180; // hyper acceleration suicide charge
      }
      ax = (dx / dist) * seekAcceleration;
      ay = (dy / dist) * seekAcceleration;
    }

    // Add gravity from Sun if sun exists (to make their flight orbits dynamic!)
    const sun = bodies.find(b => b.id === 'sun');
    if (sun) {
      const sDx = sun.x - alien.x;
      const sDy = sun.y - alien.y;
      const sDistSq = sDx * sDx + sDy * sDy;
      const sDist = Math.sqrt(sDistSq);
      if (sDist > 20) {
        const acc = (config.G * sun.mass) / (sDistSq + 225); // softened gravity
        ax += (sDx / sDist) * acc;
        ay += (sDy / sDist) * acc;
      }
    }

    // Euler step alien velocity
    alien.vx += ax * actualDt;
    alien.vy += ay * actualDt;

    // Cap velocity
    const speed = Math.sqrt(alien.vx * alien.vx + alien.vy * alien.vy);
    let maxSpeed = alien.maxSpeed || 35;
    if (isCharging) {
      maxSpeed = 90; // charge velocity limit
    }
    if (speed > maxSpeed) {
      alien.vx = (alien.vx / speed) * maxSpeed;
      alien.vy = (alien.vy / speed) * maxSpeed;
    }

    // Step position
    alien.x += alien.vx * actualDt;
    alien.y += alien.vy * actualDt;

    // Firing logic: if close to Earth, fire a bullet!
    if (earth && dist < 450 && alien.shootCooldown <= 0) {
      const tSec = performance.now() * 0.001;
      const seed = getAlienSeed(alien.id);
      const bobSimX = Math.cos(tSec * 0.35 + seed * 1.5) * (alien.radius * 0.08);
      const bobSimY = Math.sin(tSec * 0.45 + seed * 2.0) * (alien.radius * 0.08);
      const fireX = alien.x + bobSimX;
      const fireY = alien.y + bobSimY;

      const type = alien.shipType || 'saucer';

      if (type === 'scout') {
        // Scout: Fires two rapid parallel purple lasers from wingtips
        const angle = Math.atan2(dy, dx);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const perpX = -sin * (alien.radius * 1.0);
        const perpY = cos * (alien.radius * 1.0);

        const bulletSpeed = 210;
        const bVx = cos * bulletSpeed + alien.vx * 0.3;
        const bVy = sin * bulletSpeed + alien.vy * 0.3;

        nextBullets.push({
          id: `alien-bullet-${Math.random().toString(36).substr(2, 9)}`,
          x: fireX + perpX,
          y: fireY + perpY,
          vx: bVx,
          vy: bVy,
          isEnemy: true,
          radius: 2.2,
          color: '#c084fc', // purple
          lifeTime: 4.0,
        });

        nextBullets.push({
          id: `alien-bullet-${Math.random().toString(36).substr(2, 9)}`,
          x: fireX - perpX,
          y: fireY - perpY,
          vx: bVx,
          vy: bVy,
          isEnemy: true,
          radius: 2.2,
          color: '#c084fc', // purple
          lifeTime: 4.0,
        });

        alien.shootCooldown = 1.0 + Math.random() * 0.8; // fire faster: 1.0 - 1.8s
      } else if (type === 'cruiser') {
        // Cruiser: Heavy triple plasma burst spread
        const angle = Math.atan2(dy, dx);
        const spreadAngles = [-0.22, 0, 0.22]; // in radians
        const bulletSpeed = 145;

        spreadAngles.forEach((offsetAngle) => {
          const finalAngle = angle + offsetAngle;
          const bVx = Math.cos(finalAngle) * bulletSpeed + alien.vx * 0.3;
          const bVy = Math.sin(finalAngle) * bulletSpeed + alien.vy * 0.3;

          nextBullets.push({
            id: `alien-bullet-${Math.random().toString(36).substr(2, 9)}`,
            x: fireX,
            y: fireY,
            vx: bVx,
            vy: bVy,
            isEnemy: true,
            radius: 4.5,
            color: '#f97316', // orange
            lifeTime: 5.0,
          });
        });

        alien.shootCooldown = 3.2 + Math.random() * 1.5; // slow reload: 3.2 - 4.7s
      } else if (type === 'bomber') {
        // Bomber: Drops slow warning floating proximity mines behind itself
        const velocitySpeed = Math.sqrt(alien.vx * alien.vx + alien.vy * alien.vy);
        const backX = velocitySpeed > 0.1 ? -(alien.vx / velocitySpeed) * (alien.radius * 1.3) : 0;
        const backY = velocitySpeed > 0.1 ? -(alien.vy / velocitySpeed) * (alien.radius * 1.3) : 0;

        nextBullets.push({
          id: `alien-mine-${Math.random().toString(36).substr(2, 9)}`,
          x: alien.x + backX,
          y: alien.y + backY,
          vx: alien.vx * 0.1, // slow float
          vy: alien.vy * 0.1,
          isEnemy: true,
          radius: 6.5,
          color: '#eab308', // amber/yellow warning
          lifeTime: 12.0,
          isMine: true,
        });

        alien.shootCooldown = 3.5 + Math.random() * 2.0; // drops every 3.5 - 5.5s
      } else if (type === 'kamikaze') {
        // Kamikaze doesn't fire normal bullets
        alien.shootCooldown = 9999.0;
      } else {
        // Saucer: Standard single green laser shot
        const bulletSpeed = 160;
        const bVx = (dx / dist) * bulletSpeed + alien.vx * 0.3;
        const bVy = (dy / dist) * bulletSpeed + alien.vy * 0.3;

        nextBullets.push({
          id: `alien-bullet-${Math.random().toString(36).substr(2, 9)}`,
          x: fireX,
          y: fireY,
          vx: bVx,
          vy: bVy,
          isEnemy: true,
          radius: 3.5,
          color: '#10b981', // green enemy laser
          lifeTime: 4.5,
        });

        alien.shootCooldown = 2.0 + Math.random() * 1.5; // 2.0 - 3.5s
      }
    }

    nextAlienShips.push(alien);
  }

  // 3. Resolve Bullet Collisions
  const finalBullets: Bullet[] = [];
  const tSec = performance.now() * 0.001;

  for (let i = 0; i < nextBullets.length; i++) {
    const bullet = nextBullets[i];
    let bulletAbsorbed = false;

    // A. Check collision with physical celestial bodies (planets/stars) (Only for enemy bullets)
    if (bullet.isEnemy) {
      for (let j = 0; j < bodies.length; j++) {
        const planet = bodies[j];
        const pDx = planet.x - bullet.x;
        const pDy = planet.y - bullet.y;
        const pDist = Math.sqrt(pDx * pDx + pDy * pDy);

        // Hit planet!
        if (pDist < planet.radius + bullet.radius) {
          bulletAbsorbed = true;
          
          // If it's an enemy bullet hitting Earth specifically, accumulate Earth damage
          if (planet.id === 'earth') {
            if (bullet.isMine) {
              earthDamage += 15; // 15 damage for mines
            } else if (bullet.radius > 4.0) {
              earthDamage += 5; // 5 damage for heavy cruiser plasma
            } else {
              earthDamage += 2; // 2 damage for standard shots
            }
          }
          break;
        }
      }
    }

    if (bulletAbsorbed) continue;

    // B. Check collision with Alien Ships (if player bullet)
    if (!bullet.isEnemy) {
      for (let j = 0; j < nextAlienShips.length; j++) {
        const alien = nextAlienShips[j];
        if (hitShipsSet.has(alien.id)) continue;

        const seed = getAlienSeed(alien.id);
        const bobSimX = Math.cos(tSec * 0.35 + seed * 1.5) * (alien.radius * 0.08);
        const bobSimY = Math.sin(tSec * 0.45 + seed * 2.0) * (alien.radius * 0.08);

        const cx = alien.x + bobSimX;
        const cy = alien.y + bobSimY;

        // Compute same finalRotation as drawing code (wobble + velocity-based angle)
        const wobble = Math.sin(tSec * 0.6 + seed) * 0.03;
        const speed = Math.sqrt(alien.vx * alien.vx + alien.vy * alien.vy);
        const velAngle = speed > 0.01 ? Math.atan2(alien.vy, alien.vx) : -Math.PI / 2;
        const finalRotation = velAngle + Math.PI / 2 + wobble;

        // Transform bullet position to alien local unrotated space
        const dx = bullet.x - cx;
        const dy = bullet.y - cy;
        const cos = Math.cos(-finalRotation);
        const sin = Math.sin(-finalRotation);
        const localX = dx * cos - dy * sin;
        const localY = dx * sin + dy * cos;

        const type = alien.shipType || 'saucer';
        let isHit = false;

        const zoom = config.cameraZoom || 1.0;
        const r = Math.max(alien.radius, 5.5 / zoom);
        const br = Math.max(bullet.radius, 1.5 / zoom);

        if (type === 'scout') {
          // Scout shape: delta wing (represented by two triangles meeting at the center line)
          // Nose: (0, -1.5 * r)
          // Left Wingtip: (-1.35 * r, 0.85 * r)
          // Right Wingtip: (1.35 * r, 0.85 * r)
          // Center Tail: (0, 0.3 * r)
          const x1 = 0;
          const y1 = -1.5 * r - br;
          const xTail = 0;
          const yTail = 0.3 * r + br;
          const xLeft = -1.35 * r - br;
          const yLeft = 0.85 * r + br;
          const xRight = 1.35 * r + br;
          const yRight = 0.85 * r + br;

          isHit = pointInTriangle(localX, localY, x1, y1, xLeft, yLeft, xTail, yTail) ||
                  pointInTriangle(localX, localY, x1, y1, xRight, yRight, xTail, yTail);
        } else if (type === 'cruiser') {
          // Cruiser shape: ellipse centered at localY = -0.55 * r
          // width a = 1.7 * r
          // height b = 0.95 * r
          const centerY = -0.55 * r;
          const a = 1.7 * r + br;
          const b = 0.95 * r + br;
          const normX = localX / a;
          const normY = (localY - centerY) / b;
          isHit = (normX * normX + normY * normY) <= 1.0;
        } else if (type === 'bomber') {
          // Bomber shape: bulky ellipse
          const a = 1.6 * r + br;
          const b = 1.4 * r + br;
          const normX = localX / a;
          const normY = localY / b;
          isHit = (normX * normX + normY * normY) <= 1.0;
        } else if (type === 'kamikaze') {
          // Kamikaze shape: delta spike / triangle pointing up
          // Nose at (0, -1.6 * r)
          // Left wingtip at (-1.2 * r, 0.9 * r)
          // Right wingtip at (1.2 * r, 0.9 * r)
          const x1 = 0;
          const y1 = -1.6 * r - br;
          const xLeft = -1.2 * r - br;
          const yLeft = 0.9 * r + br;
          const xRight = 1.2 * r + br;
          const yRight = 0.9 * r + br;
          isHit = pointInTriangle(localX, localY, x1, y1, xLeft, yLeft, xRight, yRight);
        } else {
          // Saucer shape: ellipse
          // width a = 1.55 * r
          // height b = 0.65 * r
          const a = 1.55 * r + br;
          const b = 0.65 * r + br;
          const normX = localX / a;
          const normY = localY / b;
          isHit = (normX * normX + normY * normY) <= 1.0;
        }

        // Hit alien ship!
        if (isHit) {
          const damage = bullet.isMissile ? 55 : 10; // Defensive space probe missile deals massive damage
          alien.hp -= damage;
          bulletAbsorbed = true;

          if (alien.hp <= 0) {
            hitShipsSet.add(alien.id);
            if (onAlienDestroyed) {
              onAlienDestroyed(alien.id, alien.x, alien.y);
            }
          }
          break;
        }
      }
    }

    if (!bulletAbsorbed) {
      finalBullets.push(bullet);
    }
  }

  // Filter out destroyed alien ships
  const finalAlienShips = nextAlienShips.filter(alien => !hitShipsSet.has(alien.id));

  return {
    bullets: finalBullets,
    alienShips: finalAlienShips,
    earthDamage,
  };
}

/**
 * Steps the orbital position of decorative and defensive satellites,
 * and handles the automatic targeting and firing logic of the Earth defensive space probe.
 */
export function stepSatellites(
  satellites: Satellite[],
  bodies: Body[],
  alienShips: AlienShip[],
  bullets: Bullet[],
  config: PhysicsConfig,
  dt: number,
  onMissileFired?: () => void
): {
  satellites: Satellite[];
  bullets: Bullet[];
} {
  const actualDt = dt * config.timeScale;
  if (actualDt <= 0) return { satellites, bullets };

  const nextSatellites: Satellite[] = [];
  const nextBullets = [...bullets];

  for (let i = 0; i < satellites.length; i++) {
    const sat = satellites[i];

    // Find parent body
    const parent = bodies.find(b => b.id === sat.parentId);
    if (!parent || parent.crushed) {
      // If the parent planet was destroyed or absorbed, the satellite is destroyed/lost.
      continue;
    }

    // Update orbit angle
    sat.angle += sat.orbitSpeed * actualDt;
    sat.angle = (sat.angle + Math.PI * 2) % (Math.PI * 2);

    // Calculate simulation coordinates relative to parent planet
    sat.x = parent.x + Math.cos(sat.angle) * sat.orbitRadius;
    sat.y = parent.y + Math.sin(sat.angle) * sat.orbitRadius;

    // Firing logic for defensive satellite
    if (sat.type === 'defensive') {
      if (sat.shootCooldown !== undefined && sat.shootCooldown > 0) {
        sat.shootCooldown -= actualDt;
      }

      if (sat.shootCooldown === undefined || sat.shootCooldown <= 0) {
        // Find the nearest alien ship
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

        // Fire missile at the nearest enemy (if there is one)
        if (nearestAlien) {
          const dx = nearestAlien.x - sat.x;
          const dy = nearestAlien.y - sat.y;
          const missileSpeed = 240; // High speed rocket projectile
          const vx = (dx / minDist) * missileSpeed + parent.vx * 0.5;
          const vy = (dy / minDist) * missileSpeed + parent.vy * 0.5;

          const newBullet: Bullet = {
            id: `defensive-missile-${Math.random().toString(36).substr(2, 9)}`,
            x: sat.x,
            y: sat.y,
            vx,
            vy,
            isEnemy: false, // Player-aligned
            radius: 3.5, // Plump projectile
            color: '#38bdf8', // Cyan/sky blue glow
            lifeTime: 4.5,
            isMissile: true, // Render as a missile
          };

          nextBullets.push(newBullet);
          sat.shootCooldown = 4.0; // Shoot every 4 seconds

          if (onMissileFired) {
            onMissileFired();
          }
        }
      }
    }

    nextSatellites.push(sat);
  }

  return {
    satellites: nextSatellites,
    bullets: nextBullets,
  };
}

