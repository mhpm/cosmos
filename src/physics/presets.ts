import type { SimulationPreset } from './types';

// Helper to generate circular orbit velocity: v = sqrt(G * M / r)
function getCircularVelocity(x: number, y: number, cx: number, cy: number, G: number, centralMass: number, clockwise = true): { vx: number; vy: number } {
  const dx = x - cx;
  const dy = y - cy;
  const r = Math.sqrt(dx * dx + dy * dy);
  
  if (r === 0) return { vx: 0, vy: 0 };
  
  const vMag = Math.sqrt((G * centralMass) / r);
  
  // Tangent vector
  const tx = -dy / r;
  const ty = dx / r;
  
  const direction = clockwise ? 1 : -1;
  
  return {
    vx: tx * vMag * direction,
    vy: ty * vMag * direction
  };
}

export const PRESETS: Record<string, SimulationPreset> = {
  solarSystem: {
    name: 'Sistema Solar',
    description: 'El Sol y los 8 planetas a escala visual. Las órbitas son estables y siguen las leyes de Kepler.',
    config: {
      G: 0.1,
      timeScale: 1.0,
      collisionMode: 'merge',
      trailsEnabled: true,
      gridEnabled: true,
    },
    bodies: [
      {
        id: 'sun',
        name: 'Sol',
        mass: 30000,
        radius: 32,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        color: '#ffb900',
        isStatic: true
      },
      {
        id: 'mercury',
        name: 'Mercurio',
        mass: 0.2,
        radius: 4,
        x: 70,
        y: 0,
        vx: 0,
        vy: getCircularVelocity(70, 0, 0, 0, 0.1, 30000).vy,
        color: '#a1a1a6',
        isStatic: false
      },
      {
        id: 'venus',
        name: 'Venus',
        mass: 1.5,
        radius: 6.5,
        x: 110,
        y: 0,
        vx: 0,
        vy: getCircularVelocity(110, 0, 0, 0, 0.1, 30000).vy,
        color: '#e29b5c',
        isStatic: false
      },
      {
        id: 'earth',
        name: 'Tierra',
        mass: 3.0,
        radius: 7.0,
        x: 160,
        y: 0,
        vx: 0,
        vy: getCircularVelocity(160, 0, 0, 0, 0.1, 30000).vy,
        color: '#4fa8ff',
        isStatic: false
      },
      {
        id: 'mars',
        name: 'Marte',
        mass: 0.5,
        radius: 5.2,
        x: 210,
        y: 0,
        vx: 0,
        vy: getCircularVelocity(210, 0, 0, 0, 0.1, 30000).vy,
        color: '#e55a3c',
        isStatic: false
      },
      {
        id: 'jupiter',
        name: 'Júpiter',
        mass: 60,
        radius: 16.0,
        x: 290,
        y: 0,
        vx: 0,
        vy: getCircularVelocity(290, 0, 0, 0, 0.1, 30000).vy,
        color: '#d4a373',
        isStatic: false
      },
      {
        id: 'saturn',
        name: 'Saturno',
        mass: 25,
        radius: 13.0,
        x: 380,
        y: 0,
        vx: 0,
        vy: getCircularVelocity(380, 0, 0, 0, 0.1, 30000).vy,
        color: '#e9c46a',
        isStatic: false
      },
      {
        id: 'uranus',
        name: 'Urano',
        mass: 10,
        radius: 10.0,
        x: 470,
        y: 0,
        vx: 0,
        vy: getCircularVelocity(470, 0, 0, 0, 0.1, 30000).vy,
        color: '#a8dadc',
        isStatic: false
      },
      {
        id: 'neptune',
        name: 'Neptuno',
        mass: 12,
        radius: 9.5,
        x: 560,
        y: 0,
        vx: 0,
        vy: getCircularVelocity(560, 0, 0, 0, 0.1, 30000).vy,
        color: '#457b9d',
        isStatic: false
      },
      {
        id: 'pluto',
        name: 'Plutón',
        mass: 0.05,
        radius: 3.0,
        x: 640,
        y: 0,
        vx: 0,
        vy: getCircularVelocity(640, 0, 0, 0, 0.1, 30000).vy,
        color: '#b08d75',
        isStatic: false
      }
    ]
  },
  binaryStar: {
    name: 'Estrella Binaria',
    description: 'Dos soles de igual masa orbitando su centro de masa común, con planetas intentando sobrevivir en órbitas caóticas.',
    config: {
      G: 0.1,
      timeScale: 1.0,
      collisionMode: 'merge',
      trailsEnabled: true,
      gridEnabled: true,
    },
    bodies: [
      {
        id: 'star-a',
        name: 'Sol Alpha',
        mass: 15000,
        radius: 20,
        x: -90,
        y: 0,
        vx: 0,
        vy: -2.05, // Speed to orbit center of mass (distance 180 total)
        color: '#ff4d4d',
        isStatic: false
      },
      {
        id: 'star-b',
        name: 'Sol Beta',
        mass: 15000,
        radius: 20,
        x: 90,
        y: 0,
        vx: 0,
        vy: 2.05,
        color: '#ffa64d',
        isStatic: false
      },
      {
        id: 'planet-1',
        name: 'Planeta S-Tipo',
        mass: 1,
        radius: 5,
        x: 230,
        y: 0,
        vx: 0,
        vy: 3.5, // Orbiting the combined system from a distance
        color: '#00f2fe',
        isStatic: false
      },
      {
        id: 'planet-2',
        name: 'Tatooine',
        mass: 0.5,
        radius: 4.5,
        x: -280,
        y: 0,
        vx: 0,
        vy: -3.0,
        color: '#ecc94b',
        isStatic: false
      }
    ]
  },
  figureEight: {
    name: 'Tres Cuerpos (Figura 8)',
    description: 'Tres estrellas de igual masa danzando en una órbita coreografiada hiper-estable con forma de 8 infinito.',
    config: {
      G: 1.0, // High G for the mathematical formula stability
      timeScale: 0.6,
      collisionMode: 'bounce',
      trailsEnabled: true,
      gridEnabled: true,
    },
    bodies: [
      // Standard scaled values for figure-8 orbit in N-body gravity
      // m1 = m2 = m3 = 20000, G = 1
      {
        id: 'body-1',
        name: 'Estrella Azul',
        mass: 20000,
        radius: 12,
        x: -220.16,
        y: 55.18,
        vx: 4.67,
        vy: 4.32,
        color: '#00d2ff',
        isStatic: false
      },
      {
        id: 'body-2',
        name: 'Estrella Verde',
        mass: 20000,
        radius: 12,
        x: 220.16,
        y: -55.18,
        vx: 4.67,
        vy: 4.32,
        color: '#00ff87',
        isStatic: false
      },
      {
        id: 'body-3',
        name: 'Estrella Roja',
        mass: 20000,
        radius: 12,
        x: 0,
        y: 0,
        vx: -9.34,
        vy: -8.64,
        color: '#ff007f',
        isStatic: false
      }
    ]
  },
  accretionDisk: {
    name: 'Disco de Acreción',
    description: 'Una joven estrella central rodeada por 45 asteroides en órbita. Míralos chocar y fusionarse para formar planetas.',
    config: {
      G: 0.1,
      timeScale: 1.5,
      collisionMode: 'merge',
      trailsEnabled: true,
      gridEnabled: false, // Turn off grid by default for performance with 40+ bodies
    },
    bodies: (() => {
      const centralMass = 40000;
      const list = [
        {
          id: 'proto-sun',
          name: 'Protoestrella',
          mass: centralMass,
          radius: 28,
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          color: '#ff7700',
          isStatic: true
        }
      ];

      // Spawn 45 small bodies
      for (let i = 0; i < 45; i++) {
        // Random distance from 80 to 450
        const r = 80 + Math.random() * 320;
        // Random angle
        const theta = Math.random() * Math.PI * 2;
        const x = Math.cos(theta) * r;
        const y = Math.sin(theta) * r;
        
        // Circular orbit velocity
        const v = getCircularVelocity(x, y, 0, 0, 0.1, centralMass, true);
        
        // Add minor disturbance for elliptical variety
        const disturbance = 0.92 + Math.random() * 0.16;
        const vx = v.vx * disturbance;
        const vy = v.vy * disturbance;

        // Mass and radius
        const mass = 0.05 + Math.random() * 1.5;
        const radius = Math.max(2, Math.pow(mass, 1/3) * 3);

        // Color based on distance
        let color = '#4fa8ff'; // default ice
        if (r < 150) color = '#ff7b54'; // rock/fire
        else if (r < 280) color = '#ffd369'; // gas/desert
        else color = '#93ffd8'; // cyan ice

        list.push({
          id: `asteroid-${i}`,
          name: `Protoplaneta-${i + 1}`,
          mass,
          radius,
          x,
          y,
          vx,
          vy,
          color,
          isStatic: false
        });
      }

      return list;
    })()
  }
};
