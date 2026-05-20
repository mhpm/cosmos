import React, { useState } from 'react';
import type { PhysicsConfig, Spaceship } from '../physics/types';
import { PRESETS } from '../physics/presets';
import { Play, Pause, RotateCcw, Trash2, Plus, Orbit, HelpCircle, X, Rocket } from 'lucide-react';

interface ControlPanelProps {
  config: PhysicsConfig;
  setConfig: React.Dispatch<React.SetStateAction<PhysicsConfig>>;
  loadPreset: (key: string) => void;
  clearSimulation: () => void;
  launchPreset: { mass: number; radius: number; color: string; name: string } | null;
  setLaunchPreset: (preset: { mass: number; radius: number; color: string; name: string } | null) => void;
  ship: Spaceship | null;
  spawnShip: () => void;
  destroyShip: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  config,
  setConfig,
  loadPreset,
  clearSimulation,
  launchPreset,
  setLaunchPreset,
  ship,
  spawnShip,
  destroyShip,
}) => {
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>('solarSystem');
  const [showPresets, setShowPresets] = useState<boolean>(true);
  const [showVisuals, setShowVisuals] = useState<boolean>(true);
  const [showCreator, setShowCreator] = useState<boolean>(true);
  const [showInstructions, setShowInstructions] = useState<boolean>(true);
  const [showSpaceshipPanel, setShowSpaceshipPanel] = useState<boolean>(true);

  // Custom planet creator inputs
  const [customMass, setCustomMass] = useState<number>(10);
  const [customRadius, setCustomRadius] = useState<number>(8);
  const [customColor, setCustomColor] = useState<string>('#00f2fe');
  const [customName, setCustomName] = useState<string>('Planeta Nuevo');

  const presetCreatorOptions = [
    { name: 'Asteroide', mass: 0.2, radius: 3.5, color: '#8e9aaf' },
    { name: 'Tierra-like', mass: 3, radius: 7, color: '#4fa8ff' },
    { name: 'Júpiter-like', mass: 120, radius: 15, color: '#e9c46a' },
    { name: 'Estrella', mass: 15000, radius: 24, color: '#ffb900' },
    { name: 'Agujero Negro', mass: 75000, radius: 20, color: '#9d4edd' },
  ];

  const handleTogglePlay = () => {
    setConfig(prev => ({
      ...prev,
      timeScale: prev.timeScale === 0 ? 1.0 : 0
    }));
  };

  const handlePresetSelect = (key: string) => {
    setSelectedPresetKey(key);
    loadPreset(key);
  };

  const handleLaunchSelect = (name: string, mass: number, radius: number, color: string) => {
    setLaunchPreset({ name, mass, radius, color });
  };

  const handleActivateCustomCreator = () => {
    setLaunchPreset({
      name: customName || 'Planeta Nuevo',
      mass: customMass,
      radius: customRadius,
      color: customColor,
    });
  };

  const handleResetCamera = () => {
    setConfig(prev => ({
      ...prev,
      cameraZoom: 1.0,
      cameraOffsetX: window.innerWidth / 2,
      cameraOffsetY: window.innerHeight / 2,
      followBodyId: null
    }));
  };

  return (
    <div className="control-panel">
      {/* Simulation Playback & Gravity Section */}
      <div className="panel-section header-section">
        <h1 className="panel-title">Cosmos Gravity Sim</h1>
        <p className="panel-subtitle">N-Body Orbital Simulator</p>
      </div>

      {/* Basic Simulation Controls */}
      <div className="panel-section">
        <div className="controls-row flex-center">
          <button 
            className={`btn btn-icon ${config.timeScale > 0 ? 'btn-active' : 'btn-paused'}`}
            onClick={handleTogglePlay}
            title={config.timeScale > 0 ? 'Pausar' : 'Reanudar'}
          >
            {config.timeScale > 0 ? <Pause size={18} /> : <Play size={18} />}
          </button>
          
          <button 
            className="btn btn-icon" 
            onClick={() => loadPreset(selectedPresetKey)}
            title="Reiniciar Preset"
          >
            <RotateCcw size={18} />
          </button>

          <button 
            className="btn btn-icon btn-danger" 
            onClick={clearSimulation}
            title="Borrar Todo"
          >
            <Trash2 size={18} />
          </button>

          <button 
            className="btn btn-icon" 
            onClick={handleResetCamera}
            title="Centrar Cámara"
          >
            <Orbit size={18} />
          </button>
        </div>

        {/* Physics parameters */}
        <div className="control-group mt-4">
          <div className="control-label">
            <span>Constante de Gravedad (G)</span>
            <span className="value-badge">{config.G.toFixed(3)}</span>
          </div>
          <input 
            type="range" 
            min="0.001" 
            max="1.5" 
            step="0.001" 
            value={config.G}
            onChange={(e) => setConfig(prev => ({ ...prev, G: parseFloat(e.target.value) }))}
            className="slider"
          />
          <div className="slider-labels">
            <span>Débil</span>
            <span>Estándar (0.100)</span>
            <span>Fuerte</span>
          </div>
        </div>

        <div className="control-group mt-4">
          <div className="control-label">
            <span>Velocidad del Tiempo</span>
            <span className="value-badge">{config.timeScale.toFixed(2)}x</span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="3" 
            step="0.1" 
            value={config.timeScale}
            onChange={(e) => setConfig(prev => ({ ...prev, timeScale: parseFloat(e.target.value) }))}
            className="slider"
          />
          <div className="slider-labels">
            <span>Pausa</span>
            <span>Normal</span>
            <span>Rápida</span>
          </div>
        </div>
      </div>

      {/* Presets Section */}
      <div className="panel-section">
        <div 
          className="section-header" 
          onClick={() => setShowPresets(!showPresets)}
        >
          <span className="section-title">Escenarios de Inicio</span>
          <span className="toggle-indicator">{showPresets ? '▼' : '►'}</span>
        </div>
        
        {showPresets && (
          <div className="presets-list mt-2">
            {Object.keys(PRESETS).map(key => (
              <button
                key={key}
                className={`btn btn-preset ${selectedPresetKey === key ? 'preset-active' : ''}`}
                onClick={() => handlePresetSelect(key)}
              >
                <div className="preset-name">{PRESETS[key].name}</div>
                <div className="preset-desc">{PRESETS[key].description}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Physics Options & Visuals */}
      <div className="panel-section">
        <div 
          className="section-header" 
          onClick={() => setShowVisuals(!showVisuals)}
        >
          <span className="section-title">Visualización y Colisiones</span>
          <span className="toggle-indicator">{showVisuals ? '▼' : '►'}</span>
        </div>

        {showVisuals && (
          <div className="visuals-panel mt-2">
            <div className="checkbox-group">
              <label className="checkbox-label">
                <input 
                  type="checkbox" 
                  checked={config.gridEnabled} 
                  onChange={(e) => setConfig(prev => ({ ...prev, gridEnabled: e.target.checked }))}
                />
                <span className="checkbox-text">Malla Espacio-Tiempo</span>
              </label>
            </div>

            <div className="checkbox-group">
              <label className="checkbox-label">
                <input 
                  type="checkbox" 
                  checked={config.trailsEnabled} 
                  onChange={(e) => setConfig(prev => ({ ...prev, trailsEnabled: e.target.checked }))}
                />
                <span className="checkbox-text">Mostrar Órbitas de Planetas</span>
              </label>
            </div>

            <div className="checkbox-group">
              <label className="checkbox-label">
                <input 
                  type="checkbox" 
                  checked={config.vectorsEnabled} 
                  onChange={(e) => setConfig(prev => ({ ...prev, vectorsEnabled: e.target.checked }))}
                />
                <span className="checkbox-text">Vectores de Velocidad</span>
              </label>
            </div>

            <div className="checkbox-group">
              <label className="checkbox-label">
                <input 
                  type="checkbox" 
                  checked={config.forceVectorsEnabled} 
                  onChange={(e) => setConfig(prev => ({ ...prev, forceVectorsEnabled: e.target.checked }))}
                />
                <span className="checkbox-text">Vectores de Atracción (Gravedad)</span>
              </label>
            </div>

            {/* Collision mode selector */}
            <div className="control-group mt-3">
              <div className="control-label">
                <span>Modo de Colisión</span>
              </div>
              <div className="tabs-row">
                <button
                  className={`tab-btn ${config.collisionMode === 'merge' ? 'tab-active' : ''}`}
                  onClick={() => setConfig(prev => ({ ...prev, collisionMode: 'merge' }))}
                >
                  Fusión
                </button>
                <button
                  className={`tab-btn ${config.collisionMode === 'bounce' ? 'tab-active' : ''}`}
                  onClick={() => setConfig(prev => ({ ...prev, collisionMode: 'bounce' }))}
                >
                  Rebote
                </button>
                <button
                  className={`tab-btn ${config.collisionMode === 'none' ? 'tab-active' : ''}`}
                  onClick={() => setConfig(prev => ({ ...prev, collisionMode: 'none' }))}
                >
                  Ninguno
                </button>
              </div>
            </div>

            {config.collisionMode === 'bounce' && (
              <div className="control-group mt-3">
                <div className="control-label">
                  <span>Elasticidad del Rebote</span>
                  <span className="value-badge">{config.elasticity.toFixed(2)}</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="1.0" 
                  step="0.05" 
                  value={config.elasticity}
                  onChange={(e) => setConfig(prev => ({ ...prev, elasticity: parseFloat(e.target.value) }))}
                  className="slider"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Launch Creator */}
      <div className="panel-section">
        <div 
          className="section-header" 
          onClick={() => setShowCreator(!showCreator)}
        >
          <span className="section-title">Crear Nuevo Cuerpo</span>
          <span className="toggle-indicator">{showCreator ? '▼' : '►'}</span>
        </div>

        {showCreator && (
          <div className="creator-panel mt-2">
            <p className="section-instructions mb-2">
              Selecciona una plantilla o diseña uno personalizado y luego **haz clic y arrastra en el espacio** para colocarlo e impulsarlo.
            </p>

            <div className="quick-presets">
              {presetCreatorOptions.map((opt) => (
                <button
                  key={opt.name}
                  className={`btn btn-quick-spawn ${launchPreset?.name === opt.name ? 'spawn-active' : ''}`}
                  onClick={() => handleLaunchSelect(opt.name, opt.mass, opt.radius, opt.color)}
                  style={{ borderLeft: `4px solid ${opt.color}` }}
                >
                  {opt.name}
                </button>
              ))}
            </div>

            <div className="custom-creator-form mt-3 border-top-glow pt-3">
              <span className="form-title">Cuerpo Personalizado</span>
              
              <div className="form-group mt-2">
                <label>Nombre</label>
                <input 
                  type="text" 
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-row mt-2">
                <div className="form-group flex-1">
                  <label>Masa: {customMass.toLocaleString()}</label>
                  <input 
                    type="range" 
                    min="0.1" 
                    max="50000" 
                    step="5" 
                    value={customMass}
                    onChange={(e) => {
                      const m = parseFloat(e.target.value);
                      setCustomMass(m);
                      // Auto-scale radius a bit for convenience
                      setCustomRadius(Math.max(2, Math.round(Math.pow(m, 1/3) * 1.8)));
                    }}
                    className="slider slider-mini"
                  />
                </div>
                <div className="form-group flex-1">
                  <label>Radio: {customRadius}px</label>
                  <input 
                    type="range" 
                    min="1" 
                    max="50" 
                    step="0.5" 
                    value={customRadius}
                    onChange={(e) => setCustomRadius(parseFloat(e.target.value))}
                    className="slider slider-mini"
                  />
                </div>
              </div>

              <div className="form-group mt-2">
                <label>Color del Cuerpo</label>
                <div className="color-selectors mt-1">
                  {['#4fa8ff', '#ff5a5a', '#54f2a7', '#ffdb58', '#d671ff', '#e58e26'].map(col => (
                    <button
                      key={col}
                      className={`color-btn ${customColor === col ? 'color-active' : ''}`}
                      style={{ backgroundColor: col }}
                      onClick={() => setCustomColor(col)}
                    />
                  ))}
                  <input 
                    type="color" 
                    value={customColor} 
                    onChange={(e) => setCustomColor(e.target.value)}
                    className="color-picker-input"
                  />
                </div>
              </div>

              <button
                className={`btn btn-primary btn-full mt-3 ${launchPreset?.name === customName ? 'btn-glow-active' : ''}`}
                onClick={handleActivateCustomCreator}
              >
                <Plus size={16} className="mr-1" />
                Cargar Personalizado
              </button>
            </div>

            {launchPreset && (
              <div className="active-launch-status mt-3 flex-center">
                <span className="launch-tag" style={{ border: `1px solid ${launchPreset.color}`, color: launchPreset.color }}>
                  Listo para lanzar: {launchPreset.name}
                </span>
                <button 
                  className="btn btn-icon btn-small ml-2" 
                  onClick={() => setLaunchPreset(null)}
                  title="Cancelar Lanzamiento"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Nave Espacial Controles */}
      <div className="panel-section border-top-glow">
        <div 
          className="section-header" 
          onClick={() => setShowSpaceshipPanel(!showSpaceshipPanel)}
        >
          <span className="section-title flex-center gap-1">
            <Rocket size={15} /> Pilotar Nave Espacial
          </span>
          <span className="toggle-indicator">{showSpaceshipPanel ? '▼' : '►'}</span>
        </div>

        {showSpaceshipPanel && (
          <div className="spaceship-panel mt-2">
            {!ship ? (
              <button className="btn btn-primary btn-full flex-center" onClick={spawnShip}>
                <Rocket size={15} className="mr-1" /> Desplegar Nave
              </button>
            ) : (
              <div className="ship-status-box border-glow p-2 rounded">
                <div className="flex-between">
                  <span className="ship-status-title flex-center gap-1">
                    <Rocket size={14} className={ship.active ? "text-cyan animate-pulse-glow" : "text-danger"} />
                    Estado: <strong className={ship.active ? "text-success" : "text-danger"}>
                      {ship.active ? "Vuelo" : "Destruida"}
                    </strong>
                  </span>
                  <button className="btn btn-danger btn-small" onClick={destroyShip}>
                    Desactivar
                  </button>
                </div>

                {ship.active ? (
                  <div className="ship-telemetry mt-2 text-xs">
                    <div className="flex-between">
                      <span>Velocidad:</span>
                      <span className="value-badge">
                        {Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy).toFixed(1)} u/s
                      </span>
                    </div>
                    <div className="flex-between mt-1">
                      <span>Rumbo:</span>
                      <span className="value-badge">
                        {((ship.angle * 180) / Math.PI).toFixed(0)}°
                      </span>
                    </div>
                    
                    <div className="checkbox-group mt-3 border-top-glow pt-2">
                      <label className="checkbox-label">
                        <input 
                          type="checkbox" 
                          checked={config.followShip} 
                          onChange={(e) => setConfig(prev => ({ 
                            ...prev, 
                            followShip: e.target.checked,
                            followBodyId: e.target.checked ? null : prev.followBodyId 
                          }))}
                        />
                        <span className="checkbox-text">Seguir Nave con Cámara</span>
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="ship-collision-alert mt-2">
                    <div className="alert-text text-danger text-xs mb-2">
                      ¡La nave colisionó y explotó en el espacio!
                    </div>
                    <button className="btn btn-primary btn-full flex-center" onClick={spawnShip}>
                      <RotateCcw size={14} className="mr-1" /> Re-desplegar Nave
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="pilot-guide mt-2 text-xs">
              <span className="guide-subtitle">Controles de Vuelo:</span>
              <div className="keys-grid mt-1">
                <div className="key-item flex-between"><span className="key-badge">W / ▲</span><span>Acelerar</span></div>
                <div className="key-item flex-between"><span className="key-badge">A / ◄</span><span>Girar Izq</span></div>
                <div className="key-item flex-between"><span className="key-badge">D / ►</span><span>Girar Der</span></div>
                <div className="key-item flex-between"><span className="key-badge">S / ▼</span><span>Frenar</span></div>
                <div className="key-item flex-between"><span className="key-badge">ESPACIO</span><span className="text-cyan font-bold">DISPARAR LÁSER</span></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Defensa de la Tierra */}
      {config.earthHp !== undefined && (
        <div className="panel-section border-top-glow bg-tactical-alarm">
          <div className="section-header">
            <span className="section-title flex-center gap-1 text-danger font-bold">
              🛡️ DEFENSA DE LA TIERRA
            </span>
            <span className="hud-pulse-red animate-pulse">• EN COMBATE</span>
          </div>

          <div className="combat-status mt-2">
            <div className="flex-between">
              <span className="text-xs">Integridad del Planeta:</span>
              <strong className={`text-sm ${config.earthHp < 35 ? 'text-red animate-pulse-glow font-bold' : (config.earthHp < 65 ? 'text-yellow' : 'text-success')}`}>
                {config.earthHp}%
              </strong>
            </div>

            {/* Health bar visualization */}
            <div className="earth-hp-bar-container mt-1">
              <div 
                className={`earth-hp-bar ${config.earthHp < 35 ? 'bg-danger-glow' : (config.earthHp < 65 ? 'bg-warning-glow' : 'bg-success-glow')}`}
                style={{ width: `${config.earthHp}%` }}
              ></div>
            </div>

            <p className="text-xxs mt-2 text-muted uppercase tracking-wider text-center">
              {config.earthHp <= 0 ? 'La Tierra ha sido destruida' : '¡Derriba las naves enemigas antes de que nos pulvericen!'}
            </p>
          </div>
        </div>
      )}

      {/* Guide/Instructions */}
      <div className="panel-section border-top-glow">
        <div 
          className="section-header" 
          onClick={() => setShowInstructions(!showInstructions)}
        >
          <span className="section-title flex-center gap-1">
            <HelpCircle size={15} /> Guía de Uso
          </span>
          <span className="toggle-indicator">{showInstructions ? '▼' : '►'}</span>
        </div>

        {showInstructions && (
          <ul className="guide-list mt-2">
            <li><strong>Desplazarse:</strong> Clic izquierdo + arrastrar (en espacio vacío) o botón derecho.</li>
            <li><strong>Zoom:</strong> Rueda del ratón. Centra el foco sobre el cursor.</li>
            <li><strong>Inspeccionar:</strong> Haz clic en cualquier planeta para ver detalles e incluso bloquear la cámara en él.</li>
            <li><strong>Lanzar planetas:</strong> Con una plantilla seleccionada arriba, haz <em>clic izquierdo y arrastra</em> para darle un impulso de velocidad orbital inicial.</li>
          </ul>
        )}
      </div>
    </div>
  );
};
