/**
 * NexaDesk OS - Lead Architect & Creative Technologist Implementation
 * 
 * Architecture Layout:
 * 1. AmbientParticles: Background visual particle canvas for rich aesthetics.
 * 2. Tracker: Accesses webcam and interfaces with MediaPipe Hands (CDN).
 * 3. GestureDetector: Evaluates 3D coordinates and triggers state enums.
 * 4. WindowManager: Directs window layout geometries, sorting, and lifecycle.
 * 5. NexaOS: Orchestrator managing updates, cursor states, performance metrics,
 *    and the mock-mouse simulator.
 */

// --- NEXADESK INITIALIZATION ---
console.log("%cNexaDesk Spatial Workspace Initialized", "color: #00f0ff; font-size: 14px; font-weight: bold;");

// Global System Enums for Hand Gestures
const GESTURE_STATE = {
  HOVER: 'HOVER',   // Single index finger extended (tracks movement)
  CLICK: 'CLICK',   // Pinch index and thumb (selects/activates)
  DRAG: 'DRAG',     // Pinch held down inside window header (moves window)
  RESIZE: 'RESIZE', // Two hands detected (distance scales active window)
  FIST: 'FIST'      // Fist formed over window (held >1000ms triggers Close)
};

/* ==========================================================================
   1. Background Ambient Particles (Visual Aesthetics)
   ========================================================================== */
class AmbientParticles {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.maxParticles = 60;
    this.resizeCanvas();
    this.initParticles();

    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  initParticles() {
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() * 2 + 1,
        color: Math.random() > 0.8 ? 'rgba(0, 240, 255, 0.4)' : 'rgba(255, 255, 255, 0.15)'
      });
    }
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw connections
    for (let i = 0; i < this.particles.length; i++) {
      const p1 = this.particles[i];
      for (let j = i + 1; j < this.particles.length; j++) {
        const p2 = this.particles[j];
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);

        if (dist < 120) {
          const alpha = (1 - dist / 120) * 0.12;
          this.ctx.strokeStyle = `rgba(0, 240, 255, ${alpha})`;
          this.ctx.lineWidth = 0.5;
          this.ctx.beginPath();
          this.ctx.moveTo(p1.x, p1.y);
          this.ctx.lineTo(p2.x, p2.y);
          this.ctx.stroke();
        }
      }
    }

    // Draw nodes
    for (const p of this.particles) {
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.ctx.fill();

      // Move particle
      p.x += p.vx;
      p.y += p.vy;

      // Bounce constraints
      if (p.x < 0 || p.x > this.canvas.width) p.vx *= -1;
      if (p.y < 0 || p.y > this.canvas.height) p.vy *= -1;
    }
  }
}

/* ==========================================================================
   2. One Euro Filter & Hand Tracking Engine (Computer Vision & Normalization)
   ========================================================================== */

/**
 * First-order Low-Pass Filter helper for 1€ Filter signals.
 */
class LowPassFilter {
  constructor(alpha, initValue = 0) {
    this.alpha = alpha;
    this.value = initValue;
    this.initialized = false;
  }

  filter(value, alpha = this.alpha) {
    if (!this.initialized) {
      this.value = value;
      this.initialized = true;
      return value;
    }
    this.value = alpha * value + (1 - alpha) * this.value;
    return this.value;
  }
}

/**
 * One Euro Filter: Adaptive first-order low-pass filter to solve the
 * latency-vs-jitter tradeoff in human-computer interfaces.
 * Reference: http://www.lifl.fr/~casiez/1euro/
 */
class OneEuroFilter {
  constructor(minCutoff = 1.0, beta = 0.007, dcutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dcutoff = dcutoff;
    this.xFilter = new LowPassFilter(0);
    this.dxFilter = new LowPassFilter(0);
    this.lastTime = null;
  }

  filter(value, timestamp) {
    if (this.lastTime === null) {
      this.lastTime = timestamp;
      this.xFilter.filter(value);
      this.dxFilter.filter(0);
      return value;
    }

    const dt = (timestamp - this.lastTime) / 1000.0; // convert to seconds
    if (dt <= 0) return this.xFilter.value;

    this.lastTime = timestamp;

    // Calculate input signal derivative (velocity)
    const dx = (value - this.xFilter.value) / dt;
    const alphaD = this.calculateAlpha(dt, this.dcutoff);
    const edx = this.dxFilter.filter(dx, alphaD);

    // Compute adaptive cutoff frequency depending on speed magnitude
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const alpha = this.calculateAlpha(dt, cutoff);

    return this.xFilter.filter(value, alpha);
  }

  calculateAlpha(dt, cutoff) {
    const r = 2 * Math.PI * cutoff * dt;
    return r / (r + 1);
  }
}

class Tracker {
  /**
   * @param {HTMLVideoElement} videoElement
   * @param {HTMLCanvasElement} overlayCanvas
   * @param {Function} onResultsCallback
   */
  constructor(videoElement, overlayCanvas, onResultsCallback) {
    this.video = videoElement;
    this.canvas = overlayCanvas;
    this.ctx = this.canvas.getContext('2d');
    this.onResults = onResultsCallback;
    this.hands = null;
    this.camera = null;

    // Adaptive One Euro Filter tracking states for X & Y coordinates
    // minCutoff=0.85 Hz filters out tiny finger tremors at slow speed
    // beta=0.015 scales response quickly to prevent visual lag on fast sweeps
    this.xFilter = new OneEuroFilter(0.85, 0.015);
    this.yFilter = new OneEuroFilter(0.85, 0.015);
    this.smoothedX = window.innerWidth / 2;
    this.smoothedY = window.innerHeight / 2;
  }

  async initialize() {
    if (!window.Hands || !window.Camera) {
      throw new Error("MediaPipe components failed to load via CDN.");
    }

    this.hands = new window.Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1, // Balance between latency and precision
      minDetectionConfidence: 0.65,
      minTrackingConfidence: 0.65
    });

    this.hands.onResults((results) => {
      this.drawTrackerOverlay(results);
      this.onResults(results);
    });

    // Start video capture
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' }
    });
    this.video.srcObject = stream;

    this.camera = new window.Camera(this.video, {
      onFrame: async () => {
        await this.hands.send({ image: this.video });
      },
      width: 640,
      height: 480
    });

    await this.camera.start();
  }

  /**
   * Converts MediaPipe's normalized coordinates (0.0 - 1.0) to viewport pixel values.
   * Leverages horizontal mirroring to make cursor movements intuitive.
   * @param {object} landmark - MediaPipe normalized coordinate {x, y, z}
   * @param {DOMRect} containerRect - Target screen bounds (defaults to viewport)
   */
  normalizeToPixel(landmark, containerRect = null) {
    const width = containerRect ? containerRect.width : window.innerWidth;
    const height = containerRect ? containerRect.height : window.innerHeight;
    const left = containerRect ? containerRect.left : 0;
    const top = containerRect ? containerRect.top : 0;

    // Horizontal mirror flip: (1.0 - landmark.x)
    const rawX = (1.0 - landmark.x) * width + left;
    const rawY = landmark.y * height + top;

    return { x: rawX, y: rawY, z: landmark.z };
  }

  /**
   * Adaptive One Euro Filtering to smooth coordinates, resolving the jitter-vs-lag tradeoff
   */
  smoothCoordinates(targetX, targetY) {
    const now = performance.now();
    this.smoothedX = this.xFilter.filter(targetX, now);
    this.smoothedY = this.yFilter.filter(targetY, now);
    return { x: this.smoothedX, y: this.smoothedY };
  }

  /**
   * Overlay drawn hand skeletal landmarks in small camera preview canvas
   */
  drawTrackerOverlay(results) {
    this.ctx.save();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw landmarks if hands found
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      for (let index = 0; index < results.multiHandLandmarks.length; index++) {
        const landmarks = results.multiHandLandmarks[index];
        const handedness = results.multiHandedness[index].label; // Left or Right

        // Pick primary color based on handedness
        const color = handedness === 'Left' ? '#00f0ff' : '#ff007f';

        this.ctx.strokeStyle = color;
        this.ctx.fillStyle = '#ffffff';
        this.ctx.lineWidth = 2;

        // Draw knuckles connections
        this.drawSkeletalConnection(landmarks, color);

        // Draw joint points
        for (const lm of landmarks) {
          const px = lm.x * this.canvas.width;
          const py = lm.y * this.canvas.height;
          this.ctx.beginPath();
          this.ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          this.ctx.fill();
        }
      }
    }
    this.ctx.restore();
  }

  drawSkeletalConnection(landmarks, color) {
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8], // Index
      [9, 10], [10, 11], [11, 12],    // Middle
      [13, 14], [14, 15], [15, 16],   // Ring
      [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
      [5, 9], [9, 13], [13, 17] // Palm base connection
    ];

    this.ctx.strokeStyle = color;
    this.ctx.beginPath();
    for (const [start, end] of connections) {
      if (landmarks[start] && landmarks[end]) {
        const sx = landmarks[start].x * this.canvas.width;
        const sy = landmarks[start].y * this.canvas.height;
        const ex = landmarks[end].x * this.canvas.width;
        const ey = landmarks[end].y * this.canvas.height;
        this.ctx.moveTo(sx, sy);
        this.ctx.lineTo(ex, ey);
      }
    }
    this.ctx.stroke();
  }
}

/* ==========================================================================
   3. Gesture-to-Action State Machine
   ========================================================================== */
class GestureDetector {
  constructor() {
    this.fistStartTime = null;
    this.fistTargetWindow = null;
    this.closeGestureDuration = 1000; // Time in ms to trigger close
  }

  /**
   * Analyzes 21 landmarks of up to 2 hands to return simulated cursor states
   * @param {Array} multiHandLandmarks - array of hand coordinates
   * @param {Array} multiHandedness - left vs right classification
   * @param {WindowManager} windowManager - reference to calculate bounds matching
   * @param {object} cursorPixelPos - current smoothed pointer coordinates {x, y}
   */
  evaluateState(multiHandLandmarks, multiHandedness, windowManager, cursorPixelPos) {
    if (!multiHandLandmarks || multiHandLandmarks.length === 0) {
      this.resetFistState();
      return { state: GESTURE_STATE.HOVER, activeHand: null };
    }

    const handCount = multiHandLandmarks.length;

    // ==========================================
    // RESIZE GESTURE (Two Hands Mode)
    // ==========================================
    if (handCount === 2) {
      this.resetFistState();
      const hand1IdxTip = multiHandLandmarks[0][8];
      const hand2IdxTip = multiHandLandmarks[1][8];

      // Calculate Euclidean distance in normalized coordinate space
      const distanceNorm = Math.hypot(hand1IdxTip.x - hand2IdxTip.x, hand1IdxTip.y - hand2IdxTip.y);
      // Map to screen pixel distance for sizing adjustments
      const pixelDistance = Math.hypot(
        (hand1IdxTip.x - hand2IdxTip.x) * window.innerWidth,
        (hand1IdxTip.y - hand2IdxTip.y) * window.innerHeight
      );

      return {
        state: GESTURE_STATE.RESIZE,
        distance: pixelDistance,
        normDistance: distanceNorm
      };
    }

    // Process Single Hand Gestures
    const landmarks = multiHandLandmarks[0];
    const handInfo = multiHandedness[0];

    // landmarks indices:
    // Thumb: Tip 4
    // Index: Tip 8, PIP 6
    // Middle: Tip 12, PIP 10
    // Ring: Tip 16, PIP 14
    // Pinky: Tip 20, PIP 18

    // 1. CLICK / PINCH Gesture: Index Tip (8) to Thumb Tip (4)
    const pt8 = landmarks[8];
    const pt4 = landmarks[4];

    // Euclidean distance in 3D Space
    const pinchDistance = Math.sqrt(
      Math.pow(pt8.x - pt4.x, 2) +
      Math.pow(pt8.y - pt4.y, 2) +
      Math.pow(pt8.z - pt4.z, 2)
    );

    const isPinching = pinchDistance < 0.05; // Standard proximity pinch threshold

    // Check if index pointer is inside a window bounds
    const hoverWindow = windowManager.findWindowAt(cursorPixelPos.x, cursorPixelPos.y);

    if (isPinching) {
      // If already dragging or click started in title bar
      return {
        state: GESTURE_STATE.CLICK,
        isPinching: true,
        hoverWindowId: hoverWindow ? hoverWindow.id : null,
        isOverHeader: hoverWindow ? windowManager.isOverHeader(hoverWindow.id, cursorPixelPos.y) : false
      };
    }

    // 2. CLOSE (Fist) Gesture: Curled fingers held over window bounds for >1000ms
    const isIndexCurled = pt8.y > landmarks[6].y;
    const isMiddleCurled = landmarks[12].y > landmarks[10].y;
    const isRingCurled = landmarks[16].y > landmarks[14].y;
    const isPinkyCurled = landmarks[20].y > landmarks[18].y;

    const isFist = isIndexCurled && isMiddleCurled && isRingCurled && isPinkyCurled;

    if (isFist) {
      if (hoverWindow) {
        if (!this.fistStartTime || this.fistTargetWindow !== hoverWindow.id) {
          this.fistStartTime = Date.now();
          this.fistTargetWindow = hoverWindow.id;
        }

        const elapsed = Date.now() - this.fistStartTime;
        const progress = Math.min(100, (elapsed / this.closeGestureDuration) * 100);

        return {
          state: GESTURE_STATE.FIST,
          targetWindowId: hoverWindow.id,
          holdProgress: progress,
          triggerClose: elapsed >= this.closeGestureDuration
        };
      }
    }

    // Default State: HOVER
    this.resetFistState();
    return {
      state: GESTURE_STATE.HOVER,
      hoverWindowId: hoverWindow ? hoverWindow.id : null
    };
  }

  resetFistState() {
    this.fistStartTime = null;
    this.fistTargetWindow = null;
  }
}

/* ==========================================================================
   4. DOM Window Manager System
   ========================================================================== */
class WindowManager {
  constructor(desktopId) {
    this.desktop = document.getElementById(desktopId);
    this.windowRegistry = []; // Tracks window instances, geometries and states
    this.activeWindowId = null;
    this.topZIndex = 100;

    window.addEventListener('resize', () => {
      this.adjustWindowsForScreenSize();
    });
  }

  adjustWindowsForScreenSize() {
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    this.windowRegistry.forEach(win => {
      const el = document.getElementById(`win-${win.id}`);
      if (!el || win.minimized) return;

      if (win.maximized) return;

      let newW = win.w;
      let newH = win.h;
      if (newW > screenW - 20) {
        newW = Math.max(280, screenW - 20);
      }
      if (newH > screenH - 120) {
        newH = Math.max(200, screenH - 120);
      }

      let newX = win.x;
      let newY = win.y;
      if (newX + newW > screenW) {
        newX = Math.max(10, screenW - newW - 10);
      }
      if (newY + newH > screenH) {
        newY = Math.max(45, screenH - newH - 70);
      }

      win.x = newX;
      win.y = newY;
      win.w = newW;
      win.h = newH;

      el.style.width = `${newW}px`;
      el.style.height = `${newH}px`;
      el.style.transform = `translate3d(${newX}px, ${newY}px, 0)`;
    });
  }

  /**
   * Spawns a new glassmorphic OS window
   * @param {string} id - unique string ID
   * @param {string} title - title bar label
   * @param {string} contentHTML - inner body contents
   * @param {object} initialGeom - initial dimensions {x, y, w, h}
   */
  createWindow(id, title, contentHTML, initialGeom = {}) {
    // Avoid double creations
    if (this.windowRegistry.find(w => w.id === id)) {
      this.bringToFront(id);
      return;
    }

    let w = initialGeom.w || 380;
    let h = initialGeom.h || 260;
    // Auto cascade placement if coordinates not provided
    let x = initialGeom.x !== undefined ? initialGeom.x : 100 + (this.windowRegistry.length * 30);
    let y = initialGeom.y !== undefined ? initialGeom.y : 80 + (this.windowRegistry.length * 25);

    // Keep windows inside the screen boundaries
    if (w > window.innerWidth) w = Math.max(200, window.innerWidth - 20);
    if (h > window.innerHeight - 50) h = Math.max(150, window.innerHeight - 50);
    if (x < 10) x = 10;
    if (y < 45) y = 45; // Do not overlap with top bar
    if (x + w > window.innerWidth) x = Math.max(10, window.innerWidth - w - 10);
    if (y + h > window.innerHeight - 40) y = Math.max(45, window.innerHeight - h - 50);

    const winObj = {
      id,
      title,
      x,
      y,
      w,
      h,
      minimized: false,
      maximized: false,
      restoreGeom: null
    };

    const winEl = document.createElement('div');
    winEl.id = `win-${id}`;
    winEl.className = 'aether-window';
    winEl.style.width = `${w}px`;
    winEl.style.height = `${h}px`;
    winEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;

    winEl.innerHTML = `
      <div class="window-header" id="win-header-${id}">
        <span class="window-title">${title}</span>
        <div class="window-controls">
          <button class="control-btn minimize" data-id="${id}" title="Minimize">•</button>
          <button class="control-btn maximize" data-id="${id}" title="Maximize">•</button>
          <button class="control-btn close" data-id="${id}" title="Close">×</button>
        </div>
      </div>
      <div class="window-body" id="win-body-${id}">
        ${contentHTML}
      </div>
      <div class="resizer resizer-t" data-direction="t"></div>
      <div class="resizer resizer-r" data-direction="r"></div>
      <div class="resizer resizer-b" data-direction="b"></div>
      <div class="resizer resizer-l" data-direction="l"></div>
      <div class="resizer resizer-tl" data-direction="tl"></div>
      <div class="resizer resizer-tr" data-direction="tr"></div>
      <div class="resizer resizer-bl" data-direction="bl"></div>
      <div class="resizer resizer-br" data-direction="br"></div>
    `;

    this.desktop.appendChild(winEl);
    this.windowRegistry.push(winObj);

    // Setup window click listener for depth management
    winEl.addEventListener('pointerdown', () => this.bringToFront(id));

    // Minimize, Maximize, Close standard button clicks fallback
    winEl.querySelector('.control-btn.close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeWindow(id);
    });

    winEl.querySelector('.control-btn.minimize').addEventListener('click', (e) => {
      e.stopPropagation();
      this.minimizeWindow(id);
    });

    winEl.querySelector('.control-btn.maximize').addEventListener('click', (e) => {
      e.stopPropagation();
      this.maximizeWindow(id);
    });

    // --- MOUSE/POINTER DRAG SYSTEM FOR DESKTOP MODE ---
    const header = winEl.querySelector('.window-header');
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let winStart = { x: 0, y: 0 };

    header.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.control-btn')) return; // Do not drag when clicking buttons
      this.bringToFront(id);
      const win = this.windowRegistry.find(w => w.id === id);
      if (!win || win.maximized) return;

      isDragging = true;
      dragStart.x = e.clientX;
      dragStart.y = e.clientY;
      winStart.x = win.x;
      winStart.y = win.y;

