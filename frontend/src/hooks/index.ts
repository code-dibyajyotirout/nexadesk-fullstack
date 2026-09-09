import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  GestureState,
  WindowConfig,
  TrackerMetrics,
  SimulatorState,
  WindowGeometry,
  HandLandmarks,
} from '../types/index.js';
import {
  GESTURE_STATE,
  DEFAULT_APPS,
  OneEuroFilter,
  lerp,
  classifyGesture,
  calculateCascadeGeometry,
} from '../utils/index.js';

export function useWindowManager(initialAppIds: string[] = ['control-panel', 'paint']) {
  const [windows, setWindows] = useState<WindowConfig[]>(() => {
    return initialAppIds.map((id, index) => {
      const def = DEFAULT_APPS[id] || {
        id,
        title: id,
        defaultWidth: 600,
        defaultHeight: 400,
      };
      return {
        id,
        title: def.title,
        geometry: calculateCascadeGeometry(index, def.defaultWidth, def.defaultHeight),
        zIndex: 10 + index,
        isMinimized: false,
        isMaximized: false,
      };
    });
  });

  const [activeWindowId, setActiveWindowId] = useState<string | null>(
    initialAppIds.length > 0 ? initialAppIds[initialAppIds.length - 1] : null
  );

  const topZIndexRef = useRef(20);

  const openWindow = useCallback((appId: string) => {
    setWindows((prev) => {
      const existing = prev.find((w) => w.id === appId);
      topZIndexRef.current += 1;
      if (existing) {
        return prev.map((w) =>
          w.id === appId
            ? { ...w, isMinimized: false, zIndex: topZIndexRef.current }
            : w
        );
      }
      const def = DEFAULT_APPS[appId] || {
        id: appId,
        title: appId,
        defaultWidth: 640,
        defaultHeight: 440,
      };
      const newWin: WindowConfig = {
        id: appId,
        title: def.title,
        geometry: calculateCascadeGeometry(prev.length, def.defaultWidth, def.defaultHeight),
        zIndex: topZIndexRef.current,
        isMinimized: false,
        isMaximized: false,
      };
      return [...prev, newWin];
    });
    setActiveWindowId(appId);
  }, []);

  const closeWindow = useCallback((windowId: string) => {
    setWindows((prev) => prev.filter((w) => w.id !== windowId));
    setActiveWindowId((current) => (current === windowId ? null : current));
  }, []);

  const focusWindow = useCallback((windowId: string) => {
    topZIndexRef.current += 1;
    setWindows((prev) =>
      prev.map((w) =>
        w.id === windowId ? { ...w, zIndex: topZIndexRef.current } : w
      )
    );
    setActiveWindowId(windowId);
  }, []);

  const toggleMinimize = useCallback((windowId: string) => {
    setWindows((prev) =>
      prev.map((w) =>
        w.id === windowId ? { ...w, isMinimized: !w.isMinimized } : w
      )
    );
  }, []);

  const toggleMaximize = useCallback((windowId: string) => {
    setWindows((prev) =>
      prev.map((w) =>
        w.id === windowId ? { ...w, isMaximized: !w.isMaximized } : w
      )
    );
  }, []);

  const updateGeometry = useCallback(
    (windowId: string, geometry: Partial<WindowGeometry>) => {
      setWindows((prev) =>
        prev.map((w) =>
          w.id === windowId
            ? { ...w, geometry: { ...w.geometry, ...geometry } }
            : w
        )
      );
    },
    []
  );

  return {
    windows,
    activeWindowId,
    openWindow,
    closeWindow,
    focusWindow,
    toggleMinimize,
    toggleMaximize,
    updateGeometry,
  };
}

