import type { Body, PhysicsConfig, Spaceship } from './types';

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

  // 5. Collision checks with bodies
  let collided = false;
  let hitBodyName = '';
  const shipRadius = 4.5; // Visual size is 4.5px

  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (b.crushed) continue;

    const dx = b.x - x;
    const dy = b.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    // Check overlap
    if (dist < b.radius + shipRadius) {
      collided = true;
      hitBodyName = b.name;
      break;
    }
  }

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