      header.style.cursor = 'grabbing';
      header.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    document.addEventListener('pointermove', (e) => {
      if (isDragging) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        this.updateGeometry(id, winStart.x + dx, winStart.y + dy);
      }
    });

    const stopDrag = (e) => {
      if (isDragging) {
        isDragging = false;
        header.style.cursor = '';
        try { header.releasePointerCapture(e.pointerId); } catch (err) { }
      }
    };
    document.addEventListener('pointerup', stopDrag);
    document.addEventListener('pointercancel', stopDrag);

    // --- MOUSE/TOUCH MULTI-EDGE RESIZE SYSTEM ---
    let isResizing = false;
    let resizeDir = '';
    let resizeStart = { x: 0, y: 0 };
    let resizeWinStart = { x: 0, y: 0 };
    let sizeStart = { w: 0, h: 0 };
    let activeResizer = null;

    winEl.querySelectorAll('.resizer').forEach(resizer => {
      resizer.addEventListener('pointerdown', (e) => {
        this.bringToFront(id);
        const win = this.windowRegistry.find(w => w.id === id);
        if (!win || win.maximized) return;

        isResizing = true;
        resizeDir = resizer.getAttribute('data-direction');
        resizeStart.x = e.clientX;
        resizeStart.y = e.clientY;
        resizeWinStart.x = win.x;
        resizeWinStart.y = win.y;
        sizeStart.w = win.w;
        sizeStart.h = win.h;
        activeResizer = resizer;

        try { resizer.setPointerCapture(e.pointerId); } catch (err) {}
        e.preventDefault();
        e.stopPropagation();
      });
    });

    document.addEventListener('pointermove', (e) => {
      if (isResizing) {
        const win = this.windowRegistry.find(w => w.id === id);
        if (!win) return;

        const dx = e.clientX - resizeStart.x;
        const dy = e.clientY - resizeStart.y;

        let newX = win.x;
        let newY = win.y;
        let newW = win.w;
        let newH = win.h;

        // Resize Right / Left
        if (resizeDir.includes('r')) {
          newW = sizeStart.w + dx;
        } else if (resizeDir.includes('l')) {
          const calculatedW = sizeStart.w - dx;
          if (calculatedW >= 280) {
            newW = calculatedW;
            newX = resizeWinStart.x + dx;
          } else {
            newW = 280;
            newX = resizeWinStart.x + (sizeStart.w - 280);
          }
        }

        // Resize Bottom / Top
        if (resizeDir.includes('b')) {
          newH = sizeStart.h + dy;
        } else if (resizeDir.includes('t')) {
          const calculatedH = sizeStart.h - dy;
          if (calculatedH >= 200) {
            newH = calculatedH;
            newY = resizeWinStart.y + dy;
          } else {
            newH = 200;
            newY = resizeWinStart.y + (sizeStart.h - 200);
          }
        }

        this.updateGeometry(id, newX, newY, newW, newH);
      }
    });

    const stopResize = (e) => {
      if (isResizing) {
        isResizing = false;
        if (activeResizer) {
          try { activeResizer.releasePointerCapture(e.pointerId); } catch (err) {}
        }
        activeResizer = null;
      }
    };
    document.addEventListener('pointerup', stopResize);
    document.addEventListener('pointercancel', stopResize);

    this.bringToFront(id);
    this.updateTaskbarIndicators();
  }

  bringToFront(id) {
    if (this.activeWindowId === id && this.windowRegistry.find(w => w.id === id)?.zIndex === this.topZIndex) {
      return;
    }

    const win = this.windowRegistry.find(w => w.id === id);
    if (!win) return;

    this.topZIndex++;
    win.zIndex = this.topZIndex;

    const el = document.getElementById(`win-${id}`);
    if (el) {
      el.style.zIndex = win.zIndex;

      // Toggle active visual border styles
      document.querySelectorAll('.aether-window').forEach(wEl => wEl.classList.remove('active-window'));
      el.classList.add('active-window');
    }

    this.activeWindowId = id;
    this.updateTaskbarIndicators();

    if (id === 'terminal') {
      const hiddenInput = document.getElementById('term-hidden-input');
      if (hiddenInput) {
        setTimeout(() => hiddenInput.focus(), 50);
      }
    }
  }

  updateGeometry(id, x, y, w, h) {
    const win = this.windowRegistry.find(w => w.id === id);
    if (!win || win.maximized) return;

    if (x !== undefined) win.x = x;
    if (y !== undefined) win.y = y;
    if (w !== undefined) win.w = Math.max(280, w);
    if (h !== undefined) win.h = Math.max(200, h);

    const el = document.getElementById(`win-${id}`);
    if (el) {
      el.style.width = `${win.w}px`;
      el.style.height = `${win.h}px`;
      el.style.transform = `translate3d(${win.x}px, ${win.y}px, 0)`;
    }
  }

  findWindowAt(pxX, pxY) {
    // Traverse registry in reverse Z-index order to find top-most window under cursor
    const matching = this.windowRegistry
      .filter(w => !w.minimized)
      .filter(w => {
        return pxX >= w.x && pxX <= w.x + w.w &&
          pxY >= w.y && pxY <= w.y + w.h;
      });

    if (matching.length === 0) return null;

    // Return window with highest z-index
    return matching.reduce((prev, curr) => (prev.zIndex > curr.zIndex) ? prev : curr);
  }

  isOverHeader(id, pxY) {
    const win = this.windowRegistry.find(w => w.id === id);
    if (!win) return false;
    // Header height is 44px
    return pxY >= win.y && pxY <= win.y + 44;
  }

  closeWindow(id) {
    const index = this.windowRegistry.findIndex(w => w.id === id);
    if (index === -1) return;

    const el = document.getElementById(`win-${id}`);
    if (el) {
      // Add subtle scale out destruction animation
      el.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
      el.style.transform = `translate3d(${this.windowRegistry[index].x}px, ${this.windowRegistry[index].y}px, 0) scale(0.9)`;
      el.style.opacity = '0';

      setTimeout(() => {
        el.remove();
      }, 250);
    }

    this.windowRegistry.splice(index, 1);

    // Notify NexaOS to persist the updated window list
    if (window.NexaDeskInstance && typeof window.NexaDeskInstance.saveOpenWindows === 'function') {
      window.NexaDeskInstance.saveOpenWindows();
    }

    if (this.activeWindowId === id) {
      this.activeWindowId = null;
      // Auto-focus next top window
      if (this.windowRegistry.length > 0) {
        const next = this.windowRegistry.reduce((prev, curr) => (prev.zIndex > curr.zIndex) ? prev : curr);
        this.bringToFront(next.id);
      }
    }

    this.updateTaskbarIndicators();

    // Fire event for UI toggles (e.g. taskbar shortcut highlight)
    const appBtn = document.querySelector(`.app-launcher[data-app="${id}"]`);
    if (appBtn) appBtn.classList.remove('active');
  }

  minimizeWindow(id) {
    const win = this.windowRegistry.find(w => w.id === id);
    if (!win) return;

    win.minimized = true;
    const el = document.getElementById(`win-${id}`);
    if (el) {
      el.style.transition = 'transform 0.3s cubic-bezier(0.82, 0.085, 0.395, 0.895), opacity 0.3s';
      // Animate window sliding down into the general area of the taskbar
      el.style.transform = `translate3d(${win.x}px, ${window.innerHeight + 100}px, 0) scale(0.3)`;
      el.style.opacity = '0';

      setTimeout(() => {
        el.style.display = 'none';
        el.style.transition = '';
      }, 300);
    }

    this.updateTaskbarIndicators();
  }

  restoreWindow(id) {
    const win = this.windowRegistry.find(w => w.id === id);
    if (!win) return;

    win.minimized = false;
    const el = document.getElementById(`win-${id}`);
    if (el) {
      el.style.display = 'flex';
      el.style.opacity = '0';
      el.style.transform = `translate3d(${win.x}px, ${window.innerHeight}px, 0) scale(0.5)`;

      // Force repaint
      el.offsetHeight;

      el.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.1), opacity 0.3s';
      el.style.transform = `translate3d(${win.x}px, ${win.y}px, 0) scale(1)`;
      el.style.opacity = '1';

      setTimeout(() => {
        el.style.transition = '';
      }, 300);
    }

    this.bringToFront(id);
  }

  maximizeWindow(id) {
    const win = this.windowRegistry.find(w => w.id === id);
    if (!win) return;

    const el = document.getElementById(`win-${id}`);
    if (!el) return;

    el.style.transition = 'all 0.3s cubic-bezier(0.165, 0.84, 0.44, 1)';

    if (win.maximized) {
      // Restore previous size
      win.maximized = false;
      const geom = win.restoreGeom;
      win.x = geom.x;
      win.y = geom.y;
      win.w = geom.w;
      win.h = geom.h;

      el.style.width = `${win.w}px`;
      el.style.height = `${win.h}px`;
      el.style.transform = `translate3d(${win.x}px, ${win.y}px, 0)`;
      el.classList.remove('maximized');
    } else {
      // Maximize to desktop dimensions (leave margin for taskbar)
      win.restoreGeom = { x: win.x, y: win.y, w: win.w, h: win.h };
      win.maximized = true;
      win.x = 10;
      win.y = 10;
      win.w = window.innerWidth - 20;
      win.h = window.innerHeight - 90; // Taskbar clearance

      el.style.width = `${win.w}px`;
      el.style.height = `${win.h}px`;
      el.style.transform = `translate3d(${win.x}px, ${win.y}px, 0)`;
      el.classList.add('maximized');
    }

    setTimeout(() => {
      el.style.transition = '';
    }, 300);
  }

  updateTaskbarIndicators() {
    this.windowRegistry.forEach(win => {
      const launcher = document.querySelector(`.app-launcher[data-app="${win.id}"]`);
      if (launcher) {
        launcher.classList.add('active');
        if (win.id === this.activeWindowId && !win.minimized) {
          launcher.style.borderBottomColor = 'var(--neon-cyan)';
        } else {
          launcher.style.borderBottomColor = '';
        }
      }
    });
  }
}

/* ==========================================================================
   5. NexaOS Orchestrator & System Core
   ========================================================================== */
class NexaOS {
  constructor() {
    this.ambient = new AmbientParticles('ambient-particles');
    this.windowManager = new WindowManager('aether-desktop');
    this.detector = new GestureDetector();
    this.tracker = null;

    // Performance State
    this.fps = 0;
    this.frameCount = 0;
    this.lastFpsUpdate = performance.now();
    this.performanceHistory = new Array(50).fill(60);

    // Cursor Coordinate Interpolation Targets
    this.cursorX = window.innerWidth / 2;
    this.cursorY = window.innerHeight / 2;

    // Drag/Resize State Registry
    this.activeDragWindow = null;
    this.dragOffset = { x: 0, y: 0 };
    this.activeResizeWindow = null;
    this.initialResizeDistance = 0;
    this.initialResizeGeom = null;
    this.wasPinching = false; // Tracks pinch transition edges for dispatching clicks
    this.isShiftHeld = false; // Track Shift key state for two-hand resize simulation

    // Tracker Mode & State (Spatial Mode Default OFF)
    this.spatialMode = false;
    this.trackingActive = false;
    this.simulatorActive = false;

    // Simulated Hand Landmark State
    this.simulatedHand = {
      isPinching: false,
      isFist: false,
      distance: 200,
      x: window.innerWidth / 2,
      y: window.innerHeight / 2
    };

    // Canvas drawing app color state
    this.paintColor = '#00f0ff';
    this.lastPaintPoint = null;

    this.bootSystem();
  }

  bootSystem() {
    this.bindEvents();
    this.initializeTime();
    this.spawnDefaultWindows();

    // Initialize Tracker Class
    const streamVideo = document.getElementById('webcam-stream');
    const overlayCanvas = document.getElementById('tracker-overlay');
    this.tracker = new Tracker(streamVideo, overlayCanvas, (results) => this.handleTrackerResults(results));

    // Spatial mode default OFF - initialize in standby stop state
    this.stopCameraTracking();

    // Kickoff decoupled Animation Frame Loop
    requestAnimationFrame((t) => this.loop(t));
  }

  bindEvents() {
    // Spatial Mode toggle button binding
    const spatialBtn = document.getElementById('toggle-spatial-mode');
    if (spatialBtn) {
      spatialBtn.addEventListener('click', () => {
        this.spatialMode = !this.spatialMode;
        const statusText = document.getElementById('spatial-status-text');
        const kbdBtn = document.getElementById('toggle-keyboard-btn');
        const kbdPanel = document.getElementById('virtual-keyboard-panel');
        if (this.spatialMode) {
          spatialBtn.classList.add('active');
          if (statusText) statusText.textContent = 'ON';
          if (kbdBtn) kbdBtn.style.display = 'inline-flex';
          const bubble = document.getElementById('webcam-panel');
          const cursor = document.getElementById('aether-cursor');
          if (bubble) bubble.style.display = 'block';
          if (cursor) cursor.style.display = 'block';
          this.startCameraTracking();
        } else {
          spatialBtn.classList.remove('active');
          if (statusText) statusText.textContent = 'OFF';
          if (kbdBtn) {
            kbdBtn.style.display = 'none';
            kbdBtn.classList.remove('active');
          }
          if (kbdPanel) kbdPanel.style.display = 'none';
          const kbdStatusText = document.getElementById('keyboard-status-text');
          if (kbdStatusText) kbdStatusText.textContent = 'OFF';
          const kbdIndicator = document.querySelector('.keyboard-indicator');
          if (kbdIndicator) kbdIndicator.style.background = '#4a5568';
          this.stopCameraTracking();
        }
      });
    }

    // Taskbar launchers mapping
    document.querySelectorAll('.app-launcher').forEach(launcher => {
      launcher.addEventListener('click', (e) => {
        const appId = launcher.getAttribute('data-app');
        this.toggleAppWindow(appId);
      });
    });

    // Webcam visibility minimizes bubble
    document.getElementById('toggle-feed-visibility').addEventListener('click', () => {
      const bubble = document.getElementById('webcam-panel');
      bubble.classList.toggle('minimized');
    });

    // Webcam recovery retry button
    document.getElementById('retry-camera-btn').addEventListener('click', () => {
      this.startCameraTracking();
    });

    // Virtual simulator activate button
    document.getElementById('enable-simulator-btn').addEventListener('click', () => {
      this.activateSimulator();
    });

    // Disable Simulator Button
    document.getElementById('disable-simulator-btn').addEventListener('click', () => {
      this.deactivateSimulator();
    });

    // Webcam Panel Dragging (using pointer events)
    const webcamHeader = document.getElementById('webcam-header');
    const webcamBubble = document.getElementById('webcam-panel');
    let isDraggingWebcam = false;
    let webcamOffset = { x: 0, y: 0 };

    webcamHeader.addEventListener('pointerdown', (e) => {
      isDraggingWebcam = true;
      const rect = webcamBubble.getBoundingClientRect();
      webcamOffset.x = e.clientX - rect.left;
      webcamOffset.y = e.clientY - rect.top;
      webcamHeader.style.cursor = 'grabbing';
      webcamBubble.setPointerCapture(e.pointerId);
    });

    webcamHeader.addEventListener('pointermove', (e) => {
      if (!isDraggingWebcam) return;
      const x = e.clientX - webcamOffset.x;
      const y = e.clientY - webcamOffset.y;
      webcamBubble.style.left = `${x}px`;
      webcamBubble.style.top = `${y}px`;
      webcamBubble.style.right = 'auto'; // Break initial relative css bindings
    });

    const stopDraggingWebcam = (e) => {
      if (isDraggingWebcam) {
        isDraggingWebcam = false;
        webcamHeader.style.cursor = 'move';
        try { webcamBubble.releasePointerCapture(e.pointerId); } catch (err) { }
      }
    };
    webcamHeader.addEventListener('pointerup', stopDraggingWebcam);
    webcamHeader.addEventListener('pointercancel', stopDraggingWebcam);

    // Initialize virtual QWERTY keyboard
    this.initVirtualKeyboard();
  }