export function useGestureDetector(options: {
  onGestureChange?: (gesture: GestureState) => void;
  onFistHoldComplete?: (targetWindowId: string | null) => void;
} = {}) {
  const [gestureState, setGestureState] = useState<GestureState>(GESTURE_STATE.IDLE);
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number }>({ x: 960, y: 540 });
  const [fistProgress, setFistProgress] = useState(0);

  const xFilterRef = useRef(new OneEuroFilter(30, 1.0, 0.007));
  const yFilterRef = useRef(new OneEuroFilter(30, 1.0, 0.007));
  const fistStartTimeRef = useRef<number | null>(null);

  const processLandmarks = useCallback(
    (hands: HandLandmarks[], screenWidth: number = 1920, screenHeight: number = 1080) => {
      const detection = classifyGesture(hands, screenWidth, screenHeight);

      // Smooth coordinates with OneEuroFilter
      const smoothX = xFilterRef.current.filter(detection.cursorX);
      const smoothY = yFilterRef.current.filter(detection.cursorY);
      setCursorPosition({ x: smoothX, y: smoothY });

      // Fist countdown timer calculation (1.0 second hold threshold)
      if (detection.isFist) {
        if (fistStartTimeRef.current === null) {
          fistStartTimeRef.current = Date.now();
        }
        const elapsed = Date.now() - fistStartTimeRef.current;
        const progress = Math.min(100, (elapsed / 1000) * 100);
        setFistProgress(progress);

        if (progress >= 100 && options.onFistHoldComplete) {
          options.onFistHoldComplete(null);
          fistStartTimeRef.current = null;
        }
      } else {
        fistStartTimeRef.current = null;
        setFistProgress(0);
      }

      setGestureState(detection.state);
      if (options.onGestureChange) {
        options.onGestureChange(detection.state);
      }
    },
    [options]
  );

  return {
    gestureState,
    cursorPosition,
    fistProgress,
    processLandmarks,
  };
}

export function useSpatialTracker(options: {
  defaultEnabled?: boolean;
  onFrame?: (hands: HandLandmarks[]) => void;
} = {}) {
  const [isSpatialActive, setIsSpatialActive] = useState(options.defaultEnabled ?? false);
  const [metrics, setMetrics] = useState<TrackerMetrics>({
    fps: 0,
    handsDetected: 0,
    isSpatialActive: options.defaultEnabled ?? false,
    isCameraReady: false,
    cameraBlocked: false,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(Date.now());

  const toggleSpatialMode = useCallback(() => {
    setIsSpatialActive((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!isSpatialActive) {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      setMetrics((m) => ({ ...m, isSpatialActive: false, fps: 0 }));
      return;
    }

    let isMounted = true;

    async function initCamera() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setMetrics((m) => ({ ...m, cameraBlocked: true }));
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, frameRate: { ideal: 30 } },
          audio: false,
        });

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setMetrics((m) => ({ ...m, isCameraReady: true, cameraBlocked: false, isSpatialActive: true }));

        const loop = () => {
          if (!isMounted) return;
          frameCountRef.current += 1;
          const now = Date.now();
          if (now - lastFpsTimeRef.current >= 1000) {
            const currentFps = Math.round((frameCountRef.current * 1000) / (now - lastFpsTimeRef.current));
            setMetrics((m) => ({ ...m, fps: currentFps }));
            frameCountRef.current = 0;
            lastFpsTimeRef.current = now;
          }
          rafIdRef.current = requestAnimationFrame(loop);
        };

        rafIdRef.current = requestAnimationFrame(loop);
      } catch {
        if (isMounted) {
          setMetrics((m) => ({ ...m, cameraBlocked: true, isCameraReady: false }));
        }
      }
    }

    initCamera();

    return () => {
      isMounted = false;
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isSpatialActive]);

  return {
    videoRef,
    isSpatialActive,
    toggleSpatialMode,
    metrics,
  };
}

export function useHandSimulator() {
  const [simulatorState, setSimulatorState] = useState<SimulatorState>({
    enabled: false,
    cursorX: 960,
    cursorY: 540,
    isPinching: false,
    isFist: false,
    twoHandDistance: 200,
  });

  const toggleSimulator = useCallback(() => {
    setSimulatorState((prev) => ({ ...prev, enabled: !prev.enabled }));
  }, []);

  const setCursor = useCallback((x: number, y: number) => {
    setSimulatorState((prev) => ({ ...prev, cursorX: x, cursorY: y }));
  }, []);

  const setPinch = useCallback((isPinching: boolean) => {
    setSimulatorState((prev) => ({ ...prev, isPinching }));
  }, []);

  const setFist = useCallback((isFist: boolean) => {
    setSimulatorState((prev) => ({ ...prev, isFist }));
  }, []);

  const setTwoHandDistance = useCallback((twoHandDistance: number) => {
    setSimulatorState((prev) => ({ ...prev, twoHandDistance }));
  }, []);

  return {
    simulatorState,
    toggleSimulator,
    setCursor,
    setPinch,
    setFist,
    setTwoHandDistance,
  };
}
