import React, { useEffect, useState, useRef } from 'react';
import type { Body, PhysicsConfig } from '../physics/types';
import { Trash2, Shield, Eye, ShieldAlert, Check, Edit2 } from 'lucide-react';

interface PlanetInspectorProps {
  selectedBodyId: string;
  setSelectedBodyId: (id: string | null) => void;
  bodiesRef: React.MutableRefObject<Body[]>;
  config: PhysicsConfig;
  setConfig: React.Dispatch<React.SetStateAction<PhysicsConfig>>;
  onDeleteBody: (id: string) => void;
}

export const PlanetInspector: React.FC<PlanetInspectorProps> = ({
  selectedBodyId,
  setSelectedBodyId,
  bodiesRef,
  config,
  setConfig,
  onDeleteBody,
}) => {
  const [bodySnapshot, setBodySnapshot] = useState<Body | null>(null);
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const [editedName, setEditedName] = useState<string>('');
  
  // Ref to hold the latest body snapshot to prevent closure issues
  const selectedIdRef = useRef(selectedBodyId);
  selectedIdRef.current = selectedBodyId;

  // Poll body values from the ref at ~15fps (every 66ms) to show real-time physics numbers without React overhead
  useEffect(() => {
    const updateSnapshot = () => {
      const currentBodies = bodiesRef.current;
      const target = currentBodies.find(b => b.id === selectedIdRef.current);
      
      if (!target || target.crushed) {
        setBodySnapshot(null);
        setSelectedBodyId(null);
        return;
      }
      
      // Create a shallow copy to trigger React re-render of local component
      setBodySnapshot({ ...target });
    };

    updateSnapshot();
    const intervalId = setInterval(updateSnapshot, 66);
    return () => clearInterval(intervalId);
  }, [selectedBodyId, bodiesRef, setSelectedBodyId]);

  // Set up edited name when snapshot changes
  useEffect(() => {
    if (bodySnapshot && !isEditingName) {
      setEditedName(bodySnapshot.name);
    }
  }, [bodySnapshot?.name, isEditingName]);

  if (!bodySnapshot) return null;

  // Real-time calculated values
  const speed = Math.sqrt(bodySnapshot.vx * bodySnapshot.vx + bodySnapshot.vy * bodySnapshot.vy);
  const acceleration = Math.sqrt(bodySnapshot.ax * bodySnapshot.ax + bodySnapshot.ay * bodySnapshot.ay);

  // Find the heaviest body to calculate distance to star
  const bodies = bodiesRef.current;
  let heaviestBody: Body | null = null;
  for (let i = 0; i < bodies.length; i++) {
    if (bodies[i].id !== bodySnapshot.id && !bodies[i].crushed) {
      if (!heaviestBody || bodies[i].mass > heaviestBody.mass) {
        heaviestBody = bodies[i];
      }
    }
  }

  const distanceToStar = heaviestBody 
    ? Math.sqrt(Math.pow(bodySnapshot.x - heaviestBody.x, 2) + Math.pow(bodySnapshot.y - heaviestBody.y, 2))
    : 0;

  // Actions
  const handleNameSave = () => {
    const target = bodiesRef.current.find(b => b.id === selectedBodyId);
    if (target && editedName.trim()) {
      target.name = editedName.trim();
    }
    setIsEditingName(false);
  };

  const handleToggleStatic = () => {
    const target = bodiesRef.current.find(b => b.id === selectedBodyId);
    if (target) {
      target.isStatic = !target.isStatic;
      // If it becomes static, kill its velocity
      if (target.isStatic) {
        target.vx = 0;
        target.vy = 0;
      }
    }
  };

  const handleToggleFollow = () => {
    setConfig(prev => ({
      ...prev,
      followBodyId: prev.followBodyId === selectedBodyId ? null : selectedBodyId
    }));
  };

  const handleMassChange = (newMass: number) => {
    const target = bodiesRef.current.find(b => b.id === selectedBodyId);
    if (target && newMass > 0) {
      target.mass = newMass;
    }
  };

  const handleColorChange = (color: string) => {
    const target = bodiesRef.current.find(b => b.id === selectedBodyId);
    if (target) {
      target.color = color;
    }
  };

  const isFollowing = config.followBodyId === selectedBodyId;

  return (
    <div className="planet-inspector-card">
      <div className="inspector-header">
        <div className="color-indicator" style={{ backgroundColor: bodySnapshot.color }} />
        
        {isEditingName ? (
          <div className="name-edit-row">
            <input 
              type="text" 
              value={editedName} 
              onChange={(e) => setEditedName(e.target.value)}
              className="name-input"
              maxLength={20}
              autoFocus
            />
            <button className="btn-save-name" onClick={handleNameSave}>
              <Check size={14} />
            </button>
          </div>
        ) : (
          <div className="name-display-row">
            <h2 className="inspector-title">{bodySnapshot.name}</h2>
            <button className="btn-edit-name" onClick={() => setIsEditingName(true)}>
              <Edit2 size={12} />
            </button>
          </div>
        )}
        
        <button className="btn-close" onClick={() => setSelectedBodyId(null)}>×</button>
      </div>

      <div className="inspector-content">
        {/* Real-time stats */}
        <div className="stat-grid">
          <div className="stat-box">
            <span className="stat-label">Velocidad</span>
            <span className="stat-val text-cyan">{speed.toFixed(2)} u/s</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Aceleración</span>
            <span className="stat-val text-orange">{acceleration.toFixed(3)} u/s²</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Posición X</span>
            <span className="stat-val">{bodySnapshot.x.toFixed(0)}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Posición Y</span>
            <span className="stat-val">{bodySnapshot.y.toFixed(0)}</span>
          </div>
        </div>

        {heaviestBody && (
          <div className="orbit-info mt-2">
            <div className="info-row">
              <span>Distancia a {heaviestBody.name}:</span>
              <span className="text-glow">{distanceToStar.toFixed(1)} u</span>
            </div>
          </div>
        )}

        {/* Physics Modifiers */}
        <div className="inspector-controls mt-3">
          <div className="control-group">
            <div className="control-label">
              <span>Masa del Cuerpo</span>
              <span className="value-badge">{bodySnapshot.mass.toLocaleString()} kg</span>
            </div>
            <input 
              type="range" 
              min="0.1" 
              max={bodySnapshot.mass > 20000 ? "100000" : "15000"} 
              step="1" 
              value={bodySnapshot.mass}
              onChange={(e) => handleMassChange(parseFloat(e.target.value))}
              className="slider"
            />
          </div>

          <div className="control-group mt-3">
            <div className="control-label">
              <span>Color del Cuerpo</span>
            </div>
            <div className="color-selectors mt-1">
              {['#4fa8ff', '#ff5a5a', '#54f2a7', '#ffdb58', '#d671ff', '#e9c46a'].map(col => (
                <button
                  key={col}
                  className={`color-btn ${bodySnapshot.color === col ? 'color-active' : ''}`}
                  style={{ backgroundColor: col }}
                  onClick={() => handleColorChange(col)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="inspector-actions-row mt-4">
          <button 
            className={`btn btn-action-card ${bodySnapshot.isStatic ? 'action-active' : ''}`}
            onClick={handleToggleStatic}
            title={bodySnapshot.isStatic ? "Anclado (Inmune a gravedad)" : "Móvil (Afectado por gravedad)"}
          >
            {bodySnapshot.isStatic ? (
              <>
                <Shield size={14} className="mr-1" />
                Anclado
              </>
            ) : (
              <>
                <ShieldAlert size={14} className="mr-1" />
                Móvil
              </>
            )}
          </button>

          <button 
            className={`btn btn-action-card ${isFollowing ? 'action-active' : ''}`}
            onClick={handleToggleFollow}
            title="Seguir cuerpo con la cámara"
          >
            <Eye size={14} className="mr-1" />
            {isFollowing ? 'Siguiendo' : 'Seguir'}
          </button>

          <button 
            className="btn btn-action-card btn-danger"
            onClick={() => {
              onDeleteBody(bodySnapshot.id);
              setSelectedBodyId(null);
            }}
            title="Eliminar cuerpo de la simulación"
          >
            <Trash2 size={14} className="mr-1" />
            Destruir
          </button>
        </div>
      </div>
    </div>
  );
};