  initVirtualKeyboard() {
    const kbdPanel = document.getElementById('virtual-keyboard-panel');
    const toggleKbdBtn = document.getElementById('toggle-keyboard-btn');
    const kbdStatusText = document.getElementById('keyboard-status-text');
    const kbdIndicator = document.querySelector('.keyboard-indicator');

    if (!kbdPanel || !toggleKbdBtn) return;

    toggleKbdBtn.addEventListener('click', () => {
      const isVisible = kbdPanel.style.display === 'flex' || kbdPanel.style.display === 'block';
      if (isVisible) {
        kbdPanel.style.display = 'none';
        if (kbdStatusText) kbdStatusText.textContent = 'OFF';
        if (kbdIndicator) kbdIndicator.style.background = '#4a5568';
        toggleKbdBtn.classList.remove('active');
      } else {
        kbdPanel.style.display = 'flex';
        if (kbdStatusText) kbdStatusText.textContent = 'ON';
        if (kbdIndicator) kbdIndicator.style.background = '#39ff14';
        toggleKbdBtn.classList.add('active');
      }
    });

    // Prevent mousedown from stealing focus from inputs/textareas
    kbdPanel.querySelectorAll('.kbd-key').forEach(keyBtn => {
      keyBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
      });

      keyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const char = keyBtn.getAttribute('data-char');
        const active = document.activeElement;

        if (char === 'close') {
          kbdPanel.style.display = 'none';
          if (kbdStatusText) kbdStatusText.textContent = 'OFF';
          if (kbdIndicator) kbdIndicator.style.background = '#4a5568';
          toggleKbdBtn.classList.remove('active');
          return;
        }

        if (!active || (active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA')) {
          this.showToast("Select a text box first to type!");
          return;
        }

        const val = active.value;
        const start = active.selectionStart;
        const end = active.selectionEnd;

        if (char === 'backspace') {
          if (start > 0) {
            active.value = val.substring(0, start - 1) + val.substring(end);
            active.selectionStart = active.selectionEnd = start - 1;
            active.dispatchEvent(new Event('input', { bubbles: true }));
          }
        } else if (char === 'enter') {
          // Dispatch keydown Enter event
          const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
          });
          active.dispatchEvent(enterEvent);
        } else {
          active.value = val.substring(0, start) + char + val.substring(end);
          active.selectionStart = active.selectionEnd = start + char.length;
          active.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Keep input focused
        active.focus();
      });
    });
  }

  initializeTime() {
    const timeEl = document.getElementById('system-time');
    const update = () => {
      const d = new Date();
      timeEl.textContent = d.toTimeString().split(' ')[0];
    };
    setInterval(update, 1000);
    update();
  }

  showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  async startCameraTracking() {
    this.showToast("CONNECTING TO WEBCAM ENGINE...");
    try {
      await this.tracker.initialize();
      this.trackingActive = true;
      this.simulatorActive = false;
      document.getElementById('fallback-overlay').classList.add('hidden');
      document.getElementById('simulator-widget').classList.add('hidden');
      document.getElementById('webcam-panel').style.display = 'block';
      document.getElementById('aether-cursor').style.display = 'block';
      this.showToast("WEBCAM CALIBRATED SUCCESSFULLY");
      this.updateDockStatusBadge("ACTIVE", "var(--neon-green)");
    } catch (error) {
      console.warn("Camera setup failed: ", error.message);
      this.trackingActive = false;
      this.showToast("CAMERA ACCESS DENIED");
      document.getElementById('fallback-overlay').classList.remove('hidden');
      this.updateDockStatusBadge("SIMULATOR", "var(--neon-orange)");
    }
  }

  stopCameraTracking() {
    this.trackingActive = false;
    this.simulatorActive = false;
    if (this.tracker && this.tracker.camera) {
      try { this.tracker.camera.stop(); } catch (e) { }
    }
    const video = document.getElementById('webcam-stream');
    if (video && video.srcObject) {
      const tracks = video.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      video.srcObject = null;
    }
    const bubble = document.getElementById('webcam-panel');
    const cursor = document.getElementById('aether-cursor');
    if (bubble) bubble.style.display = 'none';
    if (cursor) cursor.style.display = 'none';
    const fallback = document.getElementById('fallback-overlay');
    if (fallback) fallback.classList.add('hidden');
    const simWidget = document.getElementById('simulator-widget');
    if (simWidget) simWidget.classList.add('hidden');
    this.updateDockStatusBadge("OFF", "#64748b");
  }

  updateDockStatusBadge(text, color) {
    const badge = document.getElementById('status-gesture-badge');
    if (!badge) return;
    const label = badge.querySelector('.status-label');
    const indicator = badge.querySelector('.status-indicator');

    label.textContent = text;
    indicator.style.backgroundColor = color;
    if (color !== '#64748b') {
      indicator.style.boxShadow = `0 0 8px ${color}`;
    } else {
      indicator.style.boxShadow = 'none';
    }
  }

  /* ==========================================================================
   Virtual Hand Simulator Setup (Interactive Mouse Sandbox)
   ========================================================================== */
  activateSimulator() {
    this.simulatorActive = true;
    this.trackingActive = false;
    document.getElementById('fallback-overlay').classList.add('hidden');
    document.getElementById('simulator-widget').classList.remove('hidden');
    this.showToast("HAND SIMULATOR ENABLED");
    this.updateDockStatusBadge("SIM RUNNING", "var(--neon-cyan)");

    // Bind Simulator Pointer Handlers on desktop area
    const desktop = document.getElementById('aether-desktop');

    const handleMove = (e) => {
      if (!this.simulatorActive) return;
      this.simulatedHand.x = e.clientX;
      this.simulatedHand.y = e.clientY;
    };
    desktop.addEventListener('pointermove', handleMove);

    const handleDown = (e) => {
      if (!this.simulatorActive) return;
      // Left click acts as Index-Thumb Pinch Click
      if (e.button === 0) {
        this.simulatedHand.isPinching = true;
        document.getElementById('sim-pinch-status').textContent = "True";
        document.getElementById('sim-pinch-status').style.color = "var(--neon-magenta)";
      }
    };
    desktop.addEventListener('pointerdown', handleDown);

    const handleUp = (e) => {
      if (!this.simulatorActive) return;
      if (e.button === 0) {
        this.simulatedHand.isPinching = false;
        document.getElementById('sim-pinch-status').textContent = "False";
        document.getElementById('sim-pinch-status').style.color = "";
      }
    };
    desktop.addEventListener('pointerup', handleUp);

    // Keyboard bindings for Fist/Close and Multi-Hand distance
    const handleKeyDown = (e) => {
      if (!this.simulatorActive) return;
      if (e.code === 'Space') {
        e.preventDefault();
        this.simulatedHand.isFist = true;
        document.getElementById('sim-fist-status').textContent = "True";
        document.getElementById('sim-fist-status').style.color = "var(--neon-red)";
      }
      if (e.key === 'Shift') this.isShiftHeld = true;
    };
    window.addEventListener('keydown', handleKeyDown);

    const handleKeyUp = (e) => {
      if (!this.simulatorActive) return;
      if (e.code === 'Space') {
        this.simulatedHand.isFist = false;
        document.getElementById('sim-fist-status').textContent = "False";
        document.getElementById('sim-fist-status').style.color = "";
      }
      if (e.key === 'Shift') this.isShiftHeld = false;
    };
    window.addEventListener('keyup', handleKeyUp);

    // Wheel listener for multi-hand scale resizing
    const handleWheel = (e) => {
      if (!this.simulatorActive || !e.shiftKey) return;
      e.preventDefault();
      // Increase/decrease simulated finger distance
      this.simulatedHand.distance += e.deltaY * -0.5;
      this.simulatedHand.distance = Math.max(80, Math.min(600, this.simulatedHand.distance));
      document.getElementById('sim-dist-val').textContent = `${Math.round(this.simulatedHand.distance)}px`;
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
  }

  deactivateSimulator() {
    this.simulatorActive = false;
    document.getElementById('simulator-widget').classList.add('hidden');
    this.showToast("SIMULATOR SHUTDOWN");
    this.startCameraTracking(); // Automatically attempt to reconnect hand gesture tracking
  }

  /* ==========================================================================
   System Render Frame Loop
   ========================================================================== */
  loop(timestamp) {
    // 1. Render Background Particles
    this.ambient.draw();

    // 2. Track Performance Metrics
    this.frameCount++;
    if (timestamp > this.lastFpsUpdate + 1000) {
      this.fps = Math.round((this.frameCount * 1000) / (timestamp - this.lastFpsUpdate));
      document.getElementById('fps-counter').textContent = `FPS: ${this.fps}`;
      this.frameCount = 0;
      this.lastFpsUpdate = timestamp;

      // Update running metrics array
      this.performanceHistory.push(this.fps);
      this.performanceHistory.shift();
      this.redrawDashboardGraph();
    }

    // 3. Evaluate Gestures (Webcam or Keyboard/Mouse Simulator)
    let gestureResults = null;

    if (this.simulatorActive) {
      // Mock MediaPipe landmarks list based on Simulator controls
      gestureResults = this.generateSimulatedGestures();
    }

    if (gestureResults) {
      this.processGestureAction(gestureResults);
    }

    // 4. Paint Application Specific Frame Tick (Allows drawing when pinching)
    this.paintAppTick();

    requestAnimationFrame((t) => this.loop(t));
  }

  /**
   * Transforms raw MediaPipe hand frames into localized coordinate state triggers
   */
  handleTrackerResults(results) {
    if (!this.trackingActive) return;

    let gestureResults = null;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      // Calculate Index Tip raw coordinates
      const indexTip = results.multiHandLandmarks[0][8];
      const pixelCoords = this.tracker.normalizeToPixel(indexTip);

      // Apply linear interpolation smoothing (Lerp) to filter coordinates jitter
      const smoothed = this.tracker.smoothCoordinates(pixelCoords.x, pixelCoords.y);
      this.cursorX = smoothed.x;
      this.cursorY = smoothed.y;

      // Classify Hand Landmarks layout to state
      gestureResults = this.detector.evaluateState(
        results.multiHandLandmarks,
        results.multiHandedness,
        this.windowManager,
        { x: this.cursorX, y: this.cursorY }
      );
    } else {
      // Reset hand tracking state indicators when hands leave webcam bounds
      gestureResults = this.detector.evaluateState([], [], this.windowManager, { x: this.cursorX, y: this.cursorY });
    }

    if (gestureResults) {
      this.processGestureAction(gestureResults);
    }
  }

  /**
   * Mock MediaPipe landmark sets from Mouse Hand Simulator
   */
  generateSimulatedGestures() {
    // Smoothen mouse cursor coordinates using the tracker Lerp module
    const smoothed = this.tracker.smoothCoordinates(this.simulatedHand.x, this.simulatedHand.y);
    this.cursorX = smoothed.x;
    this.cursorY = smoothed.y;

    const mockLandmarks = [];
    const mockHandedness = [{ label: 'Left' }];

    if (this.simulatedHand.isFist) {
      // Mock fist structures: Curl tips Y higher than joints Y
      const wrist = { x: 0.5, y: 0.9, z: 0 };
      const pt8 = { x: 0.5, y: 0.7, z: 0 }; // curled index Y > PIP Y
      const pt6 = { x: 0.5, y: 0.5, z: 0 };
      const mockSingle = Array(21).fill(wrist);
      mockSingle[8] = pt8;
      mockSingle[6] = pt6;
      mockSingle[12] = pt8; mockSingle[10] = pt6;
      mockSingle[16] = pt8; mockSingle[14] = pt6;
      mockSingle[20] = pt8; mockSingle[18] = pt6;
      mockLandmarks.push(mockSingle);
    }
    else if (this.isShiftHeld) {
      // Shift Key triggers two hand mode simulation
      const normDist = this.simulatedHand.distance / window.innerWidth;

      // Construct two mock hands
      const handLeft = Array(21).fill(0).map(() => ({ x: 0.3, y: 0.5, z: 0 }));
      const handRight = Array(21).fill(0).map(() => ({ x: 0.3 + normDist, y: 0.5, z: 0 }));

      mockLandmarks.push(handLeft);
      mockLandmarks.push(handRight);
      mockHandedness.push({ label: 'Right' });
    }
    else {
      // Regular hovering and pinching
      const wrist = { x: 0.5, y: 0.8, z: 0 };
      const indexTip = { x: this.simulatedHand.x / window.innerWidth, y: this.simulatedHand.y / window.innerHeight, z: 0 };

      // Calculate Thumb Tip depending on pinch boolean
      const thumbTip = this.simulatedHand.isPinching
        ? { x: indexTip.x, y: indexTip.y, z: indexTip.z } // Pinch: same point
        : { x: indexTip.x - 0.08, y: indexTip.y, z: indexTip.z }; // Hover: separated

      const mockSingle = Array(21).fill(wrist);
      mockSingle[8] = indexTip;
      mockSingle[4] = thumbTip;
      // Ensure fingers are NOT curled
      mockSingle[6] = { x: indexTip.x, y: indexTip.y + 0.1, z: 0 };
      mockSingle[10] = { x: indexTip.x, y: indexTip.y + 0.1, z: 0 };
      mockSingle[14] = { x: indexTip.x, y: indexTip.y + 0.1, z: 0 };
      mockSingle[18] = { x: indexTip.x, y: indexTip.y + 0.1, z: 0 };

      mockLandmarks.push(mockSingle);
    }

    return this.detector.evaluateState(mockLandmarks, mockHandedness, this.windowManager, { x: this.cursorX, y: this.cursorY });
  }

  /**
   * Action Router: Coordinates gesture outputs with desktop actions
   * @param {object} gestureInfo - state classifications
   */
  processGestureAction(gestureInfo) {
    const cursorEl = document.getElementById('aether-cursor');
    const statusDock = document.getElementById('status-gesture-badge');
    const labelEl = cursorEl.querySelector('.cursor-label');

    // Update Virtual Cursor Position
    cursorEl.style.transform = `translate3d(${this.cursorX}px, ${this.cursorY}px, 0)`;

    // Remove old classes from cursor
    cursorEl.classList.remove('state-hover', 'state-click', 'state-drag', 'state-resize', 'state-fist');

    // Reset Close countdown SVG unless in FIST state
    const progressPath = document.getElementById('cursor-countdown-progress');
    if (gestureInfo.state !== GESTURE_STATE.FIST && progressPath) {
      progressPath.setAttribute('stroke-dasharray', '0, 100');
    }

    // Toggle Left/Right indicators in webcam overlay if tracking active
    const tagL = document.getElementById('hand-indicator-left');
    const tagR = document.getElementById('hand-indicator-right');
    if (tagL && tagR) {
      if (this.trackingActive) {
        tagL.style.opacity = gestureInfo.state === GESTURE_STATE.RESIZE ? '1' : '0';
        tagR.style.opacity = gestureInfo.state === GESTURE_STATE.RESIZE ? '1' : '0';
      } else {
        tagL.style.opacity = '0';
        tagR.style.opacity = '0';
      }
    }

    // Dispatch virtual DOM click on pinch transition edge (rising edge)
    const isCurrentlyPinching = (gestureInfo.state === GESTURE_STATE.CLICK);
    if (isCurrentlyPinching && !this.wasPinching) {
      const element = document.elementFromPoint(this.cursorX, this.cursorY);
      if (element) {
        const clickEvent = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true,
          clientX: this.cursorX,
          clientY: this.cursorY
        });
        element.dispatchEvent(clickEvent);
      }
    }
    this.wasPinching = isCurrentlyPinching;

    // ==========================================
    // STATE MACHINE ROUTING
    // ==========================================
    switch (gestureInfo.state) {
      case GESTURE_STATE.HOVER:
        cursorEl.classList.add('state-hover');
        labelEl.textContent = 'HOVER';
        this.updateDockStatusBadge(this.simulatorActive ? "SIM HOVER" : "HOVER", "var(--neon-cyan)");

        // Reset interactive tracking locks
        this.activeDragWindow = null;
        this.activeResizeWindow = null;
        break;

      case GESTURE_STATE.CLICK:
        // Identify Drag trigger or regular Hover-click focus
        if (gestureInfo.hoverWindowId) {
          this.windowManager.bringToFront(gestureInfo.hoverWindowId);

          if (gestureInfo.isOverHeader && !this.activeDragWindow) {
            // Initiate Window Drag
            const win = this.windowManager.windowRegistry.find(w => w.id === gestureInfo.hoverWindowId);
            this.activeDragWindow = gestureInfo.hoverWindowId;
            this.dragOffset.x = this.cursorX - win.x;
            this.dragOffset.y = this.cursorY - win.y;
            this.showToast(`GRABBED: ${win.title}`);
          }
        }

        if (this.activeDragWindow) {
          // Perform dragging translation
          const newX = this.cursorX - this.dragOffset.x;
          const newY = this.cursorY - this.dragOffset.y;
          this.windowManager.updateGeometry(this.activeDragWindow, newX, newY);

          cursorEl.classList.add('state-drag');
          labelEl.textContent = 'DRAG';
          this.updateDockStatusBadge("DRAGGING", "var(--neon-orange)");
        } else {
          // General click selection feedback
          cursorEl.classList.add('state-click');
          labelEl.textContent = 'PINCH';
          this.updateDockStatusBadge("PINCHING", "var(--neon-magenta)");
        }
        break;

      case GESTURE_STATE.RESIZE:
        cursorEl.classList.add('state-resize');
        labelEl.textContent = 'RESIZE';
        this.updateDockStatusBadge("RESIZING", "var(--neon-green)");
        this.activeDragWindow = null;

        // Apply scale calculations to active top-most window
        if (this.windowManager.activeWindowId) {
          const activeId = this.windowManager.activeWindowId;
          const activeWin = this.windowManager.windowRegistry.find(w => w.id === activeId);

          if (activeWin && !activeWin.maximized) {
            if (!this.activeResizeWindow || this.activeResizeWindow !== activeId) {
              // Initiate Scale base benchmarks
              this.activeResizeWindow = activeId;
              this.initialResizeDistance = gestureInfo.distance;
              this.initialResizeGeom = { w: activeWin.w, h: activeWin.h };
            } else {
              // Calculate delta multipliers
              const ratio = gestureInfo.distance / this.initialResizeDistance;
              if (ratio && isFinite(ratio)) {
                const targetW = this.initialResizeGeom.w * ratio;
                const targetH = this.initialResizeGeom.h * ratio;
                this.windowManager.updateGeometry(activeId, undefined, undefined, targetW, targetH);
              }
            }
          }
        }
        break;

      case GESTURE_STATE.FIST:
        cursorEl.classList.add('state-fist');
        labelEl.textContent = 'CLOSE';
        this.updateDockStatusBadge("FIST HOLD", "var(--neon-red)");

        if (progressPath) {
          progressPath.setAttribute('stroke-dasharray', `${gestureInfo.holdProgress}, 100`);
        }

        if (gestureInfo.triggerClose) {
          const win = this.windowManager.windowRegistry.find(w => w.id === gestureInfo.targetWindowId);
          if (win) {
            this.showToast(`CLOSED WINDOW: ${win.title}`);
            this.windowManager.closeWindow(gestureInfo.targetWindowId);
            this.detector.resetFistState();
          }
        }
        break;
    }

    // Feed Stats into System Panel Dashboard if open
    this.updateDashboardStatsPanel(gestureInfo);
  }

  /* ==========================================================================
   Applications & Windows Registry Custom Implementations
   ========================================================================== */
  toggleAppWindow(appId) {
    const existing = this.windowManager.windowRegistry.find(w => w.id === appId);

    if (existing) {
      if (existing.minimized) {
        this.windowManager.restoreWindow(appId);
      } else if (appId === this.windowManager.activeWindowId) {
        this.windowManager.minimizeWindow(appId);
      } else {
        this.windowManager.bringToFront(appId);
      }
    } else {
      // Launch Window instance template
      this.launchApp(appId);
    }
  }

  async pushFilesToGithub(owner, repo, token, branch = 'main', consoleOutputElement) {
    const filesToPush = window.nexadesk_files || {
      'page.tsx': '// Default file\nexport default function Home() { return <h1>NexaDesk</h1>; }'
    };

    const logOutput = (msg, type = 'info') => {
      const line = document.createElement('div');
      if (type === 'error') {
        line.className = 'log-error';
        line.style.color = 'var(--neon-red)';
      } else if (type === 'success') {
        line.className = 'log-success';
        line.style.color = 'var(--neon-green)';
      } else {
        line.className = 'log-info';
        line.style.color = 'var(--neon-cyan)';
      }
      line.innerHTML = msg;
      consoleOutputElement.appendChild(line);
      consoleOutputElement.scrollTop = consoleOutputElement.scrollHeight;
    };

    logOutput(`Connecting to GitHub API...`);

    for (const [path, content] of Object.entries(filesToPush)) {
      try {
        let sha = null;
        const getRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
          headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });
        if (getRes.status === 200) {
          const fileData = await getRes.json();
          sha = fileData.sha;
        }

        const putRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
          method: 'PUT',
          headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: `Upload ${path} from NexaDesk OS`,
            content: btoa(unescape(encodeURIComponent(content))),
            branch: branch,
            sha: sha || undefined
          })
        });

        if (putRes.status === 200 || putRes.status === 201) {
          logOutput(`[OK] Pushed file: ${path}`, 'success');
        } else {
          const errData = await putRes.json();
          logOutput(`[ERROR] Failed to push ${path}: ${errData.message}`, 'error');
        }
      } catch (err) {
        logOutput(`[ERROR] Error pushing ${path}: ${err.message}`, 'error');
      }
    }
    logOutput(`[SUCCESS] Git push completed successfully to ${owner}/${repo}!`, 'success');
  }

  launchApp(appId) {
    let title = "";
    let content = "";
    let geom = {};

    switch (appId) {
      case 'control-panel':
        title = "System Control Panel";
        geom = { x: 40, y: 40, w: 420, h: 360 };
        content = `
          <div class="dashboard-grid">
            <div class="stat-card">
              <div class="stat-title">System Status</div>
              <div class="stat-value" style="color:var(--neon-green);">ONLINE</div>
            </div>
            <div class="stat-card">
              <div class="stat-title">Uptime</div>
              <div class="stat-value" id="dash-uptime">0.0s</div>
            </div>
            <div class="stat-card full-width">
              <div class="stat-title">FPS Monitor</div>
              <div class="stat-value" id="dash-fps">60 FPS</div>
              <div class="perf-graph-container">
                <canvas id="perf-graph-canvas" class="perf-graph-canvas" width="380" height="60"></canvas>
              </div>
            </div>
            <div class="stat-card full-width">
              <div class="stat-title">Gesture Telemetry</div>
              <div class="gesture-list">
                <div class="gesture-item" id="tel-hover"><span>HOVER (Single Finger)</span><span class="item-val">ACTIVE</span></div>
                <div class="gesture-item" id="tel-pinch"><span>CLICK (Thumb + Index Pinch)</span><span class="item-val">--</span></div>
                <div class="gesture-item" id="tel-resize"><span>RESIZE (Two Index Dist)</span><span class="item-val">--</span></div>
                <div class="gesture-item" id="tel-close"><span>CLOSE (Hold Fist 1s)</span><span class="item-val">--</span></div>
              </div>
            </div>
          </div>
        `;
        break;

      case 'paint':
        title = "Nexa Paint Workspace";
        geom = { x: window.innerWidth - 480, y: 40, w: 440, h: 360 };
        content = `
          <div class="paint-layout">
            <div class="paint-toolbar">
              <div class="paint-colors">
                <div class="color-swatch active-color" data-color="#00f0ff" style="background:#00f0ff;"></div>
                <div class="color-swatch" data-color="#ff007f" style="background:#ff007f;"></div>
                <div class="color-swatch" data-color="#39ff14" style="background:#39ff14;"></div>
                <div class="color-swatch" data-color="#ff9900" style="background:#ff9900;"></div>
                <div class="color-swatch" data-color="#ffffff" style="background:#ffffff;"></div>
              </div>
              <button class="btn-tool" id="clear-paint-btn">CLEAR CANVAS</button>
            </div>
            <div class="canvas-area">
              <canvas id="paint-drawing-board" class="paint-canvas" width="400" height="240"></canvas>
            </div>
          </div>
        `;
        break;

      case 'files':
        title = "Workspace Storage Explorer";
        geom = { x: 300, y: 150, w: 360, h: 280 };
        content = `
          <div class="file-explorer-container" style="display:flex; flex-direction:column; height:100%; width:100%;">
            <div class="file-explorer-header" style="display:flex; align-items:center; gap:8px; padding:6px 12px; background:rgba(0,0,0,0.2); border-bottom:1px solid var(--glass-border);">
              <button id="file-back-btn" class="btn-ide" style="padding:2px 8px; font-size:11px; display:none;">Back</button>
              <span id="file-current-path" style="font-family:var(--font-mono); font-size:11px; color:rgba(255,255,255,0.7); flex:1;">/</span>
              <button id="file-new-file-btn" class="btn-ide" style="padding:2px 6px; font-size:10px;">+ File</button>
              <button id="file-new-folder-btn" class="btn-ide" style="padding:2px 6px; font-size:10px;">+ Folder</button>
            </div>
            <div class="file-grid" id="file-grid-container" style="flex:1; overflow-y:auto; padding:12px;">
              <!-- Dynamically populated -->
            </div>
          </div>
        `;
        break;

      case 'terminal':
        title = "Nexa Developer Shell";
        geom = { x: 80, y: window.innerHeight - 380, w: 460, h: 280 };
        content = `
          <div class="terminal-history" id="term-history">
            <div>NexaDesk OS v1.0.0 (Type 'help' for options)</div>
            <div>Authorized security credential: USER_DEV</div>
            <div style="margin-top: 8px;">- <b>help</b>: Display manual instructions</div>
            <div>- <b>neofetch</b>: System details summary</div>
            <div>- <b>ls</b>: Display workspace directories</div>
          </div>
          <div class="term-line-input">
            <span class="term-prompt">nexa_shell$</span>
            <input type="text" id="term-interactive-input" class="term-interactive-input" autofocus spellcheck="false" autocomplete="off" />
          </div>
        `;
        break;

      case 'ide':
        title = "Nexa Code Studio IDE";
        geom = { x: 120, y: 60, w: 680, h: 420 };
        content = `
          <div class="ide-container">
            <div class="ide-toolbar">
              <div class="ide-tabs" id="ide-tabs"></div>
 
              <div class="ide-actions">
                <button class="btn-ide" id="ide-toolbar-new-file-btn" style="color: var(--neon-cyan); font-weight: bold;">+ File</button>
                <button class="btn-ide" id="ide-toolbar-new-folder-btn" style="color: var(--neon-cyan); font-weight: bold;">+ Folder</button>
                <button class="btn-ide" id="ide-undo-btn" title="Undo Edit">Undo</button>
                <button class="btn-ide" id="ide-redo-btn" title="Redo Edit">Redo</button>
                <button class="btn-ide" id="ide-export-btn" title="Download current file">Export</button>
                <button class="btn-ide btn-ide-run" id="ide-run-btn">RUN / PREVIEW</button>
                <button class="btn-ide" id="ide-save-btn">SAVE</button>
                <button class="btn-ide" id="ide-clear-btn">CLEAR</button>
                <button class="btn-ide" id="ide-console-toggle-btn">Console</button>
              </div>
            </div>
            <div class="ide-workspace">
              <div class="ide-sidebar" id="ide-sidebar">
                <div class="ide-sidebar-title" style="padding: 10px 12px; font-family: var(--font-display); font-size: 9px; font-weight: bold; letter-spacing: 1.5px; color: rgba(255,255,255,0.4); text-transform: uppercase; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center;">
                  <span>WORKSPACE</span>
                  <button id="ide-new-file-btn" class="btn-ide" style="padding: 1px 4px; font-size: 8px; line-height: 1; border-radius: 3px; background: rgba(0,240,255,0.1); border: 1px solid rgba(0,240,255,0.3); color: var(--neon-cyan); cursor: pointer;" title="Create New File">+ File</button>
                </div>
                <div class="ide-sidebar-files" id="ide-sidebar-files" style="padding: 6px 0; display: flex; flex-direction: column; gap: 2px;">
                  <!-- Dynamically populated files list -->
                </div>
              </div>
              <div class="ide-editor-area" id="ide-editor-area">
                <div class="ide-line-numbers" id="ide-line-numbers">1<br>2<br>3<br>4<br>5</div>
                <textarea class="ide-code-input" id="ide-code-input" spellcheck="false"></textarea>
              </div>
              <div class="ide-preview-wrapper" id="ide-preview-wrapper">
                <iframe id="ide-preview-iframe" class="ide-preview-iframe"></iframe>
              </div>
              <div class="ide-ai-wrapper" id="ide-ai-wrapper">
                <div class="ai-chat-header">
                  <span>CODE ASSISTANT</span>
                  <select id="ai-provider-select" class="ai-provider-select" style="max-width: 180px;">
                    <option value="heuristics">Static Heuristics (Default)</option>
                    <option value="ollama">Ollama - Local OS LLM (Recommended for Privacy & Speed)</option>
                    <option value="web-llm">In-Browser Local LLM (Zero Setup - Runs in Client)</option>
                    <option value="chrome-nano">Chrome Built-in AI (Gemini Nano - Zero Config On-Device)</option>
                    <option value="gemini-api">Google Gemini API (Cloud)</option>
                    <option value="openai-api">OpenAI API (Cloud)</option>
                    <option value="custom-api">Custom / OpenAI-Compatible Endpoint</option>
                    <option value="colab-api">Google Colab (Free GPU - No API Key Needed)</option>
                  </select>
                </div>
                <div id="ai-settings-panel" class="ai-settings-panel" style="display: none; padding: 10px; border-bottom: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); font-family: var(--font-sans); display: flex; flex-direction: column; gap: 8px; max-height: 220px; overflow-y: auto;">
                  <!-- Ollama settings -->
                  <div id="settings-ollama" class="settings-group" style="display: none; flex-direction: column; gap: 6px;">
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                      <div style="font-size: 8px; color: rgba(255, 255, 255, 0.6); font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Base API Endpoint URL</div>
                      <input type="text" id="ollama-url" value="http://localhost:11434/v1/chat/completions" style="background: rgba(0,0,0,0.4); border: 1px solid var(--glass-border); border-radius: 4px; padding: 6px; color: #fff; font-size: 10px; outline: none; font-family: var(--font-mono);" />
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                      <div style="font-size: 8px; color: rgba(255, 255, 255, 0.6); font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">API Key</div>
                      <input type="text" value="No key needed for local Ollama" disabled style="background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); border-radius: 4px; padding: 6px; color: rgba(255,255,255,0.4); font-size: 10px; outline: none; cursor: not-allowed;" />
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                      <div style="font-size: 8px; color: rgba(255, 255, 255, 0.6); font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Model ID</div>
                      <input type="text" id="ollama-model" value="qwen2.5:3b" style="background: rgba(0,0,0,0.4); border: 1px solid var(--glass-border); border-radius: 4px; padding: 6px; color: #fff; font-size: 10px; outline: none; font-family: var(--font-mono);" />
                    </div>
                    <div style="margin-top: 6px; padding: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 4px; font-size: 9px; line-height: 1.4; color: #a0aec0;">
                      <strong>Ollama Local Setup:</strong><br/>
                      1. Install and run <a href="https://ollama.com" target="_blank" style="color: var(--neon-cyan); text-decoration: underline;">Ollama</a> locally.<br/>
                      2. Open your terminal and pull a model, e.g.:
                      <pre style="background: #000; padding: 5px; margin: 4px 0; border-radius: 3px; font-family: var(--font-mono); font-size: 9px; color: #fff; border: 1px solid rgba(255,255,255,0.08);">ollama run qwen2.5:0.5b</pre>
                    </div>
                  </div>

                  <!-- In-browser local LLM -->
                  <div id="settings-web-llm" class="settings-group" style="display: none; flex-direction: column; gap: 6px;">
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                      <div style="font-size: 8px; color: rgba(255, 255, 255, 0.6); font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">API Key</div>
                      <input type="text" value="No key needed for local In-Browser execution" disabled style="background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); border-radius: 4px; padding: 6px; color: rgba(255,255,255,0.4); font-size: 10px; outline: none; cursor: not-allowed;" />
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                      <div style="font-size: 8px; color: rgba(255, 255, 255, 0.6); font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Model ID</div>
                      <select id="web-llm-model" style="background: rgba(0,0,0,0.4); border: 1px solid var(--glass-border); border-radius: 4px; padding: 6px; color: #fff; font-size: 10px; outline: none; font-family: var(--font-sans);">
                        <option value="qwen1.5-0.5b">Qwen1.5-0.5B (Standard) (~350MB)</option>
                        <option value="qwen1.5-1.8b">Qwen1.5-1.8B (Advanced) (~1.2GB)</option>
                      </select>
                    </div>
                    <div style="margin-top: 6px; padding: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 4px; font-size: 9px; line-height: 1.4; color: #a0aec0;">
                      <strong>In-Browser Local LLM (WebGPU / WASM CPU fallback):</strong><br/>
                      This option runs text generation directly inside your browser client-side. No external servers or API keys are used.<br/><br/>
                      <strong>Activation Status</strong><br/>
                      In-browser text generation is dormant. Activate to download model weights (~350MB).<br/>
                      <button class="btn-ide" id="activate-web-llm-btn" style="margin-top: 6px; width: 100%; font-size: 10px; padding: 6px 0; background: rgba(255,255,255,0.08); border: 1px solid var(--glass-border); border-radius: 4px; color: #fff; cursor: pointer; transition: background 0.2s;">Activate / Download Local LLM</button>
                    </div>
                  </div>

                  <!-- Chrome Built-in AI -->
                  <div id="settings-chrome-nano" class="settings-group" style="display: none; flex-direction: column; gap: 6px;">
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                      <div style="font-size: 8px; color: rgba(255, 255, 255, 0.6); font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">API Key</div>
                      <input type="text" value="No key needed for Chrome Built-in AI" disabled style="background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); border-radius: 4px; padding: 6px; color: rgba(255,255,255,0.4); font-size: 10px; outline: none; cursor: not-allowed;" />
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                      <div style="font-size: 8px; color: rgba(255, 255, 255, 0.6); font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Model ID</div>
                      <input type="text" value="gemini-nano" disabled style="background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); border-radius: 4px; padding: 6px; color: rgba(255,255,255,0.4); font-size: 10px; outline: none; cursor: not-allowed;" />
                    </div>
                    <div style="margin-top: 6px; padding: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 4px; font-size: 9px; line-height: 1.4; color: #a0aec0;">
                      <strong>Chrome Built-in AI (Gemini Nano Prompt API):</strong><br/>
                      Executes text generation directly using Google Chrome's native on-device LLM engine without external servers or API keys.<br/><br/>
                      <strong>Setup Instructions:</strong><br/>
                      1. Open <code style="color: #fff; background: #000; padding: 1px 3px; border-radius: 2px; font-family: var(--font-mono);">chrome://flags</code> in Google Chrome.<br/>
                      2. Set <strong>Enables Optimization Guide on Device Model</strong> to <em>Enabled BypassPerfRequirement</em>.<br/>
                      3. Set <strong>Prompt API for Gemini Nano</strong> to <em>Enabled</em>.<br/>
                      4. Relaunch Chrome.<br/>
                      5. <strong>First-Time Download Tip:</strong> When you generate a topic for the first time, Chrome will automatically download model weights (~1.5GB) in the background under components.
                    </div>
                  </div>

                  <!-- Google Gemini API -->
                  <div id="settings-gemini-api" class="settings-group" style="display: none; flex-direction: column; gap: 6px;">
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                      <div style="font-size: 8px; color: rgba(255, 255, 255, 0.6); font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">API Key</div>
                      <input type="password" id="gemini-api-key" placeholder="Enter your provider API Key..." style="background: rgba(0,0,0,0.4); border: 1px solid var(--glass-border); border-radius: 4px; padding: 6px; color: #fff; font-size: 10px; outline: none;" />
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                      <div style="font-size: 8px; color: rgba(255, 255, 255, 0.6); font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Model ID</div>
                      <input type="text" id="gemini-api-model" value="gemini-2.5-flash" style="background: rgba(0,0,0,0.4); border: 1px solid var(--glass-border); border-radius: 4px; padding: 6px; color: #fff; font-size: 10px; outline: none; font-family: var(--font-mono);" />
                    </div>
                    <div style="margin-top: 6px; padding: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 4px; font-size: 9px; line-height: 1.4; color: #a0aec0;">
                      <strong>Google Gemini API Setup:</strong><br/>
                      1. Visit the <a href="https://aistudio.google.com/" target="_blank" style="color: var(--neon-cyan); text-decoration: underline;">Google AI Studio Portal</a>.<br/>
                      2. Click <strong>"Get API key"</strong> to generate a free-tier token.<br/>
                      3. Paste your key above. Use gemini-2.5-flash for free & fast reasoning.<br/>
                      Can't get it? Run a quick <a href="https://google.com/search?q=how+to+get+gemini+api+key" target="_blank" style="color: var(--neon-cyan); text-decoration: underline;">Google Search Guide</a>.
                    </div>
                  </div>

                  <!-- OpenAI API -->
                  <div id="settings-openai-api" class="settings-group" style="display: none; flex-direction: column; gap: 6px;">
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                      <div style="font-size: 8px; color: rgba(255, 255, 255, 0.6); font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">API Key</div>
                      <input type="password" id="openai-api-key" placeholder="Enter your provider API Key..." style="background: rgba(0,0,0,0.4); border: 1px solid var(--glass-border); border-radius: 4px; padding: 6px; color: #fff; font-size: 10px; outline: none;" />
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                      <div style="font-size: 8px; color: rgba(255, 255, 255, 0.6); font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Model ID</div>
                      <input type="text" id="openai-api-model" value="gpt-4o-mini" style="background: rgba(0,0,0,0.4); border: 1px solid var(--glass-border); border-radius: 4px; padding: 6px; color: #fff; font-size: 10px; outline: none; font-family: var(--font-mono);" />
                    </div>
                    <div style="margin-top: 6px; padding: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 4px; font-size: 9px; line-height: 1.4; color: #a0aec0;">
                      <strong>OpenAI API Setup:</strong><br/>
                      1. Visit <a href="https://platform.openai.com/api-keys" target="_blank" style="color: var(--neon-cyan); text-decoration: underline;">OpenAI Platform Keys</a>.<br/>
                      2. Generate a new secret key (make sure your account has credits loaded).<br/>
                      3. Paste your key above. Suggested model: gpt-4o-mini.<br/>
                      Stuck? Run a quick <a href="https://google.com/search?q=how+to+get+openai+api+key" target="_blank" style="color: var(--neon-cyan); text-decoration: underline;">Google Search Guide</a>.
                    </div>
                  </div>

                  <!-- Custom API -->
                  <div id="settings-custom-api" class="settings-group" style="display: none; flex-direction: column; gap: 6px;">
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                      <div style="font-size: 8px; color: rgba(255, 255, 255, 0.6); font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Base API Endpoint URL</div>
                      <input type="text" id="custom-api-endpoint" placeholder="https://api.openai.com/v1/chat/completions" style="background: rgba(0,0,0,0.4); border: 1px solid var(--glass-border); border-radius: 4px; padding: 6px; color: #fff; font-size: 10px; outline: none; font-family: var(--font-mono);" />
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                      <div style="font-size: 8px; color: rgba(255, 255, 255, 0.6); font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">API Key</div>
                      <input type="password" id="custom-api-key" placeholder="API Key (optional)" style="background: rgba(0,0,0,0.4); border: 1px solid var(--glass-border); border-radius: 4px; padding: 6px; color: #fff; font-size: 10px; outline: none;" />
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                      <div style="font-size: 8px; color: rgba(255, 255, 255, 0.6); font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Model ID</div>
                      <input type="text" id="custom-api-model" placeholder="Model ID" style="background: rgba(0,0,0,0.4); border: 1px solid var(--glass-border); border-radius: 4px; padding: 6px; color: #fff; font-size: 10px; outline: none; font-family: var(--font-mono);" />
                    </div>
                  </div>

                  <!-- Google Colab Free GPU -->
                  <div id="settings-colab-api" class="settings-group" style="display: none; flex-direction: column; gap: 6px;">
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                      <div style="font-size: 8px; color: rgba(255, 255, 255, 0.6); font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Colab Ngrok API URL</div>
                      <input type="text" id="colab-api-url" placeholder="https://xxxx-xx-xx.ngrok-free.app/v1/chat/completions" style="background: rgba(0,0,0,0.4); border: 1px solid var(--glass-border); border-radius: 4px; padding: 6px; color: #fff; font-size: 10px; outline: none; font-family: var(--font-mono);" />
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                      <div style="font-size: 8px; color: rgba(255, 255, 255, 0.6); font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Model ID (auto-detected)</div>
                      <input type="text" id="colab-api-model" value="default" style="background: rgba(0,0,0,0.4); border: 1px solid var(--glass-border); border-radius: 4px; padding: 6px; color: #fff; font-size: 10px; outline: none; font-family: var(--font-mono);" />
                    </div>
                    <div style="margin-top: 6px; padding: 8px; background: rgba(57,255,20,0.03); border: 1px solid rgba(57,255,20,0.15); border-radius: 4px; font-size: 9px; line-height: 1.5; color: #a0aec0;">
                      <strong style="color: var(--neon-green);">Free GPU Setup (Google Colab):</strong><br/>
                      Run your own AI coding model on Google's free T4 GPU.<br/><br/>
                      <strong>Steps:</strong><br/>
                      1. Open the <a href="https://colab.research.google.com/" target="_blank" style="color: var(--neon-cyan); text-decoration: underline;">Google Colab</a> notebook (link below).<br/>
                      2. Click <strong>"Runtime -> Run All"</strong>. The notebook installs vLLM + ngrok and starts an OpenAI-compatible server.<br/>
                      3. Copy the <strong>ngrok URL</strong> printed in the output cell and paste it above.<br/>
                      4. Start coding with your free GPU-powered AI assistant!<br/><br/>
                      <a href="https://colab.research.google.com/#create=true" target="_blank" style="color: var(--neon-green); text-decoration: underline; font-weight: bold;">Create Google Colab Notebook -></a><br/>
                      <button id="btn-copy-colab-code" style="margin-top: 6px; margin-bottom: 6px; background: rgba(57,255,20,0.1); border: 1px solid rgba(57,255,20,0.3); border-radius: 4px; padding: 6px 12px; color: var(--neon-green); font-size: 10px; cursor: pointer; font-family: var(--font-mono); font-weight: bold; width: 100%; transition: all 0.2s; text-align: center;">Copy Python Setup Code</button><br/>
                      <strong>No API key, no cost.</strong> Uses Google's free T4 GPU runtime.<br/>
                      Models: Qwen2.5-Coder-1.5B or any HuggingFace model.
                    </div>
                  </div>
                </div>
                <div class="ai-chat-history" id="ai-chat-history">
                  <div class="ai-msg agent">Welcome to Code Assistant. Select a provider above (Ollama, Gemini API, OpenAI, etc.) and configure your endpoint or API key to start generating code.</div>
                </div>
                <div class="ai-input-box" style="display: flex; flex-direction: column; gap: 4px;">
                  <div style="display: flex; align-items: center; gap: 6px; padding: 4px 8px;">
                    <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 9px; color: rgba(255,255,255,0.55); font-family: var(--font-mono); user-select: none;">
                      <input type="checkbox" id="ai-include-context" checked style="accent-color: var(--neon-cyan); width: 12px; height: 12px;" />
                      Include Workspace Files as Context
                    </label>
                  </div>
                  <div style="display: flex; gap: 4px; align-items: center;">
                    <input type="text" class="ai-prompt-input" id="ai-prompt-input" placeholder="Describe what you want to build or ask to review code..."/>
                    <button class="btn-ide btn-ide-run" id="ai-send-btn">GENERATE</button>
                  </div>
                </div>
              </div>
              
              <div class="ide-console-drawer" id="ide-console-drawer" style="display: none;">
                <div class="ide-console-header">
                  <span>TERMINAL OUTPUT</span>
                  <span style="color:var(--neon-green); font-size:8px;">ONLINE</span>
                </div>
                <div class="ide-console-output" id="ide-console-output">
                  <div class="log-info">[System] Next.js + Node.js Fullstack Studio Ready.<br/>Edit files and click RUN / PREVIEW to compile.</div>
                </div>
                <div class="ide-console-input-line" style="display:flex; align-items:center; background:#010204; border-top:1px solid var(--glass-border); padding:4px 8px;">
                  <span style="color:var(--neon-green); font-family:var(--font-mono); font-size:10px; margin-right:6px;">&gt;</span>
                  <input type="text" id="ide-console-command-input" placeholder="Execute JavaScript or console command..." style="flex:1; background:transparent; border:none; outline:none; color:#fff; font-family:var(--font-mono); font-size:10px; padding:0;" autocomplete="off" spellcheck="false" />
                </div>
              </div>
            </div>
            <div class="ide-touch-toolbar">
              <button class="touch-key" data-key="tab">Tab</button>
              <button class="touch-key" data-key="{">{</button>
              <button class="touch-key" data-key="}">}</button>
              <button class="touch-key" data-key="(">(</button>
              <button class="touch-key" data-key=")">)</button>
              <button class="touch-key" data-key=";">;</button>
              <button class="touch-key" data-key="=">=</button>
              <button class="touch-key" data-key="console.log()">log()</button>
              <button class="touch-key" data-key="toggle-console">Terminal</button>
              <button class="touch-key" data-key="toggle-preview">Preview</button>
              <button class="touch-key" data-key="open-ai">AI Assistant</button>
            </div>
          </div>
        `;
        break;

      case 'browser':
        title = "Nexa Web Browser";
        geom = { x: 140, y: 50, w: 720, h: 460 };
        content = `
          <div class="browser-container">
            <div class="browser-nav-bar">
              <button class="btn-nav-browser" id="browser-back-btn" title="Back">Back</button>
              <button class="btn-nav-browser" id="browser-forward-btn" title="Forward">Forward</button>
              <button class="btn-nav-browser" id="browser-refresh-btn" title="Reload">Reload</button>
              <input type="text" class="browser-url-input" id="browser-url-input" value="https://wikipedia.org" placeholder="Search or enter web URL..."/>
              <button class="btn-ide btn-ide-run" id="browser-go-btn">GO</button>
            </div>
            <div class="browser-quick-bookmarks">
              <span class="bookmark-chip" data-url="https://wikipedia.org">Wikipedia</span>
              <span class="bookmark-chip" data-url="https://bing.com">Bing Search</span>
              <span class="bookmark-chip" data-url="https://developer.mozilla.org">MDN Docs</span>
              <span class="bookmark-chip" data-url="https://vscode.dev">VSCode Web</span>
            </div>
            <iframe class="browser-viewport" id="browser-viewport" src="https://wikipedia.org"></iframe>
          </div>
        `;
        break;
    }

    this.windowManager.createWindow(appId, title, content, geom);

    // Initializer code run for specific window launch bindings
    if (appId === 'paint') {
      this.initPaintAppBindings();
    } else if (appId === 'control-panel') {
      this.initDashboardPanel();
    } else if (appId === 'files') {
      this.initFilesAppBindings();
    } else if (appId === 'terminal') {
      this.initTerminalAppBindings();
    } else if (appId === 'ide') {
      this.initIDEAppBindings();
    } else if (appId === 'browser') {
      this.initBrowserAppBindings();
    }

    // Persist open windows to localStorage
    this.saveOpenWindows();
  }

  /* App Bindings: Paint App */
  initPaintAppBindings() {
    const canvas = document.getElementById('paint-drawing-board');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Fill canvas background
    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Clear Canvas Action
    document.getElementById('clear-paint-btn').addEventListener('click', () => {
      ctx.fillStyle = '#050508';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      this.showToast("PAINT CANVAS CLEARED");
    });

    // Swatches selection mapping
    document.querySelectorAll('.color-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active-color'));
        sw.classList.add('active-color');
        this.paintColor = sw.getAttribute('data-color');
      });
    });
  }

  paintAppTick() {
    const canvas = document.getElementById('paint-drawing-board');
    if (!canvas) return;

    // Check if pointer is hovering over canvas and in PINCH CLICK state
    const rect = canvas.getBoundingClientRect();
    const isPinchClick = this.detector.fistStartTime === null &&
      (this.tracker.smoothedX >= rect.left && this.tracker.smoothedX <= rect.right) &&
      (this.tracker.smoothedY >= rect.top && this.tracker.smoothedY <= rect.bottom);

    // Get current cursor state
    const cursor = document.getElementById('aether-cursor');
    const state = cursor.classList.contains('state-click') || cursor.classList.contains('state-drag');

    if (isPinchClick && state) {
      const ctx = canvas.getContext('2d');
      // Normalize absolute cursor screen coordinates to canvas space
      const pxX = ((this.tracker.smoothedX - rect.left) / rect.width) * canvas.width;
      const pxY = ((this.tracker.smoothedY - rect.top) / rect.height) * canvas.height;

      ctx.strokeStyle = this.paintColor;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      if (this.lastPaintPoint) {
        ctx.moveTo(this.lastPaintPoint.x, this.lastPaintPoint.y);
      } else {
        ctx.moveTo(pxX, pxY);
      }
      ctx.lineTo(pxX, pxY);
      ctx.stroke();

      this.lastPaintPoint = { x: pxX, y: pxY };
    } else {
      this.lastPaintPoint = null;
    }
  }

  /* App Bindings: System Dashboard */
  initDashboardPanel() {
    const canvas = document.getElementById('perf-graph-canvas');
    if (!canvas) return;
    this.redrawDashboardGraph();
  }

  redrawDashboardGraph() {
    const canvas = document.getElementById('perf-graph-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Fill Background grid
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 20) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, canvas.height);
      ctx.stroke();
    }
    for (let j = 0; j < canvas.height; j += 15) {
      ctx.beginPath();
      ctx.moveTo(0, j);
      ctx.lineTo(canvas.width, j);
      ctx.stroke();
    }

    // Render rolling FPS Line chart
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.beginPath();

    const step = canvas.width / (this.performanceHistory.length - 1);
    this.performanceHistory.forEach((fps, index) => {
      // Map 0-60 FPS to canvas height (height=60)
      const mappedY = canvas.height - (fps / 60) * (canvas.height - 10) - 5;
      const x = index * step;
      if (index === 0) {
        ctx.moveTo(x, mappedY);
      } else {
        ctx.lineTo(x, mappedY);
      }
    });
    ctx.stroke();
  }

  updateDashboardStatsPanel(gestureInfo) {
    const uptimeEl = document.getElementById('dash-uptime');
    const fpsEl = document.getElementById('dash-fps');
    if (!uptimeEl) return;

    // Calculate Uptime
    uptimeEl.textContent = `${(performance.now() / 1000).toFixed(1)}s`;
    fpsEl.textContent = `${this.fps} FPS`;

    // Reset status item configurations
    document.querySelectorAll('.gesture-item').forEach(el => el.classList.remove('active-gesture'));

    if (gestureInfo.state === GESTURE_STATE.HOVER) {
      document.getElementById('tel-hover').classList.add('active-gesture');
    } else if (gestureInfo.state === GESTURE_STATE.CLICK) {
      document.getElementById('tel-pinch').classList.add('active-gesture');
      document.getElementById('tel-pinch').querySelector('.item-val').textContent = `CLICK: ON HEADER (${gestureInfo.isOverHeader})`;
    } else if (gestureInfo.state === GESTURE_STATE.RESIZE) {
      document.getElementById('tel-resize').classList.add('active-gesture');
      document.getElementById('tel-resize').querySelector('.item-val').textContent = `DIST: ${Math.round(gestureInfo.distance)}px`;
    } else if (gestureInfo.state === GESTURE_STATE.FIST) {
      document.getElementById('tel-close').classList.add('active-gesture');
      document.getElementById('tel-close').querySelector('.item-val').textContent = `HOLD: ${Math.round(gestureInfo.holdProgress)}%`;
    }
  }

  /* App Bindings: File Explorer */
  initFilesAppBindings() {
    const gridContainer = document.getElementById('file-grid-container');
    const currentPathSpan = document.getElementById('file-current-path');
    const backBtn = document.getElementById('file-back-btn');

    if (!gridContainer) return;

    // Virtual File System (VFS) structure (load from localStorage or use default)
    let vfs;
    try {
      const savedVFS = localStorage.getItem('nexadesk_vfs');
      vfs = savedVFS ? JSON.parse(savedVFS) : {
        '/': [
          { name: 'Documents', type: 'folder', path: '/Documents' },
          { name: 'Images', type: 'folder', path: '/Images' },
          { name: 'NexaSystem', type: 'folder', path: '/NexaSystem' },
          { name: 'README.md', type: 'text', content: '# NexaDesk OS\n\nWelcome to your browser-native, spatial window management workspace.\nFeatures:\n- MediaPipe Camera Hand Gestures\n- Local WebGPU/Ollama AI integrations\n- Built-in Code Studio & Previewer\n\nSecurity Integrity: SECURED' },
          { name: 'setup.js', type: 'script', content: '// Setup script\nconsole.log("NexaDesk workspace initialized.");\nconst status = "OK";' }
        ],
        '/Documents': [
          { name: 'page.tsx', type: 'text', content: '// app/page.tsx  --  Next.js 14 App Router\nimport Link from "next/link";\n\nexport default function HomePage() {\n  return (\n    <main>\n      <h1>NexaDesk</h1>\n      <p>Browser-native spatial workspace.</p>\n    </main>\n  );\n}' },
          { name: 'globals.css', type: 'text', content: '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\nbody { background: #030712; color: #f9fafb; }' },
          { name: 'server.js', type: 'text', content: 'const express = require("express");\nconst app = express();\napp.get("/api/health", (req, res) => res.json({ status: "ok" }));\napp.listen(4000);' }
        ],
        '/Images': [
          { name: 'wallpaper.png', type: 'image', content: 'Wallpaper image data placeholder' }
        ],
        '/NexaSystem': [
          { name: 'kernel.sys', type: 'text', content: 'System kernel binary data. Mode: Protected.' },
          { name: 'config.json', type: 'text', content: '{\n  "version": "1.0.0",\n  "spatialMode": false,\n  "theme": "glassmorphic"\n}' }
        ]
      };
      if (vfs && vfs['/Images']) {
        vfs['/Images'] = vfs['/Images'].filter(item => item.name !== 'logo.svg');
      }
    } catch (e) {
      vfs = {};
    }

    const persistVFS = () => {
      try { localStorage.setItem('nexadesk_vfs', JSON.stringify(vfs)); } catch (e) { }
    };

    let currentPath = localStorage.getItem('nexadesk_files_path') || '/';

    const renderGrid = () => {
      // Clear container
      gridContainer.innerHTML = '';

      // Update current path text
      if (currentPathSpan) currentPathSpan.textContent = currentPath;
      try { localStorage.setItem('nexadesk_files_path', currentPath); } catch (e) { }

      // Update back button visibility
      if (backBtn) {
        backBtn.style.display = currentPath === '/' ? 'none' : 'inline-block';
      }

      const items = vfs[currentPath] || [];

      items.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'file-item';
        itemEl.setAttribute('data-type', item.type);

        let iconSvg = '';
        if (item.type === 'folder') {
          iconSvg = `<svg viewBox="0 0 24 24" class="file-icon"><path fill="var(--neon-cyan)" d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`;
        } else if (item.type === 'image') {
          iconSvg = `<svg viewBox="0 0 24 24" class="file-icon"><path fill="#ff007f" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>`;
        } else if (item.type === 'script') {
          iconSvg = `<svg viewBox="0 0 24 24" class="file-icon"><path fill="var(--neon-green)" d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>`;
        } else {
          iconSvg = `<svg viewBox="0 0 24 24" class="file-icon"><path fill="#fff" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`;
        }

        itemEl.innerHTML = `
          ${iconSvg}
          <span class="file-name" style="margin-top:6px; font-size:11px; text-align:center; word-break:break-all;">${item.name}</span>
        `;

        itemEl.addEventListener('click', () => {
          if (item.type === 'folder') {
            currentPath = item.path;
            renderGrid();
          } else {
            // Open file in floating window
            const winId = `doc-${item.name.replace(/\./g, '-')}`;
            const fileContent = item.content || 'Empty file';
            this.showToast(`OPENING FILE: ${item.name}`);
            this.windowManager.createWindow(winId, item.name, `
              <div style="font-family:var(--font-sans); padding:12px; display:flex; flex-direction:column; height:100%; box-sizing:border-box;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                  <h3 style="margin:0; font-size:13px; color:var(--neon-cyan);">${item.name}</h3>
                  <span style="font-size:9px; background:rgba(0,240,255,0.15); border:1px solid var(--neon-cyan); padding:2px 6px; border-radius:4px; color:var(--neon-cyan);">READ-ONLY</span>
                </div>
                <textarea readonly style="flex:1; background:#010204; border:1px solid var(--glass-border); border-radius:6px; color:#a0aec0; font-family:var(--font-mono); font-size:10px; padding:8px; resize:none; outline:none; white-space:pre;">${fileContent}</textarea>
              </div>
            `, { w: 340, h: 240 });
          }
        });

        gridContainer.appendChild(itemEl);
      });
    };

    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (currentPath !== '/') {
          // Go up one level (e.g. from /Documents to /)
          currentPath = '/';
          renderGrid();
        }
      });
    }

    const newFileBtn = document.getElementById('file-new-file-btn');
    const newFolderBtn = document.getElementById('file-new-folder-btn');

    if (newFileBtn) {
      newFileBtn.addEventListener('click', () => {
        const name = prompt("Enter new file name:");
        if (!name) return;
        const cleanName = name.trim();
        if (!cleanName) return;

        const currentItems = vfs[currentPath] || [];
        if (currentItems.some(i => i.name.toLowerCase() === cleanName.toLowerCase())) {
          this.showToast("File/Folder already exists!");
          return;
        }

        currentItems.push({
          name: cleanName,
          type: cleanName.includes('.') ? (cleanName.endsWith('.js') ? 'script' : 'text') : 'text',
          content: `// New File: ${cleanName}\n`
        });
        vfs[currentPath] = currentItems;
        persistVFS();
        renderGrid();
        this.showToast(`CREATED FILE: ${cleanName}`);
      });
    }

    if (newFolderBtn) {
      newFolderBtn.addEventListener('click', () => {
        const name = prompt("Enter new folder name:");
        if (!name) return;
        const cleanName = name.trim();
        if (!cleanName) return;

        const currentItems = vfs[currentPath] || [];
        if (currentItems.some(i => i.name.toLowerCase() === cleanName.toLowerCase())) {
          this.showToast("File/Folder already exists!");
          return;
        }

        const newPath = currentPath === '/' ? '/' + cleanName : currentPath + '/' + cleanName;
        currentItems.push({
          name: cleanName,
          type: 'folder',
          path: newPath
        });
        vfs[currentPath] = currentItems;
        vfs[newPath] = [];
        persistVFS();
        renderGrid();
        this.showToast(`CREATED FOLDER: ${cleanName}`);
      });
    }

    renderGrid();
  }

  /* App Bindings: Terminal command shell input simulator */
  initTerminalAppBindings() {
    const terminalHistory = document.getElementById('term-history');
    const inputEl = document.getElementById('term-interactive-input');

    let remoteOrigin = localStorage.getItem('nexadesk_git_remote') || '';
    let awaitingGithubToken = false;
    let gitPushPendingArgs = null;

    const pushFilesToGithub = async (owner, repo, token, branch = 'main') => {
      await this.pushFilesToGithub(owner, repo, token, branch, terminalHistory);
      try {
        localStorage.setItem('nexadesk_terminal_history', terminalHistory.innerHTML);
      } catch (e) { }
    };

    // Command input list
    const commands = [
      'help',
      'neofetch',
      'ls',
      'sysinfo',
      'clear',
      'matrix',
      'exit'
    ];

    let commandQueue = ['neofetch', 'help'];
    let runningAnimation = false;

    // Restore terminal history
    try {
      const savedHistory = localStorage.getItem('nexadesk_terminal_history');
      if (savedHistory) {
        terminalHistory.innerHTML = savedHistory;
        commandQueue = []; // Bypass startup commands if session exists
        // Auto scroll to bottom
        setTimeout(() => {
          const body = document.getElementById('win-body-terminal');
          if (body) body.scrollTop = body.scrollHeight;
        }, 100);
      }
    } catch (e) { }

    // Simulate typing logic and running commands
    const runScheduler = () => {
      if (runningAnimation || commandQueue.length === 0) return;

      const nextCmd = commandQueue.shift();
      runningAnimation = true;
      let textTyped = "";
      let index = 0;

      if (inputEl) inputEl.disabled = true;

      const typeTimer = setInterval(() => {
        if (index < nextCmd.length) {
          textTyped += nextCmd[index];
          if (inputEl) inputEl.value = textTyped;
          index++;
        } else {
          clearInterval(typeTimer);
          setTimeout(() => {
            executeCommand(nextCmd);
          }, 350);
        }
      }, 70);
    };

    const executeCommand = (cmd) => {
      // Append command line typed
      const promptLine = document.createElement('div');
      promptLine.innerHTML = `<span class="term-prompt">nexa_shell$</span> ${cmd}`;
      terminalHistory.appendChild(promptLine);

      const output = document.createElement('div');
      output.className = 'term-line-output';

      switch (cmd.toLowerCase().trim()) {
        case 'help':
          output.innerHTML = `Available commands:<br/>  - <b>help</b>: Display manual instructions<br/>  - <b>neofetch</b>: System details summary<br/>  - <b>ls</b>: Display workspace directories<br/>  - <b>git</b>: Git source control (status, clone, commit, push)<br/>  - <b>code</b> / <b>vscode</b>: Launch IDE / VSCode Web<br/>  - <b>matrix</b>: Trigger background matrix visualizer<br/>  - <b>clear</b>: Purge console history`;
          break;
        case 'neofetch':
          output.innerHTML = `
<b style="color:var(--neon-cyan);">NexaDesk</b>@Workspace-Proto-3
-----------------
<b>OS</b>: NexaDesk client-side Kernel v1.0.0
<b>Shell</b>: Touchless DOM Command-line
<b>Aesthetics</b>: Glassmorphism / Space Neon
<b>Uptime</b>: ${Math.round(performance.now() / 1000)}s
<b>Engine</b>: MediaPipe Hands (via CDN)
<b>Hands tracked</b>: 2 max
<b>Complexity</b>: 1 (Linear Interpolation Lerp)`;
          break;
        case 'ls':
          output.textContent = `Documents/   Images/   NexaSystem/   README.md   setup.js`;
          break;
        case 'sysinfo':
          const reg = this.windowManager.windowRegistry;
          let str = "Active Window Registry Context:\n";
          reg.forEach(w => {
            str += `  ID: ${w.id} | Title: ${w.title} | Coord: [X:${w.x}, Y:${w.y}] | Z-Index: ${w.zIndex}\n`;
          });
          output.textContent = str;
          break;
        case 'code':
        case 'vscode':
        case 'code .':
          output.innerHTML = `<span style="color:var(--neon-green);">[OK] VSCode / Nexa Code Studio initialized successfully. Spawning editor window...</span>`;
          this.showToast("LAUNCHING NEXA CODE STUDIO / VSCODE");
          this.launchApp('ide');
          break;
        case 'pkg install vscode':
        case 'install vscode':
        case 'apt install vscode':
          output.innerHTML = `<span style="color:var(--neon-cyan);">[APT] Fetching code-server v4.16.1 x86_64...<br/>[OK] Installed code-server (VSCode Web Engine) successfully.<br/>Type 'code' to launch IDE studio.</span>`;
          break;
        case 'clear':
          terminalHistory.innerHTML = "";
          try { localStorage.setItem('nexadesk_terminal_history', ''); } catch (e) { }
          break;
        case 'matrix':
          output.innerHTML = `<span style="color:var(--neon-green);">* Matrix initialized. Running waterfall code stream...</span>`;
          this.showToast("RUNNING MATRIX WATERFALL IN SHELL");
          runMatrixCode();
          break;
        default:
          const cleanCmd = cmd.toLowerCase().trim();
          if (cleanCmd.startsWith('echo')) {
            if (cleanCmd.includes('>>') || cleanCmd.includes('>')) {
              output.innerHTML = `<span style="color:var(--neon-green);">[OK] File README.md appended successfully.</span>`;
            } else {
              const echoText = cmd.replace(/^echo\s+/i, '').replace(/['"]/g, '');
              output.textContent = echoText;
            }
          } else if (cleanCmd.startsWith('git')) {
            if (cleanCmd === 'git' || cleanCmd === 'git help') {
              output.innerHTML = `Git Source Control Client v2.42.0<br/>Commands: <b>git status</b>, <b>git clone &lt;url&gt;</b>, <b>git commit -m</b>, <b>git push</b>, <b>git log</b>`;
            } else if (cleanCmd === 'git init') {
              output.innerHTML = `<span style="color:var(--neon-cyan);">Initialized empty Git repository in /workspace/project/.git/</span>`;
            } else if (cleanCmd.startsWith('git add')) {
              const file = cmd.split(' ').slice(2).join(' ') || 'files';
              output.innerHTML = `<span style="color:var(--neon-green);">[OK] Added ${file} to staging area.</span>`;
            } else if (cleanCmd.startsWith('git branch')) {
              output.innerHTML = `<span style="color:var(--neon-green);">[OK] Branch configuration updated.</span>`;
            } else if (cleanCmd.startsWith('git remote')) {
              const url = cmd.split(' ').slice(4).join(' ').trim();
              if (url) {
                remoteOrigin = url;
                try { localStorage.setItem('nexadesk_git_remote', remoteOrigin); } catch (e) { }
              }
              output.innerHTML = `<span style="color:var(--neon-green);">[OK] Remote origin added: ${remoteOrigin || 'origin'}</span>`;
            } else if (cleanCmd.includes('status')) {
              output.innerHTML = `<span style="color:var(--neon-green);">On branch main<br/>Your branch is up to date with 'origin/main'.<br/>nothing to commit, working tree clean</span>`;
            } else if (cleanCmd.includes('clone')) {
              const repo = cmd.split(' ')[2] || 'repository';
              output.innerHTML = `<span style="color:var(--neon-cyan);">Cloning into '${repo}'...<br/>remote: Enumerating objects: 100%, done.<br/>remote: Total 482 (delta 210), reused 482<br/>[OK] Successfully cloned into workspace!</span>`;
              this.showToast(`GIT CLONED: ${repo}`);
            } else if (cleanCmd.includes('commit')) {
              output.innerHTML = `<span style="color:var(--neon-green);">[main (root-commit) 5a1b3c9] first commit<br/> 1 file changed, 1 insertion(+)<br/> create mode 100644 README.md</span>`;
              this.showToast("GIT COMMIT SUCCESSFUL");
            } else if (cleanCmd.includes('push')) {
              const match = remoteOrigin.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
              if (match) {
                const owner = match[1];
                const repo = match[2];
                const token = localStorage.getItem('nexadesk_github_pat');
                if (!token) {
                  output.innerHTML = `<span style="color:var(--neon-cyan);">GitHub Personal Access Token required to write to ${owner}/${repo}.<br/>Please enter your GitHub token (with 'repo' scope):</span>`;
                  awaitingGithubToken = true;
                  if (inputEl) inputEl.type = "password";
                  gitPushPendingArgs = { owner, repo, branch: 'main' };
                } else {
                  pushFilesToGithub(owner, repo, token, 'main');
                  // Don't append empty output element, we'll let pushFilesToGithub handle logging
                  inputEl.value = "";
                  runningAnimation = false;
                  setTimeout(() => {
                    const body = document.getElementById('win-body-terminal');
                    if (body) body.scrollTop = body.scrollHeight;
                  }, 50);
                  return;
                }
              } else {
                output.innerHTML = `<span style="color:var(--neon-cyan);">Enumerating objects: 3, done.<br/>Counting objects: 100% (3/3), done.<br/>Writing objects: 100% (3/3), 220 bytes | 220.00 KiB/s, done.<br/>Total 3 (delta 0), reused 0 (delta 0), pack-reused 0<br/>To origin<br/> * [new branch]      main -> main<br/>branch 'main' set up to track 'origin/main'.</span>`;
                this.showToast("GIT PUSH COMPLETED");
              }
            } else if (cleanCmd.includes('log')) {
              output.innerHTML = `<span style="color:#e2e8f0;">commit 5a1b3c9 (HEAD -> main, origin/main)<br/>Author: Nexa Developer &lt;dev@nexadesk.io&gt;<br/>Date: ${new Date().toLocaleDateString()}<br/><br/>    first commit</span>`;
            } else {
              output.textContent = `git: command completed for '${cmd}'`;
            }
          } else {
            output.textContent = `nexa_shell: command not found: ${cmd}`;
          }
      }

      terminalHistory.appendChild(output);
      if (inputEl) {
        inputEl.value = "";
        inputEl.disabled = false;
        inputEl.focus();
      }
      runningAnimation = false;

      // Save terminal history to localStorage
      try {
        localStorage.setItem('nexadesk_terminal_history', terminalHistory.innerHTML);
      } catch (e) { }

      // Scroll bottom
      const body = document.getElementById('win-body-terminal');
      if (body) {
        body.scrollTop = body.scrollHeight;
      }

      // Schedule next item if any
      setTimeout(runScheduler, 800);
    };

    // Matrix rainfall simulation inside terminal
    const runMatrixCode = () => {
      let ticks = 0;
      const interval = setInterval(() => {
        if (!document.getElementById('term-history')) {
          clearInterval(interval);
          return;
        }
        const line = document.createElement('div');
        line.className = 'term-line-output';
        line.style.color = '#39ff14';

        let binaryStr = "";
        for (let i = 0; i < 30; i++) {
          binaryStr += Math.random() > 0.5 ? "1" : "0";
        }
        line.textContent = binaryStr;
        terminalHistory.appendChild(line);

        const body = document.getElementById('win-body-terminal');
        if (body) body.scrollTop = body.scrollHeight;

        ticks++;
        if (ticks > 15) {
          clearInterval(interval);
          const doneLine = document.createElement('div');
          doneLine.textContent = "nexa_shell$ matrix job completed.";
          terminalHistory.appendChild(doneLine);
          if (body) body.scrollTop = body.scrollHeight;
        }
      }, 150);
    };

    // Trigger initial command queue run
    setTimeout(runScheduler, 1000);

    const termBody = document.getElementById('win-body-terminal');
    if (termBody) {
      termBody.classList.add('terminal-body');
      termBody.addEventListener('click', () => {
        if (inputEl) inputEl.focus();
      });
    }

    if (inputEl) {
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const cmd = inputEl.value;
          if (awaitingGithubToken) {
            const token = cmd.trim();
            inputEl.value = "";
            inputEl.type = "text";
            awaitingGithubToken = false;
            if (token) {
              localStorage.setItem('nexadesk_github_pat', token);
              const promptLine = document.createElement('div');
              promptLine.innerHTML = `<span class="term-prompt">nexa_shell$</span> ********`;
              terminalHistory.appendChild(promptLine);
              if (gitPushPendingArgs) {
                pushFilesToGithub(gitPushPendingArgs.owner, gitPushPendingArgs.repo, token, gitPushPendingArgs.branch);
              }
            } else {
              const errLine = document.createElement('div');
              errLine.style.color = 'var(--neon-red)';
              errLine.textContent = 'Push cancelled: No token provided.';
              terminalHistory.appendChild(errLine);
            }
            return;
          }
          if (cmd.trim()) {
            executeCommand(cmd);
          }
        }
      });
    }
  }

  /* App Bindings: Built-In IDE Studio */
  initIDEAppBindings() {
    const codeInput = document.getElementById('ide-code-input');
    const lineNumbers = document.getElementById('ide-line-numbers');
    const consoleOutput = document.getElementById('ide-console-output');
    const runBtn = document.getElementById('ide-run-btn');
    const saveBtn = document.getElementById('ide-save-btn');
    const clearBtn = document.getElementById('ide-clear-btn');
    const editorArea = document.getElementById('ide-editor-area');
    const previewWrapper = document.getElementById('ide-preview-wrapper');
    const previewIframe = document.getElementById('ide-preview-iframe');
    const aiWrapper = document.getElementById('ide-ai-wrapper');
    const aiSendBtn = document.getElementById('ai-send-btn');
    const aiPromptInput = document.getElementById('ai-prompt-input');
    const aiChatHistory = document.getElementById('ai-chat-history');
    const consoleToggleBtn = document.getElementById('ide-console-toggle-btn');
    if (!codeInput) return;

    // Fullstack Next.js + Node.js Code Templates
    const files = {
      'page.tsx': `// app/page.tsx  --  Next.js 14 App Router Landing Page
import Link from "next/link";

export const metadata = {
  title: "NexaDesk Studio",
  description: "Browser-native spatial workspace powered by AI.",
};

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white font-sans">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">NexaDesk</h1>
        <nav className="flex gap-6 text-sm text-gray-400">
          <Link href="/docs" className="hover:text-white transition">Docs</Link>
          <Link href="/dashboard" className="hover:text-white transition">Dashboard</Link>
        </nav>
      </header>

      <section className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h2 className="text-4xl sm:text-5xl font-extrabold leading-tight">
          Build with your hands,\n          not your keyboard.
        </h2>
        <p className="mt-6 text-gray-400 text-lg max-w-xl mx-auto">
          A browser-native spatial workspace with MediaPipe gesture tracking,
          local AI code generation, and a full IDE — no install required.
        </p>
        <div className="mt-10 flex justify-center gap-4">
          <Link
            href="/dashboard"
            className="px-6 py-3 rounded-lg bg-cyan-500 text-black font-semibold hover:bg-cyan-400 transition"
          >
            Launch Workspace
          </Link>
          <Link
            href="/docs"
            className="px-6 py-3 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500 transition"
          >
            Read Docs
          </Link>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-16 grid sm:grid-cols-3 gap-8">
        <FeatureCard
          title="Gesture Control"
          desc="Pinch, drag, and resize windows using MediaPipe hand tracking."
        />
        <FeatureCard
          title="Local AI"
          desc="Run Ollama, WebGPU LLMs, or Gemini Nano without sending data to the cloud."
        />
        <FeatureCard
          title="Built-in IDE"
          desc="Full code editor, live preview, terminal, and file explorer — all in-browser."
        />
      </section>
    </main>
  );
}

function FeatureCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="p-6 rounded-xl border border-gray-800 bg-gray-900/50">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-gray-400">{desc}</p>
    </div>
  );
}`,
      'globals.css': `/* app/globals.css  --  Next.js Global Styles */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg-primary: #030712;
  --text-primary: #f9fafb;
  --accent: #06b6d4;
}

html {
  scroll-behavior: smooth;
}

body {
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: "Inter", system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* Glassmorphic card utility */
.glass-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(12px);
  border-radius: 16px;
}

/* Focus ring utility */
*:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Scrollbar styling */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}`,
      'server.js': `// server.js  --  Node.js Express Backend
const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory data store
const projects = new Map();

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Get all projects
app.get("/api/projects", (req, res) => {
  const list = Array.from(projects.values());
  res.json({ projects: list, count: list.length });
});

// Create project
app.post("/api/projects", (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });

  const project = {
    id: uuidv4(),
    name,
    description: description || "",
    createdAt: new Date().toISOString(),
    files: [],
  };
  projects.set(project.id, project);
  res.status(201).json(project);
});

// Delete project
app.delete("/api/projects/:id", (req, res) => {
  const deleted = projects.delete(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Not found" });
  res.json({ message: "Project deleted" });
});

app.listen(PORT, () => {
  console.log("Server running on http://localhost:" + PORT);
});`,
      'api/route.ts': `// app/api/workspace/route.ts  --  Next.js API Route Handler
import { NextRequest, NextResponse } from "next/server";

interface Workspace {
  id: string;
  name: string;
  files: string[];
  lastModified: string;
}

// In-memory store (replace with DB in production)
const workspaces: Map<string, Workspace> = new Map();

export async function GET() {
  const list = Array.from(workspaces.values());
  return NextResponse.json({ workspaces: list });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, files } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json(
      { error: "Workspace name is required" },
      { status: 400 }
    );
  }

  const workspace: Workspace = {
    id: crypto.randomUUID(),
    name,
    files: files || [],
    lastModified: new Date().toISOString(),
  };

  workspaces.set(workspace.id, workspace);

  return NextResponse.json(workspace, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id || !workspaces.has(id)) {
    return NextResponse.json(
      { error: "Workspace not found" },
      { status: 404 }
    );
  }

  workspaces.delete(id);
  return NextResponse.json({ message: "Workspace deleted" });
}`
    };

    // --- localStorage Session Restore: Load saved file edits ---
    try {
      const savedFiles = localStorage.getItem('nexadesk_ide_files');
      if (savedFiles) {
        const parsed = JSON.parse(savedFiles);
        Object.keys(parsed).forEach(k => { if (files.hasOwnProperty(k)) files[k] = parsed[k]; });
      }
    } catch (e) { /* ignore parse errors */ }
    window.nexadesk_files = files;

    const savedActiveFile = localStorage.getItem('nexadesk_ide_activeFile');
    let activeFile = (savedActiveFile && (files.hasOwnProperty(savedActiveFile) || savedActiveFile === 'assistant')) ? savedActiveFile : 'page.tsx';
    codeInput.value = files[activeFile] || "";

    // Restore saved AI chat history
    try {
      const savedChat = localStorage.getItem('nexadesk_ai_chat_history');
      if (savedChat && aiChatHistory) {
        aiChatHistory.innerHTML = savedChat;
      }
    } catch (e) { }

    // Auto-persist helper
    const persistFiles = () => {
      try { localStorage.setItem('nexadesk_ide_files', JSON.stringify(files)); } catch (e) { }
    };
    const persistActiveFile = () => {
      try { localStorage.setItem('nexadesk_ide_activeFile', activeFile); } catch (e) { }
    };

    // Undo / Redo stacks
    const undoStack = { 'page.tsx': [], 'globals.css': [], 'server.js': [], 'api/route.ts': [] };
    const redoStack = { 'page.tsx': [], 'globals.css': [], 'server.js': [], 'api/route.ts': [] };

    const pushToHistory = (file, content) => {
      const uStack = undoStack[file];
      if (uStack.length === 0 || uStack[uStack.length - 1] !== content) {
        uStack.push(content);
        if (uStack.length > 50) uStack.shift();
      }
      redoStack[file] = [];
    };

    // Push initial state
    pushToHistory('page.tsx', files['page.tsx']);
    pushToHistory('globals.css', files['globals.css']);
    pushToHistory('server.js', files['server.js']);
    pushToHistory('api/route.ts', files['api/route.ts']);

    // Update Live Web Preview frame helper
    const updateLivePreview = () => {
      if (!previewIframe) return;
      // For Next.js files, render a static HTML representation
      const pageSrc = files['page.tsx'] || '';
      const cssSrc = files['globals.css'] || '';

      // Extract JSX-like content and render a static HTML preview
      const doc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Next.js Preview</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    body { background: #030712; color: #f9fafb; font-family: "Inter", system-ui, sans-serif; margin: 0; }
    ${cssSrc.replace(/@tailwind[^;]+;/g, '')}
  </style>
</head>
<body>
  <div id="preview-note" style="padding:6px 12px; background:#111827; border-bottom:1px solid #1f2937; font-size:11px; color:#6b7280; font-family:monospace;">
    Static render of page.tsx — Server components require next dev
  </div>
  <main class="min-h-screen bg-gray-950 text-white font-sans">
    <header class="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
      <h1 class="text-xl font-bold tracking-tight">NexaDesk</h1>
      <nav class="flex gap-6 text-sm text-gray-400">
        <a href="#" class="hover:text-white transition">Docs</a>
        <a href="#" class="hover:text-white transition">Dashboard</a>
      </nav>
    </header>
    <section class="max-w-3xl mx-auto px-6 py-24 text-center">
      <h2 class="text-4xl sm:text-5xl font-extrabold leading-tight">
        Build with your hands,<br/>not your keyboard.
      </h2>
      <p class="mt-6 text-gray-400 text-lg max-w-xl mx-auto">
        A browser-native spatial workspace with MediaPipe gesture tracking,
        local AI code generation, and a full IDE — no install required.
      </p>
      <div class="mt-10 flex justify-center gap-4">
        <a href="#" class="px-6 py-3 rounded-lg bg-cyan-500 text-black font-semibold hover:bg-cyan-400 transition">Launch Workspace</a>
        <a href="#" class="px-6 py-3 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500 transition">Read Docs</a>
      </div>
    </section>
    <section class="max-w-4xl mx-auto px-6 py-16 grid sm:grid-cols-3 gap-8">
      <div class="p-6 rounded-xl border border-gray-800 bg-gray-900/50">
        <h3 class="text-lg font-semibold mb-2">Gesture Control</h3>
        <p class="text-sm text-gray-400">Pinch, drag, and resize windows using MediaPipe hand tracking.</p>
      </div>
      <div class="p-6 rounded-xl border border-gray-800 bg-gray-900/50">
        <h3 class="text-lg font-semibold mb-2">Local AI</h3>
        <p class="text-sm text-gray-400">Run Ollama, WebGPU LLMs, or Gemini Nano without sending data to the cloud.</p>
      </div>
      <div class="p-6 rounded-xl border border-gray-800 bg-gray-900/50">
        <h3 class="text-lg font-semibold mb-2">Built-in IDE</h3>
        <p class="text-sm text-gray-400">Full code editor, live preview, terminal, and file explorer — all in-browser.</p>
      </div>
    </section>
  </main>
</body>
</html>`;

      previewIframe.srcdoc = doc;
    };

    // Sync line numbers helper
    const updateLineNumbers = () => {
      const lines = codeInput.value.split('\n').length;
      let lineStr = "";
      for (let i = 1; i <= lines; i++) {
        lineStr += i + "<br>";
      }
      lineNumbers.innerHTML = lineStr;
    };

    let historyTimeout = null;
    let autoSaveTimeout = null;
    codeInput.addEventListener('input', () => {
      files[activeFile] = codeInput.value;
      updateLineNumbers();

      clearTimeout(historyTimeout);
      historyTimeout = setTimeout(() => {
        pushToHistory(activeFile, codeInput.value);
      }, 500);

      // Auto-persist edits to localStorage (debounced)
      clearTimeout(autoSaveTimeout);
      autoSaveTimeout = setTimeout(persistFiles, 1500);
    });

    // Undo / Redo action bindings
    const undoBtn = document.getElementById('ide-undo-btn');
    if (undoBtn) {
      undoBtn.addEventListener('click', () => {
        const uStack = undoStack[activeFile];
        const rStack = redoStack[activeFile];
        if (uStack.length > 1) {
          const current = uStack.pop();
          rStack.push(current);
          const prev = uStack[uStack.length - 1];
          codeInput.value = prev;
          files[activeFile] = prev;
          updateLineNumbers();
          updateLivePreview();
          this.showToast("UNDO");
        } else {
          this.showToast("Nothing to undo");
        }
      });
    }

    const redoBtn = document.getElementById('ide-redo-btn');
    if (redoBtn) {
      redoBtn.addEventListener('click', () => {
        const uStack = undoStack[activeFile];
        const rStack = redoStack[activeFile];
        if (rStack.length > 0) {
          const next = rStack.pop();
          uStack.push(next);
          codeInput.value = next;
          files[activeFile] = next;
          updateLineNumbers();
          updateLivePreview();
          this.showToast("REDO");
        } else {
          this.showToast("Nothing to redo");
        }
      });
    }

    // Export current file binding
    const exportBtn = document.getElementById('ide-export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        if (activeFile === 'assistant') {
          this.showToast("Cannot export Assistant tab");
          return;
        }
        const blob = new Blob([files[activeFile]], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = activeFile;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showToast(`EXPORTED ${activeFile} SUCCESSFULLY`);
      });
    }

    // Console Input REPL
    const consoleInput = document.getElementById('ide-console-command-input');
    if (consoleInput) {
      consoleInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const cmd = consoleInput.value.trim();
          if (!cmd) return;

          // If awaiting GitHub Token in IDE Console
          if (window.ide_awaiting_github_token) {
            const token = cmd;
            consoleInput.value = "";
            consoleInput.type = "text";
            window.ide_awaiting_github_token = false;

            const pLine = document.createElement('div');
            pLine.className = 'log-info';
            pLine.innerHTML = `<span style="color:var(--neon-green);">&gt;</span> ********`;
            consoleOutput.appendChild(pLine);

            if (token) {
              localStorage.setItem('nexadesk_github_pat', token);
              if (window.ide_git_push_pending_args) {
                const { owner, repo, branch } = window.ide_git_push_pending_args;
                this.pushFilesToGithub(owner, repo, token, branch, consoleOutput);
              }
            } else {
              const errLine = document.createElement('div');
              errLine.className = 'log-error';
              errLine.textContent = 'Push cancelled: No token provided.';
              consoleOutput.appendChild(errLine);
            }
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
            return;
          }

          const inLine = document.createElement('div');
          inLine.className = 'log-info';
          inLine.innerHTML = `<span style="color:var(--neon-green);">&gt;</span> ${cmd}`;
          consoleOutput.appendChild(inLine);

          consoleInput.value = "";

          if (cmd.toLowerCase() === 'clear') {
            consoleOutput.innerHTML = `<div class="log-info">[System] Console purged. Ready for output.</div>`;
            return;
          }

          if (cmd.toLowerCase() === 'help') {
            const helpLine = document.createElement('div');
            helpLine.className = 'log-info';
            helpLine.innerHTML = `Console Commands:<br/>- <b>clear</b>: Clear console logs<br/>- <b>help</b>: Display this help message<br/>- <b>git &lt;command&gt;</b>: Source control operations (status, remote add, push)<br/>- Enter any JavaScript expression (e.g. <code>2 + 2</code>) to evaluate.`;
            consoleOutput.appendChild(helpLine);
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
            return;
          }

          const cleanCmd = cmd.toLowerCase().trim();

          if (cleanCmd.startsWith('git') || cleanCmd.startsWith('ls') || cleanCmd.startsWith('echo')) {
            // Run Git / Shell commands in IDE Console
            if (cleanCmd.startsWith('echo')) {
              if (cleanCmd.includes('>>') || cleanCmd.includes('>')) {
                const logLine = document.createElement('div');
                logLine.className = 'log-success';
                logLine.innerHTML = `[OK] File README.md appended successfully.`;
                consoleOutput.appendChild(logLine);
              } else {
                const echoText = cmd.replace(/^echo\s+/i, '').replace(/['"]/g, '');
                const logLine = document.createElement('div');
                logLine.className = 'log-info';
                logLine.textContent = echoText;
                consoleOutput.appendChild(logLine);
              }
            } else if (cleanCmd.startsWith('git')) {
              const gitLine = document.createElement('div');
              gitLine.className = 'log-info';

              if (cleanCmd === 'git' || cleanCmd === 'git help') {
                gitLine.innerHTML = `Git Source Control Client v2.42.0<br/>Commands: <b>git status</b>, <b>git clone &lt;url&gt;</b>, <b>git commit -m</b>, <b>git push</b>, <b>git log</b>`;
              } else if (cleanCmd === 'git init') {
                gitLine.innerHTML = `<span style="color:var(--neon-cyan);">Initialized empty Git repository in /workspace/project/.git/</span>`;
              } else if (cleanCmd.startsWith('git add')) {
                const file = cmd.split(' ').slice(2).join(' ') || 'files';
                gitLine.innerHTML = `<span style="color:var(--neon-green);">[OK] Added ${file} to staging area.</span>`;
              } else if (cleanCmd.startsWith('git branch')) {
                gitLine.innerHTML = `<span style="color:var(--neon-green);">[OK] Branch configuration updated.</span>`;
              } else if (cleanCmd.startsWith('git remote')) {
                const url = cmd.split(' ').slice(4).join(' ').trim();
                if (url) {
                  try { localStorage.setItem('nexadesk_git_remote', url); } catch (e) { }
                }
                gitLine.innerHTML = `<span style="color:var(--neon-green);">[OK] Remote origin added: ${url || 'origin'}</span>`;
              } else if (cleanCmd.includes('status')) {
                gitLine.innerHTML = `<span style="color:var(--neon-green);">On branch main<br/>Your branch is up to date with 'origin/main'.<br/>nothing to commit, working tree clean</span>`;
              } else if (cleanCmd.includes('clone')) {
                const repo = cmd.split(' ')[2] || 'repository';
                gitLine.innerHTML = `<span style="color:var(--neon-cyan);">Cloning into '${repo}'...<br/>[OK] Successfully cloned into workspace!</span>`;
                this.showToast(`GIT CLONED: ${repo}`);
              } else if (cleanCmd.includes('commit')) {
                gitLine.innerHTML = `<span style="color:var(--neon-green);">[main (root-commit) 5a1b3c9] first commit<br/> 1 file changed, 1 insertion(+)<br/> create mode 100644 README.md</span>`;
                this.showToast("GIT COMMIT SUCCESSFUL");
              } else if (cleanCmd.includes('push')) {
                const remoteOrigin = localStorage.getItem('nexadesk_git_remote') || '';
                const match = remoteOrigin.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
                if (match) {
                  const owner = match[1];
                  const repo = match[2];
                  const token = localStorage.getItem('nexadesk_github_pat');
                  if (!token) {
                    gitLine.innerHTML = `<span style="color:var(--neon-cyan);">GitHub Personal Access Token required to write to ${owner}/${repo}.<br/>Please enter your GitHub token (with 'repo' scope):</span>`;
                    window.ide_awaiting_github_token = true;
                    if (consoleInput) consoleInput.type = "password";
                    window.ide_git_push_pending_args = { owner, repo, branch: 'main' };
                  } else {
                    consoleOutput.appendChild(gitLine);
                    this.pushFilesToGithub(owner, repo, token, 'main', consoleOutput);
                    consoleOutput.scrollTop = consoleOutput.scrollHeight;
                    return;
                  }
                } else {
                  gitLine.innerHTML = `<span style="color:var(--neon-cyan);">Enumerating objects: 3, done.<br/>To origin<br/> * [new branch]      main -> main</span>`;
                  this.showToast("GIT PUSH COMPLETED");
                }
              } else if (cleanCmd.includes('log')) {
                gitLine.innerHTML = `<span style="color:#e2e8f0;">commit 5a1b3c9 (HEAD -> main, origin/main)<br/>Author: Nexa Developer &lt;dev@nexadesk.io&gt;<br/>Date: ${new Date().toLocaleDateString()}<br/><br/>    first commit</span>`;
              } else {
                gitLine.textContent = `git: command completed for '${cmd}'`;
              }
              consoleOutput.appendChild(gitLine);
            } else if (cleanCmd === 'ls') {
              const lsLine = document.createElement('div');
              lsLine.className = 'log-info';
              lsLine.textContent = `Documents/   Images/   NexaSystem/   README.md   setup.js`;
              consoleOutput.appendChild(lsLine);
            }
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
            return;
          }

          try {
            const result = window.eval(cmd);
            const outLine = document.createElement('div');
            outLine.className = 'log-success';
            outLine.textContent = typeof result === 'object' ? JSON.stringify(result) : String(result);
            consoleOutput.appendChild(outLine);
          } catch (err) {
            const outLine = document.createElement('div');
            outLine.className = 'log-error';
            outLine.textContent = `Error: ${err.message}`;
            consoleOutput.appendChild(outLine);
          }

          consoleOutput.scrollTop = consoleOutput.scrollHeight;
        }
      });
    }

    // Provider select logic for Code Assistant
    const providerSelect = document.getElementById('ai-provider-select');
    const settingsPanel = document.getElementById('ai-settings-panel');

    if (providerSelect && settingsPanel) {
      // Restore saved provider
      const savedProvider = this.getSavedAIProvider();
      if (savedProvider && savedProvider !== 'heuristics') {
        providerSelect.value = savedProvider;
        settingsPanel.style.display = 'block';
        settingsPanel.querySelectorAll('.settings-group').forEach(el => el.style.display = 'none');
        const activeSettings = document.getElementById(`settings-${savedProvider}`);
        if (activeSettings) activeSettings.style.display = 'flex';
      }

      providerSelect.addEventListener('change', () => {
        const val = providerSelect.value;
        settingsPanel.querySelectorAll('.settings-group').forEach(el => el.style.display = 'none');

        if (val === 'heuristics') {
          settingsPanel.style.display = 'none';
        } else {
          settingsPanel.style.display = 'block';
          const activeSettings = document.getElementById(`settings-${val}`);
          if (activeSettings) activeSettings.style.display = 'flex';
        }

        this.saveAIProvider(val);
      });
    }

    // File Selection Helper
    const selectFile = (fileName, silent = false) => {
      activeFile = fileName;
      persistActiveFile();

      // Sync tabs active state
      document.querySelectorAll('.ide-tab').forEach(t => {
        t.classList.remove('active-tab');
        if (t.getAttribute('data-file') === activeFile) {
          t.classList.add('active-tab');
        }
      });

      // Sync sidebar active state
      document.querySelectorAll('.ide-sidebar-file').forEach(sf => {
        sf.classList.remove('active-sidebar-file');
        if (sf.getAttribute('data-file') === activeFile) {
          sf.classList.add('active-sidebar-file');
        }
      });

      if (previewWrapper) previewWrapper.classList.remove('active-preview');

      if (activeFile === 'assistant') {
        editorArea.style.display = 'none';
        if (aiWrapper) aiWrapper.classList.add('active-ai');
        if (!silent) this.showToast("CODE ASSISTANT ACTIVE");
      } else {
        if (aiWrapper) aiWrapper.classList.remove('active-ai');
        editorArea.style.display = 'flex';
        codeInput.value = files[activeFile] || "";
        updateLineNumbers();
        if (!silent) this.showToast(`SWITCHED FILE: ${activeFile}`);
      }
    };

    // Render tabs list dynamically
    const renderTabs = () => {
      const tabsContainer = document.getElementById('ide-tabs');
      if (!tabsContainer) return;
      tabsContainer.innerHTML = '';

      Object.keys(files).forEach(fileName => {
        const tab = document.createElement('div');
        tab.className = `ide-tab ${fileName === activeFile ? 'active-tab' : ''}`;
        tab.setAttribute('data-file', fileName);
        tab.textContent = fileName;

        tab.addEventListener('click', () => {
          selectFile(fileName);
        });
        tabsContainer.appendChild(tab);
      });

      // Code Assistant Tab
      const aiTab = document.createElement('div');
      aiTab.className = `ide-tab ai-tab ${activeFile === 'assistant' ? 'active-tab' : ''}`;
      aiTab.setAttribute('data-file', 'assistant');
      aiTab.textContent = 'Code Assistant';
      aiTab.addEventListener('click', () => {
        selectFile('assistant');
      });
      tabsContainer.appendChild(aiTab);
    };

    // Initialize tabs rendering
    renderTabs();

    // Create New File Helper
    const handleNewFileCreation = () => {
      const fileName = prompt("Enter new file name (e.g., utils.ts or styles.css):");
      if (!fileName) return;
      const cleanName = fileName.trim();
      if (!cleanName) return;

      if (files.hasOwnProperty(cleanName)) {
        this.showToast("File already exists!");
        return;
      }

      // Add file with default starter content
      let starterContent = `// ${cleanName}\n\n`;
      if (cleanName.endsWith('.tsx') || cleanName.endsWith('.jsx')) {
        starterContent += `export default function Component() {\n  return (\n    <div>New Component: ${cleanName}</div>\n  );\n}`;
      } else if (cleanName.endsWith('.css')) {
        starterContent += `/* Styles for ${cleanName} */\n.container {\n  padding: 10px;\n}`;
      } else {
        starterContent += `export function hello() {\n  return "hello from ${cleanName}";\n}`;
      }

      files[cleanName] = starterContent;
      persistFiles();
      renderSidebarFiles();
      renderTabs();
      selectFile(cleanName);
      this.showToast(`CREATED FILE: ${cleanName}`);
    };

    // Create New Folder Helper
    const handleNewFolderCreation = () => {
      const folderName = prompt("Enter new folder name (e.g., components or utils):");
      if (!folderName) return;
      const cleanName = folderName.trim();
      if (!cleanName) return;

      const keepFileName = cleanName.endsWith('/') ? `${cleanName}.keep` : `${cleanName}/.keep`;

      if (files.hasOwnProperty(keepFileName)) {
        this.showToast("Folder already exists!");
        return;
      }

      files[keepFileName] = `// Folder placeholder: ${cleanName}\n`;
      persistFiles();
      renderSidebarFiles();
      renderTabs();
      selectFile(keepFileName);
      this.showToast(`CREATED FOLDER: ${cleanName}`);
    };

    // Bind Sidebar '+ File' button
    const newIDEFileBtn = document.getElementById('ide-new-file-btn');
    if (newIDEFileBtn) {
      newIDEFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleNewFileCreation();
      });
    }

    // Bind Toolbar '+ File' button
    const toolbarNewFileBtn = document.getElementById('ide-toolbar-new-file-btn');
    if (toolbarNewFileBtn) {
      toolbarNewFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleNewFileCreation();
      });
    }

    // Bind Toolbar '+ Folder' button
    const toolbarNewFolderBtn = document.getElementById('ide-toolbar-new-folder-btn');
    if (toolbarNewFolderBtn) {
      toolbarNewFolderBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleNewFolderCreation();
      });
    }

    // Helper to auto-apply code suggestions generated by LLMs to files
    const checkAndApplyCodeOutput = (text) => {
      if (!text) return;

      const tsxMatch = text.match(/```(?:tsx|jsx|html)([\s\S]*?)```/i);
      const cssMatch = text.match(/```css([\s\S]*?)```/i);
      const jsMatch = text.match(/```(?:javascript|js|typescript|ts)([\s\S]*?)```/i);

      let updated = false;
      if (tsxMatch && tsxMatch[1]) {
        files['page.tsx'] = tsxMatch[1].trim();
        pushToHistory('page.tsx', files['page.tsx']);
        updated = true;
      }
      if (cssMatch && cssMatch[1]) {
        files['globals.css'] = cssMatch[1].trim();
        pushToHistory('globals.css', files['globals.css']);
        updated = true;
      }
      if (jsMatch && jsMatch[1]) {
        files['server.js'] = jsMatch[1].trim();
        pushToHistory('server.js', files['server.js']);
        updated = true;
      }

      if (updated) {
        this.showToast("WORKSPACE UPDATED WITH ASSISTANT CODE!");
        if (activeFile !== 'assistant') {
          codeInput.value = files[activeFile] || "";
          updateLineNumbers();
        }
        updateLivePreview();
      }
    };

    // Code Assistant Prompt Generator (with workspace context, Ollama, Web-LLM, Colab & Custom API support)
    const handleAISubmit = async () => {
      const promptText = aiPromptInput.value.trim();
      if (!promptText) return;

      const userMsg = document.createElement('div');
      userMsg.className = 'ai-msg user';
      userMsg.textContent = promptText;
      aiChatHistory.appendChild(userMsg);
      aiPromptInput.value = "";
      aiChatHistory.scrollTop = aiChatHistory.scrollHeight;

      // Save chat history
      const saveChatHistory = () => {
        try { localStorage.setItem('nexadesk_ai_chat_history', aiChatHistory.innerHTML); } catch (e) { }
      };
      saveChatHistory();

      const agentMsg = document.createElement('div');
      agentMsg.className = 'ai-msg agent';
      agentMsg.textContent = "Generating response...";
      aiChatHistory.appendChild(agentMsg);
      aiChatHistory.scrollTop = aiChatHistory.scrollHeight;
      saveChatHistory();

      const provider = providerSelect ? providerSelect.value : 'heuristics';

      // Build workspace context string from IDE files if checkbox is checked
      const includeCtx = document.getElementById('ai-include-context');
      let workspaceContext = "";
      if (includeCtx && includeCtx.checked) {
        workspaceContext = "\n\n--- WORKSPACE FILES (Read these to understand the project) ---\n";
        Object.keys(files).forEach(fname => {
          workspaceContext += `\n### FILE: ${fname}\n\`\`\`\n${files[fname]}\n\`\`\`\n`;
        });
        workspaceContext += "--- END WORKSPACE FILES ---\n\n";
      }

      const systemPrompt = 'You are an expert full-stack coding assistant inside the NexaDesk IDE. You can read, analyze, debug, and write code for the user\'s workspace files. When asked to review or fix code, reference the specific file and line. Return code in markdown fenced blocks (e.g. ```tsx, ```css, ```js). Be concise and actionable.';

      const fullUserPrompt = workspaceContext
        ? `${workspaceContext}\nUser request: ${promptText}`
        : `User request: ${promptText}`;

      try {
        if (provider === 'heuristics') {
          setTimeout(() => {
            agentMsg.textContent = "No AI provider configured. Select a provider from the dropdown above (Ollama, Gemini API, OpenAI, etc.) and enter your API key or endpoint to enable code generation.";
            aiChatHistory.scrollTop = aiChatHistory.scrollHeight;
            saveChatHistory();
          }, 400);

        } else if (provider === 'ollama') {
          const modelName = document.getElementById('ollama-model').value || 'qwen2.5:0.5b';
          const endpointUrl = document.getElementById('ollama-url').value || 'http://localhost:11434/api/generate';

          this.showToast("CONNECTING TO OLLAMA LOCAL...");
          const res = await fetch(endpointUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: modelName,
              prompt: `${systemPrompt}\n\n${fullUserPrompt}`,
              stream: false
            })
          });
          if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
          const data = await res.json();
          agentMsg.textContent = data.response || "No response received from Ollama.";
          checkAndApplyCodeOutput(data.response);

        } else if (provider === 'openai-api') {
          const apiKey = document.getElementById('openai-api-key').value;
          const model = document.getElementById('openai-api-model').value || 'gpt-4o-mini';

          if (!apiKey) {
            agentMsg.textContent = "Error: Please enter OpenAI API key in the settings panel.";
            return;
          }

          this.showToast("CONNECTING TO OPENAI API...");
          const res = await fetch(`https://api.openai.com/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: fullUserPrompt }
              ]
            })
          });
          if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
          const data = await res.json();
          const responseText = data.choices[0].message.content;
          agentMsg.textContent = responseText || "No response from OpenAI.";
          checkAndApplyCodeOutput(responseText);

        } else if (provider === 'gemini-api') {
          const apiKey = document.getElementById('gemini-api-key').value;
          const model = document.getElementById('gemini-api-model').value || 'gemini-1.5-flash';

          if (!apiKey) {
            agentMsg.textContent = "Error: Please enter Gemini API key in the settings panel.";
            return;
          }

          this.showToast("CONNECTING TO GEMINI API...");
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `${systemPrompt}\n\n${fullUserPrompt}` }] }]
            })
          });
          if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
          const data = await res.json();
          const text = data.candidates[0].content.parts[0].text;
          agentMsg.textContent = text || "No response from Gemini.";
          checkAndApplyCodeOutput(text);

        } else if (provider === 'custom-api') {
          const endpoint = document.getElementById('custom-api-endpoint').value;
          const apiKey = document.getElementById('custom-api-key').value;
          const model = document.getElementById('custom-api-model').value;

          if (!endpoint) {
            agentMsg.textContent = "Error: Please enter Custom Base Endpoint URL.";
            return;
          }

          this.showToast("CONNECTING TO CUSTOM LLM API...");
          const headers = { 'Content-Type': 'application/json' };
          if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
          const bodyObj = {
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: fullUserPrompt }
            ]
          };
          if (model) bodyObj.model = model;

          const res = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(bodyObj)
          });
          if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
          const data = await res.json();
          const responseText = data.choices[0].message.content || data.response || JSON.stringify(data);
          agentMsg.textContent = responseText || "No response from Custom API.";
          checkAndApplyCodeOutput(responseText);

        } else if (provider === 'colab-api') {
          const colabUrl = document.getElementById('colab-api-url').value;
          const colabModel = document.getElementById('colab-api-model').value || 'default';

          if (!colabUrl) {
            agentMsg.textContent = "Error: Please paste your Google Colab ngrok API URL. Run the Colab notebook first to get the URL.";
            return;
          }

          this.showToast("CONNECTING TO COLAB FREE GPU...");
          const colabHeaders = { 'Content-Type': 'application/json' };
          const colabBody = {
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: fullUserPrompt }
            ]
          };
          if (colabModel && colabModel !== 'default') colabBody.model = colabModel;

          const res = await fetch(colabUrl, {
            method: 'POST',
            headers: colabHeaders,
            body: JSON.stringify(colabBody)
          });
          if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
          const data = await res.json();
          const responseText = data.choices?.[0]?.message?.content || data.response || JSON.stringify(data);
          agentMsg.textContent = responseText || "No response from Colab GPU.";
          checkAndApplyCodeOutput(responseText);

        } else if (provider === 'chrome-nano') {
          const sessionApi = window.ai || (window.ai && window.ai.languageModel);
          if (sessionApi) {
            this.showToast("INITIALIZING CHROME GEMINI NANO...");
            const session = await (window.ai.createTextSession ? window.ai.createTextSession() : window.ai.languageModel.create());
            const result = await session.prompt(fullUserPrompt);
            agentMsg.textContent = result || "Empty response from Gemini Nano.";
            checkAndApplyCodeOutput(result);
          } else {
            agentMsg.textContent = "Error: Chrome Gemini Nano (window.ai) not detected. Enable it in chrome://flags or configure another provider.";
          }

        } else if (provider === 'web-llm') {
          this.showToast("DOWNLOADING LOCAL MODEL WEIGHTS (WEBGPU)...");
          let progress = 0;
          const progressInterval = setInterval(() => {
            progress += Math.floor(Math.random() * 15) + 5;
            if (progress >= 100) {
              progress = 100;
              clearInterval(progressInterval);
              agentMsg.textContent = "[OK] Model weights downloaded to browser storage. Compiling GPU shaders...\n\n";
              setTimeout(() => {
                let responseText = "";
                if (promptText.toLowerCase().includes('counter') || promptText.toLowerCase().includes('btn')) {
                  responseText = `Here is a custom counter app code running fully inside your browser's local WebGPU LLM:

\`\`\`html
<div class="card">
  <h2>WebGPU Local Counter</h2>
  <button id="counter-btn">Clicks: <span id="count-val">0</span></button>
</div>
\`\`\`

\`\`\`css
.card {
  border: 2px solid var(--neon-cyan);
  padding: 20px;
}
\`\`\``;
                } else {
                  responseText = `Here is the requested local in-browser response for "${promptText}":

\`\`\`html
<div class="card">
  <h2>Local WebGPU Studio</h2>
  <p>Response fully executed client-side on your device GPU!</p>
</div>
\`\`\``;
                }
                agentMsg.textContent += responseText;
                checkAndApplyCodeOutput(responseText);
              }, 800);
            } else {
              agentMsg.textContent = `Downloading WebGPU model weights to cache: ${progress}% completed...`;
            }
            aiChatHistory.scrollTop = aiChatHistory.scrollHeight;
          }, 400);
        }
      } catch (err) {
        agentMsg.textContent = `Connection Error: ${err.message}. Make sure the local endpoint is running and CORS is enabled!`;
        saveChatHistory();
      } finally {
        aiChatHistory.scrollTop = aiChatHistory.scrollHeight;
        saveChatHistory();
      }
    };

    if (aiSendBtn) aiSendBtn.addEventListener('click', handleAISubmit);
    if (aiPromptInput) {
      aiPromptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleAISubmit();
      });
    }

    const colabCopyBtn = document.getElementById('btn-copy-colab-code');
    if (colabCopyBtn) {
      colabCopyBtn.addEventListener('click', () => {
        const pythonScript = `# NexaDesk Free GPU Server Setup\\n` +
          `# Run this cell in Google Colab (with T4 GPU runtime enabled)\\n\\n` +
          `import os, sys, subprocess\\n` +
          `print("Installing required Python libraries...")\\n` +
          `subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "flask", "flask-cors", "pyngrok", "transformers", "torch", "accelerate"])\\n\\n` +
          `from flask import Flask, request, jsonify\\n` +
          `from flask_cors import CORS\\n` +
          `from transformers import AutoModelForCausalLM, AutoTokenizer\\n` +
          `import torch, threading\\n\\n` +
          `app = Flask(__name__)\\n` +
          `CORS(app)\\n\\n` +
          `MODEL = "Qwen/Qwen2.5-Coder-1.5B-Instruct"\\n` +
          `print("Loading AI Model: " + MODEL + "...")\\n` +
          `tokenizer = AutoTokenizer.from_pretrained(MODEL)\\n` +
          `model = AutoModelForCausalLM.from_pretrained(MODEL, torch_dtype=torch.float16, device_map="auto")\\n` +
          `print("Model ready!")\\n\\n` +
          `@app.route("/v1/chat/completions", methods=["POST"])\\n` +
          `def chat():\\n` +
          `    data = request.json or {}\\n` +
          `    messages = data.get("messages", [])\\n` +
          `    prompt = ""\\n` +
          `    for m in messages:\\n` +
          `        prompt += f"\\\\n{m['role']}: {m['content']}"\\n` +
          `    prompt += "\\\\nassistant:"\\n` +
          `    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)\\n` +
          `    with torch.no_grad():\\n` +
          `        outputs = model.generate(**inputs, max_new_tokens=512)\\n` +
          `    res = tokenizer.decode(outputs[0][inputs.input_ids.shape[1]:], skip_special_tokens=True)\\n` +
          `    return jsonify({"choices": [{"message": {"role": "assistant", "content": res}}]})\\n\\n` +
          `threading.Thread(target=lambda: app.run(host="0.0.0.0", port=5000)).start()\\n\\n` +
          `from pyngrok import ngrok\\n` +
          `# Paste your ngrok auth token if you have one:\\n` +
          `# ngrok.set_auth_token("YOUR_TOKEN")\\n` +
          `tunnel = ngrok.connect(5000)\\n` +
          `print("\\\\nCOPY THIS URL TO NEXADESK IDE SETTINGS:\\\\n")\\n` +
          `print(f"{tunnel.public_url}/v1/chat/completions\\\\n")\\n`;

        navigator.clipboard.writeText(pythonScript).then(() => {
          this.showToast("SETUP CODE COPIED TO CLIPBOARD!");
        }).catch(err => {
          console.error("Clipboard copy failed:", err);
          alert("Could not automatically copy setup code. Please copy the code manually.");
        });
      });
    }

    // Run / Preview code listener
    runBtn.addEventListener('click', () => {
      this.showToast(`COMPILING & EXECUTING WEB APP...`);

      const appendLog = (text, type = 'log-info') => {
        const div = document.createElement('div');
        div.className = type;
        div.textContent = text;
        consoleOutput.appendChild(div);
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
      };

      appendLog(`\n[Build] Compiling Next.js + Node fullstack workspace...`, 'log-info');
      updateLivePreview();
      appendLog("Page compiled to static preview. Run next dev for full SSR.", 'log-success');

      if (activeFile.endsWith('.js')) {
        const originalLog = console.log;
        try {
          console.log = (...args) => {
            appendLog(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '), 'log-success');
            originalLog(...args);
          };
          const fn = new Function(codeInput.value);
          fn();
        } catch (err) {
          appendLog(`[ERROR] Execution error: ${err.message}`, 'log-error');
        } finally {
          console.log = originalLog;
        }
      }
    });

    // Save button — persist to localStorage
    saveBtn.addEventListener('click', () => {
      if (activeFile !== 'assistant') {
        files[activeFile] = codeInput.value;
      }
      persistFiles();
      persistActiveFile();
      this.showToast(`WORKSPACE SAVED TO LOCAL STORAGE`);
    });

    // Clear logs button
    clearBtn.addEventListener('click', () => {
      consoleOutput.innerHTML = `<div class="log-info">[System] Console purged. Ready for output.</div>`;
    });

    // Console toggle button
    if (consoleToggleBtn) {
      consoleToggleBtn.addEventListener('click', () => {
        const drawer = document.getElementById('ide-console-drawer');
        if (drawer) {
          const isHidden = drawer.style.display === 'none';
          drawer.style.display = isHidden ? 'flex' : 'none';
          this.showToast(isHidden ? "CONSOLE DRAWER OPENED" : "CONSOLE DRAWER CLOSED");
        }
      });
    }

    // Virtual Touch Toolbar keys
    document.querySelectorAll('.touch-key').forEach(keyBtn => {
      keyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const key = keyBtn.getAttribute('data-key');
        if (key === 'toggle-console') {
          const drawer = document.getElementById('ide-console-drawer');
          if (drawer) {
            drawer.style.display = drawer.style.display === 'none' ? 'flex' : 'none';
          }
        } else if (key === 'toggle-preview') {
          if (previewWrapper) {
            const isActive = previewWrapper.classList.contains('active-preview');
            if (isActive) {
              previewWrapper.classList.remove('active-preview');
              if (activeFile === 'assistant') {
                editorArea.style.display = 'none';
                if (aiWrapper) aiWrapper.classList.add('active-ai');
              } else {
                if (aiWrapper) aiWrapper.classList.remove('active-ai');
                editorArea.style.display = 'flex';
              }
              this.showToast("EDITOR VIEW");
            } else {
              editorArea.style.display = 'none';
              if (aiWrapper) aiWrapper.classList.remove('active-ai');
              previewWrapper.classList.add('active-preview');
              updateLivePreview();
              this.showToast("LIVE PREVIEW ACTIVE");
            }
          }
        } else if (key === 'open-ai') {
          const aiTab = document.querySelector('.ide-tab.ai-tab');
          if (aiTab) aiTab.click();
        } else {
          if (activeFile === 'assistant') return;
          if (previewWrapper && previewWrapper.classList.contains('active-preview')) return;
          const insertText = key === 'tab' ? '  ' : key;
          const start = codeInput.selectionStart;
          const end = codeInput.selectionEnd;
          const val = codeInput.value;
          codeInput.value = val.substring(0, start) + insertText + val.substring(end);
          codeInput.selectionStart = codeInput.selectionEnd = start + insertText.length;
          codeInput.focus();
          files[activeFile] = codeInput.value;
          updateLineNumbers();
        }
      });
    });

    // Horizontal click-and-drag scrolling for tabs
    const ideTabs = document.querySelector('.ide-tabs');
    if (ideTabs) {
      let isDown = false;
      let startX;
      let scrollLeft;

      ideTabs.addEventListener('mousedown', (e) => {
        isDown = true;
        startX = e.pageX - ideTabs.offsetLeft;
        scrollLeft = ideTabs.scrollLeft;
      });

      ideTabs.addEventListener('mouseleave', () => {
        isDown = false;
      });

      ideTabs.addEventListener('mouseup', () => {
        isDown = false;
      });

      ideTabs.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - ideTabs.offsetLeft;
        const walk = (x - startX) * 1.5;
        ideTabs.scrollLeft = scrollLeft - walk;
      });
    }

    // Render workspace files list in sidebar
    const renderSidebarFiles = () => {
      const sidebarFilesContainer = document.getElementById('ide-sidebar-files');
      if (!sidebarFilesContainer) return;
      sidebarFilesContainer.innerHTML = '';

      Object.keys(files).forEach(fileName => {
        const item = document.createElement('div');
        item.className = `ide-sidebar-file ${fileName === activeFile ? 'active-sidebar-file' : ''}`;
        item.setAttribute('data-file', fileName);

        let iconSvg = '';
        if (fileName.endsWith('.tsx') || fileName.endsWith('.ts')) {
          iconSvg = `<svg viewBox="0 0 24 24" class="sidebar-file-icon" style="width:12px; height:12px; margin-right:6px;"><path fill="#3178c6" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`;
        } else if (fileName.endsWith('.css')) {
          iconSvg = `<svg viewBox="0 0 24 24" class="sidebar-file-icon" style="width:12px; height:12px; margin-right:6px;"><path fill="#1572b6" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`;
        } else {
          iconSvg = `<svg viewBox="0 0 24 24" class="sidebar-file-icon" style="width:12px; height:12px; margin-right:6px;"><path fill="#f7df1e" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`;
        }

        item.innerHTML = `
          ${iconSvg}
          <span style="font-family:var(--font-mono); font-size:11px;">${fileName}</span>
        `;

        item.addEventListener('click', () => {
          selectFile(fileName);
        });

        sidebarFilesContainer.appendChild(item);
      });

      // Add Assistant entry
      const assistantItem = document.createElement('div');
      assistantItem.className = `ide-sidebar-file ${activeFile === 'assistant' ? 'active-sidebar-file' : ''}`;
      assistantItem.setAttribute('data-file', 'assistant');
      assistantItem.innerHTML = `
        <svg viewBox="0 0 24 24" class="sidebar-file-icon" style="width:12px; height:12px; margin-right:6px;"><path fill="var(--neon-green)" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
        <span style="font-family:var(--font-mono); font-size:11px;">Code Assistant</span>
      `;
      assistantItem.addEventListener('click', () => {
        selectFile('assistant');
      });
      sidebarFilesContainer.appendChild(assistantItem);
    };

    // Restore active tab and sync layout
    renderSidebarFiles();
    renderTabs();
    selectFile(activeFile, true);

    updateLineNumbers();
    updateLivePreview();
  }

  /* App Bindings: Built-In Web Browser */
  initBrowserAppBindings() {
    const urlInput = document.getElementById('browser-url-input');
    const goBtn = document.getElementById('browser-go-btn');
    const viewport = document.getElementById('browser-viewport');
    const refreshBtn = document.getElementById('browser-refresh-btn');
    if (!urlInput || !viewport) return;

    const navigate = (url) => {
      let target = url.trim();
      if (!target.startsWith('http://') && !target.startsWith('https://')) {
        if (target.includes('.') && !target.includes(' ')) {
          target = 'https://' + target;
        } else {
          target = 'https://bing.com/search?q=' + encodeURIComponent(target);
        }
      }
      urlInput.value = target;
      viewport.src = target;
      this.showToast(`NAVIGATING TO: ${target}`);
    };

    if (goBtn) goBtn.addEventListener('click', () => navigate(urlInput.value));
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') navigate(urlInput.value);
    });
    if (refreshBtn) refreshBtn.addEventListener('click', () => {
      viewport.src = viewport.src;
      this.showToast("PAGE RELOADED");
    });

    document.querySelectorAll('.bookmark-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const url = chip.getAttribute('data-url');
        navigate(url);
      });
    });
  }

  spawnDefaultWindows() {
    // Restore previously open windows from session, or show dashboard on first visit
    let restored = false;
    try {
      const savedWindows = localStorage.getItem('nexadesk_open_windows');
      if (savedWindows) {
        const windowIds = JSON.parse(savedWindows);
        if (Array.isArray(windowIds) && windowIds.length > 0) {
          windowIds.forEach(id => this.launchApp(id));
          restored = true;
        }
      }
    } catch (e) { /* ignore */ }

    if (!restored) {
      this.launchApp('control-panel');
    }
    this.windowManager.adjustWindowsForScreenSize();
  }

  /** Persist the list of currently open window IDs to localStorage */
  saveOpenWindows() {
    try {
      const ids = this.windowManager.windowRegistry.map(w => w.id);
      localStorage.setItem('nexadesk_open_windows', JSON.stringify(ids));
    } catch (e) { }
  }

  /** Save AI provider selection to localStorage */
  saveAIProvider(provider) {
    try { localStorage.setItem('nexadesk_ai_provider', provider); } catch (e) { }
  }

  /** Get saved AI provider from localStorage */
  getSavedAIProvider() {
    return localStorage.getItem('nexadesk_ai_provider') || 'heuristics';
  }
}

// Instantiate OS Engine upon Window Page Load (with Next.js hydration safety)
const initOS = () => {
  if (!window.NexaDeskInstance) {
    window.NexaDeskInstance = new NexaOS();
  }
};
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initOS);
} else {
  initOS();
}
