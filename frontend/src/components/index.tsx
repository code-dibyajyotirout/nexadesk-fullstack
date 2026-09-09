import React, { useState, useEffect, type FC, type ReactNode } from 'react';
import type {
  NexaDeskProps,
  GestureState,
  WindowConfig,
  TrackerMetrics,
  SimulatorState,
} from '../types/index.js';
import { GESTURE_STATE, DEFAULT_APPS } from '../utils/index.js';
import {
  useWindowManager,
  useGestureDetector,
  useSpatialTracker,
  useHandSimulator,
} from '../hooks/index.js';

export interface NexaCursorProps {
  x: number;
  y: number;
  state: GestureState;
  fistProgress?: number;
}

export const NexaCursor: FC<NexaCursorProps> = ({
  x,
  y,
  state,
  fistProgress = 0,
}) => {
  const stateClass = `state-${state.toLowerCase().replace('_', '-')}`;
  return (
    <div
      id="aether-cursor"
      className={`touchless-pointer ${stateClass}`}
      style={{
        transform: `translate3d(${x}px, ${y}px, 0)`,
        pointerEvents: 'none',
      }}
    >
      <div className="cursor-glow" />
      <div className="cursor-core" />
      <div className="cursor-ring" />
      <svg className="countdown-svg" viewBox="0 0 36 36">
        <path
          className="countdown-bg"
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
        />
        <path
          className="countdown-progress"
          strokeDasharray={`${fistProgress}, 100`}
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
        />
      </svg>
      <div className="cursor-label">{state}</div>
    </div>
  );
};

export interface WebcamBubbleProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  isCameraReady: boolean;
  onToggleMinimize?: () => void;
}

