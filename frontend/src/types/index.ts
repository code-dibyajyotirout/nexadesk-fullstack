import type { ReactNode, CSSProperties } from 'react';

export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export type HandLandmarks = Landmark[];

export type GestureState =
  | 'IDLE'
  | 'HOVER'
  | 'CLICK'
  | 'DRAG'
  | 'RESIZE'
  | 'FIST_CLOSE';

export interface GestureDetectionResult {
  state: GestureState;
  cursorX: number;
  cursorY: number;
  pinchDistance: number;
  isFist: boolean;
  twoHandDistance?: number;
  rawLandmarks?: HandLandmarks[];
}

export interface WindowGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowConfig {
  id: string;
  title: string;
  geometry: WindowGeometry;
  minWidth?: number;
  minHeight?: number;
  zIndex: number;
  isMinimized: boolean;
  isMaximized: boolean;
  content?: ReactNode | string;
  icon?: string;
}

export interface TrackerMetrics {
  fps: number;
  handsDetected: number;
  isSpatialActive: boolean;
  isCameraReady: boolean;
  cameraBlocked: boolean;
}

export interface SimulatorState {
  enabled: boolean;
  cursorX: number;
  cursorY: number;
  isPinching: boolean;
  isFist: boolean;
  twoHandDistance: number;
}

export interface AppDefinition {
  id: string;
  title: string;
  iconName: string;
  defaultWidth: number;
  defaultHeight: number;
  launcherLabel: string;
}

export interface NexaDeskProps {
  className?: string;
  style?: CSSProperties;
  initialApps?: string[];
  spatialModeDefault?: boolean;
  showTaskbar?: boolean;
  showWebcamBubble?: boolean;
  onGestureChange?: (gesture: GestureState) => void;
  onWindowOpen?: (windowId: string) => void;
  onWindowClose?: (windowId: string) => void;
  children?: ReactNode;
}
