import type { Body } from '../physics/types';

/**
 * Renders a grid representing the warping of space-time due to gravity.
 * The grid lines bend towards massive bodies in simulation space.
 */
export function drawSpaceGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  bodies: Body[],
  zoom: number,
  offsetX: number,
  offsetY: number,
  gridSpacing = 40
) {
  // Save context
  ctx.save();
  ctx.strokeStyle = 'rgba(74, 144, 226, 0.15)'; // Soft blue grid color
  ctx.lineWidth = 1;

  // 1. Calculate the bounds of the screen in simulation space
  // screenX = simX * zoom + offsetX => simX = (screenX - offsetX) / zoom
  const minSimX = -offsetX / zoom;
  const maxSimX = (width - offsetX) / zoom;
  const minSimY = -offsetY / zoom;
  const maxSimY = (height - offsetY) / zoom;

  // Align grid lines to multiples of gridSpacing
  const startX = Math.floor(minSimX / gridSpacing) * gridSpacing - gridSpacing;
  const endX = Math.ceil(maxSimX / gridSpacing) * gridSpacing + gridSpacing;
  const startY = Math.floor(minSimY / gridSpacing) * gridSpacing - gridSpacing;
  const endY = Math.ceil(maxSimY / gridSpacing) * gridSpacing + gridSpacing;

  // Limit grid lines if zoom is too small (performance precaution)
  const lineCountX = (endX - startX) / gridSpacing;
  const lineCountY = (endY - startY) / gridSpacing;
  if (lineCountX > 150 || lineCountY > 150) {
    ctx.restore();
    return; // Don't draw if too dense (prevents lag)
  }

  // Factor to scale space-time deformation visually
  // If we have a massive sun, warp should be visible but not break the mesh
  const warpScale = 0.8;

  // Function to deform a single coordinate (in simulation space) based on planetary masses
  const getDeformedPoint = (sx: number, sy: number) => {
    let dxTotal = 0;
    let dyTotal = 0;

    for (let i = 0; i < bodies.length; i++) {
      const p = bodies[i];
      if (p.crushed) continue;

      const dx = p.x - sx;
      const dy = p.y - sy;
      const rSq = dx * dx + dy * dy;
      const r = Math.sqrt(rSq);

      if (r === 0) continue;

      // Einsteinian warp: deformation proportional to mass and inversely proportional to distance.
      // Softening using radius squared so the grid doesn't collapse to a singularity inside the planet.
      const softening = p.radius * p.radius * 2 + 100;
      
      // Deformation force
      const warpForce = (warpScale * p.mass) / (rSq + softening);
      
      // Limit warp to 90% of distance so grid lines don't cross and overlap uglily
      const displacement = Math.min(r * 0.9, warpForce);

      // Normal vector directions (towards the body)
      const nx = dx / r;
      const ny = dy / r;

      dxTotal += nx * displacement;
      dyTotal += ny * displacement;
    }

    // Return screen coordinates of deformed point
    const deformedX = sx + dxTotal;
    const deformedY = sy + dyTotal;

    return {
      x: deformedX * zoom + offsetX,
      y: deformedY * zoom + offsetY
    };
  };

  // Draw vertical grid lines (by keeping X constant and varying Y)
  for (let x = startX; x <= endX; x += gridSpacing) {
    ctx.beginPath();
    let first = true;
    
    // Draw each vertical line as a series of connected segments to show the curve
    const stepY = gridSpacing / 4;
    for (let y = startY; y <= endY; y += stepY) {
      const pt = getDeformedPoint(x, y);
      
      if (first) {
        ctx.moveTo(pt.x, pt.y);
        first = false;
      } else {
        ctx.lineTo(pt.x, pt.y);
      }
    }
    ctx.stroke();
  }

  // Draw horizontal grid lines (by keeping Y constant and varying X)
  for (let y = startY; y <= endY; y += gridSpacing) {
    ctx.beginPath();
    let first = true;
    
    const stepX = gridSpacing / 4;
    for (let x = startX; x <= endX; x += stepX) {
      const pt = getDeformedPoint(x, y);
      
      if (first) {
        ctx.moveTo(pt.x, pt.y);
        first = false;
      } else {
        ctx.lineTo(pt.x, pt.y);
      }
    }
    ctx.stroke();
  }

  ctx.restore();
}
