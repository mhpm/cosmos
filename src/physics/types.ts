export interface Point {
  x: number;
  y: number;
}

export interface Body {
  id: string;
  name: string;
  mass: number;
  radius: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  color: string;
  trail: Point[];
  isStatic: boolean;
  isBlackHole?: boolean;
  crushed?: boolean;
  trailCounter?: number;
}

export type CollisionMode = 'merge' | 'bounce' | 'none';

export interface PhysicsConfig {
  G: number;
  timeScale: number;
  collisionMode: CollisionMode;
  trailsEnabled: boolean;
  gridEnabled: boolean;
  vectorsEnabled: boolean;
  forceVectorsEnabled: boolean;
  gridResolution: number;
  elasticity: number;
  followBodyId: string | null;
  cameraZoom: number;
  cameraOffsetX: number;
  cameraOffsetY: number;
  shipSpawned: boolean;
  followShip: boolean;
  gameStatus?: 'playing' | 'gameover';
  earthHp?: number;
  maxEarthHp?: number;
}

export interface Spaceship {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number; // in radians
  active: boolean;
  thrusting: boolean;
  braking: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  decay: number;
}

export interface Bullet {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  isEnemy: boolean;
  radius: number;
  color: string;
  lifeTime: number;
  isMissile?: boolean;
  isMine?: boolean;
}

export interface Satellite {
  id: string;
  parentId: string;
  orbitRadius: number;
  orbitSpeed: number; // in rad/s
  angle: number; // in rad
  type: 'decorative' | 'defensive';
  color: string;
  size: number;
  x: number;
  y: number;
  shootCooldown?: number;
}


export interface AlienShip {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  hp: number;
  maxHp: number;
  shootCooldown: number;
  shipType?: 'saucer' | 'scout' | 'cruiser' | 'bomber' | 'kamikaze';
  maxSpeed?: number;
}

export interface SimulationPreset {
  name: string;
  description: string;
  config: Partial<PhysicsConfig>;
  bodies: Omit<Body, 'trail' | 'ax' | 'ay'>[];
}