export const WebcamBubble: FC<WebcamBubbleProps> = ({
  videoRef,
  canvasRef,
  onToggleMinimize,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div id="webcam-panel" className={`webcam-bubble ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="panel-header" id="webcam-header">
        <span className="panel-title">
          <span className="pulse-indicator" />
          NEXADESK TRACKER FEED
        </span>
        <div className="header-controls">
          <button
            id="toggle-feed-visibility"
            title="Toggle Camera Feed"
            aria-label="Toggle Camera Feed"
            onClick={() => {
              setIsCollapsed((prev) => !prev);
              if (onToggleMinimize) onToggleMinimize();
            }}
          >
            {isCollapsed ? '+' : '−'}
          </button>
        </div>
      </div>
      {!isCollapsed && (
        <div className="feed-container">
          <video
            ref={videoRef as React.RefObject<HTMLVideoElement>}
            id="webcam-stream"
            autoPlay
            playsInline
            muted
          />
          {canvasRef && (
            <canvas ref={canvasRef as React.RefObject<HTMLCanvasElement>} id="tracker-overlay" />
          )}
          <div id="hand-indicator-left" className="hand-tag">
            L
          </div>
          <div id="hand-indicator-right" className="hand-tag">
            R
          </div>
        </div>
      )}
    </div>
  );
};

export interface NexaTaskbarProps {
  isSpatialActive: boolean;
  gestureState: GestureState;
  metrics: TrackerMetrics;
  onToggleSpatial: () => void;
  onOpenApp: (appId: string) => void;
  activeAppIds?: string[];
}

export const NexaTaskbar: FC<NexaTaskbarProps> = ({
  isSpatialActive,
  gestureState,
  metrics,
  onToggleSpatial,
  onOpenApp,
}) => {
  const [time, setTime] = useState('00:00:00');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toTimeString().split(' ')[0]);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <footer id="aether-taskbar" className="system-dock">
      <div className="dock-left">
        <div className="os-logo">
          <span className="logo-accent">NEXADESK</span>
          <span className="logo-version">v1.0</span>
        </div>
        <div className="divider" />
        <button
          id="toggle-spatial-mode"
          className="spatial-mode-btn"
          title="Toggle Gesture Camera Tracking"
          onClick={onToggleSpatial}
        >
          <span className={`spatial-indicator ${isSpatialActive ? 'active' : ''}`} />
          <span className="spatial-label">
            SPATIAL MODE: <strong>{isSpatialActive ? 'ON' : 'OFF'}</strong>
          </span>
        </button>
        <div className="divider" />
        <div className="gesture-status-dock" id="status-gesture-badge">
          <span className="status-indicator" />
          <span className="status-label">{gestureState}</span>
        </div>
      </div>

      <div className="dock-apps">
        {Object.values(DEFAULT_APPS).map((app) => (
          <button
            key={app.id}
            className="app-launcher"
            data-app={app.id}
            title={app.title}
            onClick={() => onOpenApp(app.id)}
          >
            <span className="launcher-label">{app.launcherLabel}</span>
          </button>
        ))}
      </div>

      <div className="dock-right">
        <div className="performance-metrics" id="fps-counter">
          FPS: {metrics.fps}
        </div>
        <div className="divider" />
        <div className="system-time" id="system-time">
          {time}
        </div>
      </div>
    </footer>
  );
};

export interface NexaWindowProps {
  window: WindowConfig;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
  onToggleMinimize: (id: string) => void;
  onToggleMaximize: (id: string) => void;
  children?: ReactNode;
}

export const NexaWindow: FC<NexaWindowProps> = ({
  window: win,
  onFocus,
  onClose,
  onToggleMinimize,
  onToggleMaximize,
  children,
}) => {
  if (win.isMinimized) return null;

  const style: React.CSSProperties = win.isMaximized
    ? {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100vw',
        height: 'calc(100vh - 48px)',
        zIndex: win.zIndex,
      }
    : {
        position: 'absolute',
        left: `${win.geometry.x}px`,
        top: `${win.geometry.y}px`,
        width: `${win.geometry.width}px`,
        height: `${win.geometry.height}px`,
        zIndex: win.zIndex,
      };

  return (
    <div
      className="aether-window active-window"
      style={style}
      onClick={() => onFocus(win.id)}
    >
      <div className="window-header">
        <span className="window-title">{win.title}</span>
        <div className="window-controls">
          <button
            className="win-btn minimize"
            title="Minimize"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMinimize(win.id);
            }}
          >
            −
          </button>
          <button
            className="win-btn maximize"
            title="Maximize"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMaximize(win.id);
            }}
          >
            □
          </button>
          <button
            className="win-btn close"
            title="Close"
            onClick={(e) => {
              e.stopPropagation();
              onClose(win.id);
            }}
          >
            ×
          </button>
        </div>
      </div>
      <div className="window-content" style={{ padding: '16px', overflowY: 'auto' }}>
        {children || win.content || (
          <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontFamily: 'var(--font-mono)' }}>
            NexaDesk Application Workspace: {win.title}
          </div>
        )}
      </div>
    </div>
  );
};

export interface VirtualKeyboardProps {
  onKeyPress?: (char: string) => void;
  onClose?: () => void;
}

export const VirtualKeyboard: FC<VirtualKeyboardProps> = ({
  onKeyPress,
  onClose,
}) => {
  const rows = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.'],
  ];

  return (
    <div id="virtual-keyboard-panel" className="virtual-keyboard-container">
      {rows.map((row, i) => (
        <div key={i} className="keyboard-row">
          {row.map((char) => (
            <button
              key={char}
              className="kbd-key"
              data-char={char.toLowerCase()}
              onClick={() => onKeyPress && onKeyPress(char.toLowerCase())}
            >
              {char}
            </button>
          ))}
          {i === 0 && (
            <button
              className="kbd-key special"
              data-char="backspace"
              onClick={() => onKeyPress && onKeyPress('backspace')}
            >
              Backspace
            </button>
          )}
          {i === 1 && (
            <button
              className="kbd-key special"
              data-char="enter"
              onClick={() => onKeyPress && onKeyPress('enter')}
            >
              Enter
            </button>
          )}
        </div>
      ))}
      <div className="keyboard-row">
        <button
          className="kbd-key space"
          data-char=" "
          onClick={() => onKeyPress && onKeyPress(' ')}
        >
          Space
        </button>
        {onClose && (
          <button className="kbd-key special close-kbd" onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>
  );
};

export interface HandSimulatorWidgetProps {
  state: SimulatorState;
  onDisable: () => void;
}

export const HandSimulatorWidget: FC<HandSimulatorWidgetProps> = ({
  state,
  onDisable,
}) => {
  return (
    <div id="simulator-widget" className="simulator-helper-box">
      <div className="widget-header">
        <span>VIRTUAL HAND SIMULATOR</span>
      </div>
      <div className="widget-content">
        <p>Simulating hand tracking with mouse/keyboard:</p>
        <ul>
          <li><strong>Cursor</strong>: Move your mouse</li>
          <li><strong>Pinch/Click</strong>: Left click and hold</li>
          <li><strong>Fist/Close</strong>: Press and hold <kbd>Space</kbd> key</li>
          <li><strong>Two Hands/Resize</strong>: Hold <kbd>Shift</kbd> key + scroll wheel</li>
        </ul>
        <div className="sim-feedback-bars">
          <div>Pinch state: <span>{state.isPinching ? 'True' : 'False'}</span></div>
          <div>Fist State: <span>{state.isFist ? 'True' : 'False'}</span></div>
          <div>Distance: <span>{state.twoHandDistance}px</span></div>
        </div>
        <button className="fallback-btn mini-btn" onClick={onDisable}>
          Disable Simulator
        </button>
      </div>
    </div>
  );
};

export const NexaDesk: FC<NexaDeskProps> = ({
  className = '',
  style = {},
  initialApps = ['control-panel', 'paint'],
  spatialModeDefault = false,
  showTaskbar = true,
  showWebcamBubble = true,
  onGestureChange,
  onWindowOpen,
  onWindowClose,
  children,
}) => {
  const {
    windows,
    openWindow,
    closeWindow,
    focusWindow,
    toggleMinimize,
    toggleMaximize,
  } = useWindowManager(initialApps);

  const {
    gestureState,
    cursorPosition,
    fistProgress,
  } = useGestureDetector({ onGestureChange });

  const {
    videoRef,
    isSpatialActive,
    toggleSpatialMode,
    metrics,
  } = useSpatialTracker({ defaultEnabled: spatialModeDefault });

  const {
    simulatorState,
    toggleSimulator,
  } = useHandSimulator();

  const handleOpenApp = (appId: string) => {
    openWindow(appId);
    if (onWindowOpen) onWindowOpen(appId);
  };

  const handleCloseApp = (appId: string) => {
    closeWindow(appId);
    if (onWindowClose) onWindowClose(appId);
  };

  return (
    <div
      className={`nexadesk-root ${className}`}
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: '#030712',
        color: '#ffffff',
        ...style,
      }}
    >
      <canvas id="ambient-particles" />

      <main id="aether-desktop" className="desktop-area">
        <div className="grid-backdrop">
          <div className="grid-line horizontal animate-h1" />
          <div className="grid-line horizontal animate-h2" />
          <div className="grid-line vertical animate-v1" />
          <div className="grid-line vertical animate-v2" />
        </div>

        {windows.map((win) => (
          <NexaWindow
            key={win.id}
            window={win}
            onFocus={focusWindow}
            onClose={handleCloseApp}
            onToggleMinimize={toggleMinimize}
            onToggleMaximize={toggleMaximize}
          />
        ))}

        {children}
      </main>

      {isSpatialActive && (
        <NexaCursor
          x={cursorPosition.x}
          y={cursorPosition.y}
          state={gestureState}
          fistProgress={fistProgress}
        />
      )}

      {showWebcamBubble && (
        <WebcamBubble
          videoRef={videoRef}
          isCameraReady={metrics.isCameraReady}
        />
      )}

      {showTaskbar && (
        <NexaTaskbar
          isSpatialActive={isSpatialActive}
          gestureState={gestureState}
          metrics={metrics}
          onToggleSpatial={toggleSpatialMode}
          onOpenApp={handleOpenApp}
        />
      )}

      {simulatorState.enabled && (
        <HandSimulatorWidget
          state={simulatorState}
          onDisable={toggleSimulator}
        />
      )}
    </div>
  );
};

export const NexaDesktop = NexaDesk;
