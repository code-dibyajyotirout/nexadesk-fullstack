import type {
  Landmark,
  HandLandmarks,
  GestureState,
  GestureDetectionResult,
  AppDefinition,
  WindowGeometry,
} from '../types/index.js';

export const GESTURE_STATE = {
  IDLE: 'IDLE',
  HOVER: 'HOVER',
  CLICK: 'CLICK',
  DRAG: 'DRAG',
  RESIZE: 'RESIZE',
  FIST_CLOSE: 'FIST_CLOSE',
} as const;

export const DEFAULT_APPS: Record<string, AppDefinition> = {
  'control-panel': {
    id: 'control-panel',
    title: 'System Dashboard',
    iconName: 'dashboard',
    defaultWidth: 420,
    defaultHeight: 380,
    launcherLabel: 'Dashboard',
  },
  paint: {
    id: 'paint',
    title: 'Nexa Touchless Paint',
    iconName: 'paint',
    defaultWidth: 640,
    defaultHeight: 480,
    launcherLabel: 'Paint',
  },
  files: {
    id: 'files',
    title: 'Workspace Storage',
    iconName: 'storage',
    defaultWidth: 540,
    defaultHeight: 380,
    launcherLabel: 'Storage',
  },
  terminal: {
    id: 'terminal',
    title: 'Developer Terminal',
    iconName: 'terminal',
    defaultWidth: 620,
    defaultHeight: 380,
    launcherLabel: 'Shell',
  },
  ide: {
    id: 'ide',
    title: 'Nexa Code Studio IDE',
    iconName: 'ide',
    defaultWidth: 800,
    defaultHeight: 520,
    launcherLabel: 'IDE',
  },
  browser: {
    id: 'browser',
    title: 'Nexa Web Browser',
    iconName: 'browser',
    defaultWidth: 760,
    defaultHeight: 500,
    launcherLabel: 'Browser',
  },
};

export function lerp(start: number, end: number, factor: number): number {
  return start + (end - start) * factor;
}

export function euclideanDistance(p1: Landmark, p2: Landmark): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = (p1.z || 0) - (p2.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function euclideanDistance2D(p1: Landmark, p2: Landmark): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export class LowPassFilter {
  private y: number | null = null;
  private s: number | null = null;

  filter(value: number, alpha: number): number {
    if (this.y === null) {
      this.s = value;
      this.y = value;
      return value;
    }
    this.y = value;
    this.s = alpha * value + (1 - alpha) * (this.s as number);
    return this.s;
  }

  hasLast(): boolean {
    return this.y !== null;
  }

  last(): number {
    return this.y || 0;
  }

  reset(): void {
    this.y = null;
    this.s = null;
  }
}

export class OneEuroFilter {
  private freq: number;
  private minCutoff: number;
  private beta: number;
  private dcutoff: number;
  private xFilt: LowPassFilter;
  private dxFilt: LowPassFilter;
  private lastTime: number | null = null;

  constructor(freq: number = 30, minCutoff: number = 1.0, beta: number = 0.007, dcutoff: number = 1.0) {
    this.freq = freq;
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dcutoff = dcutoff;
    this.xFilt = new LowPassFilter();
    this.dxFilt = new LowPassFilter();
  }

  private alpha(cutoff: number, rate: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    const te = 1.0 / rate;
    return 1.0 / (1.0 + tau / te);
  }

  filter(value: number, timestamp?: number): number {
    let rate = this.freq;
    if (timestamp !== undefined && this.lastTime !== null) {
      const dt = (timestamp - this.lastTime) / 1000.0;
      if (dt > 0) {
        rate = 1.0 / dt;
      }
    }
    this.lastTime = timestamp !== undefined ? timestamp : Date.now();

    const dx = this.xFilt.hasLast() ? (value - this.xFilt.last()) * rate : 0;
    const edx = this.dxFilt.filter(dx, this.alpha(this.dcutoff, rate));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.xFilt.filter(value, this.alpha(cutoff, rate));
  }

  reset(): void {
    this.xFilt.reset();
    this.dxFilt.reset();
    this.lastTime = null;
  }
}

export function isFistGesture(landmarks: HandLandmarks): boolean {
  if (!landmarks || landmarks.length < 21) return false;
  // Curl evaluation: Tip Y position must be lower (greater Y in screen coords) than PIP joint Y
  const indexCurled = landmarks[8].y > landmarks[6].y;
  const middleCurled = landmarks[12].y > landmarks[10].y;
  const ringCurled = landmarks[16].y > landmarks[14].y;
  const pinkyCurled = landmarks[20].y > landmarks[18].y;
  return indexCurled && middleCurled && ringCurled && pinkyCurled;
}

export function classifyGesture(
  hands: HandLandmarks[],
  screenWidth: number = 1920,
  screenHeight: number = 1080
): GestureDetectionResult {
  if (!hands || hands.length === 0) {
    return {
      state: GESTURE_STATE.IDLE,
      cursorX: screenWidth / 2,
      cursorY: screenHeight / 2,
      pinchDistance: 1.0,
      isFist: false,
    };
  }

  const primaryHand = hands[0];
  const indexTip = primaryHand[8];
  const thumbTip = primaryHand[4];

  // Screen space coordinates (horizontal mirrored for intuitive webcam control)
  const cursorX = (1.0 - indexTip.x) * screenWidth;
  const cursorY = indexTip.y * screenHeight;

  // Evaluate pinch distance between Index Tip (8) and Thumb Tip (4)
  const pinchDistance = euclideanDistance(indexTip, thumbTip);
  const isPinching = pinchDistance < 0.065;
  const isFist = isFistGesture(primaryHand);

  // Evaluate dual-hand mode if two hands are detected
  let twoHandDistance: number | undefined;
  if (hands.length >= 2) {
    const secondaryIndexTip = hands[1][8];
    twoHandDistance = euclideanDistance(indexTip, secondaryIndexTip);
  }

  let state: GestureState = GESTURE_STATE.HOVER;
  if (twoHandDistance !== undefined && hands.length >= 2) {
    state = GESTURE_STATE.RESIZE;
  } else if (isFist) {
    state = GESTURE_STATE.FIST_CLOSE;
  } else if (isPinching) {
    state = GESTURE_STATE.CLICK;
  }

  return {
    state,
    cursorX,
    cursorY,
    pinchDistance,
    isFist,
    twoHandDistance,
    rawLandmarks: hands,
  };
}

export function calculateCascadeGeometry(
  index: number,
  defaultWidth: number,
  defaultHeight: number,
  viewportWidth: number = 1280,
  viewportHeight: number = 800
): WindowGeometry {
  const step = 32;
  const baseX = 80;
  const baseY = 80;
  const maxX = Math.max(0, viewportWidth - defaultWidth - 40);
  const maxY = Math.max(0, viewportHeight - defaultHeight - 80);

  const x = Math.min(baseX + (index * step) % 300, maxX);
  const y = Math.min(baseY + (index * step) % 240, maxY);

  return {
    x,
    y,
    width: Math.min(defaultWidth, viewportWidth - 20),
    height: Math.min(defaultHeight, viewportHeight - 80),
  };
}
