"use client";

import React, { useEffect, useState } from "react";
import { RecruiterPortal } from "../src/components/RecruiterPortal";

export default function Home() {
  const [viewMode, setViewMode] = useState<"portal" | "desktop">("portal");

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if the script has already been added to avoid duplicate injection
    if (document.querySelector('script[src="/main.js"]')) {
      return;
    }

    const script = document.createElement("script");
    script.src = "/main.js";
    script.defer = true;
    document.body.appendChild(script);
  }, []);

  return (
    <>
      {viewMode === "portal" ? (
        <RecruiterPortal onLaunchDesktop={() => setViewMode("desktop")} />
      ) : (
        <>
          {/* Top Quick Return Banner */}
          <div
            style={{
              position: "fixed",
              top: 12,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 999999,
              background: "rgba(10, 16, 26, 0.9)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(0, 240, 255, 0.4)",
              padding: "6px 16px",
              borderRadius: 20,
              display: "flex",
              alignItems: "center",
              gap: 12,
              boxShadow: "0 0 20px rgba(0, 240, 255, 0.25)",
            }}
          >
            <span style={{ fontSize: 12, color: "#94a3b8" }}>NexaDesk 60 FPS Spatial OS Active</span>
            <button
              onClick={() => setViewMode("portal")}
              style={{
                background: "#00f0ff",
                color: "#050911",
                border: "none",
                padding: "4px 12px",
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 800,
                cursor: "pointer",
                letterSpacing: "0.5px",
              }}
            >
              RETURN TO EVALUATION PORTAL
            </button>
          </div>

          {/* Background Canvas for Space/Particle Effect */}
          <canvas id="ambient-particles" suppressHydrationWarning={true} />

          {/* Aether Desktop Container */}
          <main id="aether-desktop" className="desktop-area">
            {/* Active Grid Guidelines */}
            <div className="grid-backdrop">
              <div className="grid-line horizontal animate-h1" />
              <div className="grid-line horizontal animate-h2" />
              <div className="grid-line vertical animate-v1" />
              <div className="grid-line vertical animate-v2" />
            </div>
          </main>

          {/* Custom Touchless Pointer Cursor */}
          <div id="aether-cursor" className="touchless-pointer state-hover">
            <div className="cursor-glow" />
            <div className="cursor-core" />
            <div className="cursor-ring" />
            {/* Countdown overlay for Close/Fist gesture */}
            <svg className="countdown-svg" viewBox="0 0 36 36">
              <path className="countdown-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              <path id="cursor-countdown-progress" className="countdown-progress" strokeDasharray="0, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            </svg>
            <div className="cursor-label">HOVER</div>
          </div>

          {/* Floating Webcam Preview Panel */}
          <div id="webcam-panel" className="webcam-bubble">
            <div className="panel-header" id="webcam-header">
              <span className="panel-title">
                <span className="pulse-indicator" />
                NEXADESK TRACKER FEED
              </span>
              <div className="header-controls">
                <button id="toggle-feed-visibility" title="Minimize Camera Feed" aria-label="Minimize Camera Feed">−</button>
              </div>
            </div>
            <div className="feed-container">
              <video id="webcam-stream" autoPlay playsInline muted suppressHydrationWarning={true} />
              <canvas id="tracker-overlay" suppressHydrationWarning={true} />
              <div id="hand-indicator-left" className="hand-tag">L</div>
              <div id="hand-indicator-right" className="hand-tag">R</div>
            </div>
          </div>

          {/* Glassmorphic Taskbar Dock */}
          <footer id="aether-taskbar" className="system-dock">
            <div className="dock-left">
              <div className="os-logo">
                <span className="logo-accent">NEXADESK</span>
                <span className="logo-version">v1.0</span>
              </div>
              <div className="divider" />
              <button id="toggle-spatial-mode" className="spatial-mode-btn" title="Toggle Gesture Camera Tracking">
                <span className="spatial-indicator" />
                <span className="spatial-label">
                  SPATIAL MODE: <strong id="spatial-status-text">OFF</strong>
                </span>
              </button>
              <button id="toggle-keyboard-btn" className="spatial-mode-btn" title="Toggle On-Screen Virtual Keyboard" style={{ marginLeft: "8px", display: "none" }}>
                <span className="keyboard-indicator" style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#4a5568", display: "inline-block", marginRight: "6px", transition: "background 0.3s" }} />
                <span className="keyboard-label">
                  KEYBOARD: <strong id="keyboard-status-text">OFF</strong>
                </span>
              </button>
              <div className="divider" />
              <div className="gesture-status-dock" id="status-gesture-badge">
                <span className="status-indicator" />
                <span className="status-label">OFF</span>
              </div>
            </div>

            {/* Quick Launch App Icons */}
            <div className="dock-apps">
              <button className="app-launcher active" data-app="control-panel" title="System Dashboard" id="launch-control-panel">
                <svg viewBox="0 0 24 24" className="app-icon">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z" />
                </svg>
                <span className="launcher-label">Dashboard</span>
              </button>
              <button className="app-launcher" data-app="paint" title="Nexa Touchless Paint" id="launch-paint">
                <svg viewBox="0 0 24 24" className="app-icon">
                  <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 19.4c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l1.9-1.9C9.17 19.58 10.53 20 12 20c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-3 8c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm3-3c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm3 3c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm3 4c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z" />
                </svg>
                <span className="launcher-label">Paint</span>
              </button>
              <button className="app-launcher" data-app="files" title="Workspace Storage" id="launch-files">
                <svg viewBox="0 0 24 24" className="app-icon">
                  <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-1 11H5V8h14v9z" />
                </svg>
                <span className="launcher-label">Storage</span>
              </button>
              <button className="app-launcher" data-app="terminal" title="Developer Terminal" id="launch-terminal">
                <svg viewBox="0 0 24 24" className="app-icon">
                  <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 12H6v-2h6v2zm6.29-3.71l-3.29 3.29c-.39.39-1.02.39-1.41 0l-.29-.3c-.39-.39-.39-1.02 0-1.41L15.17 12l-1.88-1.88c-.39-.39-.39-1.02 0-1.41l.29-.29c.39-.39 1.02-.39 1.41 0l3.29 3.29c.39.39.39 1.03 0 1.41z" />
                </svg>
                <span className="launcher-label">Shell</span>
              </button>
              <button className="app-launcher" data-app="ide" title="Nexa Code Studio IDE" id="launch-ide">
                <svg viewBox="0 0 24 24" className="app-icon">
                  <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z" />
                </svg>
                <span className="launcher-label">IDE</span>
              </button>
              <button className="app-launcher" data-app="browser" title="Nexa Web Browser" id="launch-browser">
                <svg viewBox="0 0 24 24" className="app-icon">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                </svg>
                <span className="launcher-label">Browser</span>
              </button>
            </div>

            <div className="dock-right">
              <button
                onClick={() => setViewMode("portal")}
                style={{
                  background: "rgba(0, 240, 255, 0.15)",
                  border: "1px solid rgba(0, 240, 255, 0.4)",
                  color: "#00f0ff",
                  padding: "4px 10px",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  marginRight: 8,
                }}
              >
                EVALUATION PORTAL
              </button>
              <div className="performance-metrics" id="fps-counter">FPS: --</div>
              <div className="divider" />
              <div className="system-time" id="system-time">00:00:00</div>
            </div>
          </footer>

          {/* Toast Notification Overlay */}
          <div id="toast-container" />

          {/* Graceful Fallback Overlay */}
          <div id="fallback-overlay" className="fallback-screen">
            <div className="fallback-card">
              <div className="card-icon">!</div>
              <h2>Camera Interface Blocked / Not Detected</h2>
              <p>NexaDesk requires camera access to track hands and translate gestures. Ensure permissions are granted or switch to the interactive emulator below.</p>

              <div className="fallback-choices">
                <button id="retry-camera-btn" className="fallback-btn primary-btn">Retry Camera Connection</button>
                <button id="enable-simulator-btn" className="fallback-btn secondary-btn">Activate Virtual Hand Simulator</button>
              </div>

              <div className="instructions-accordion">
                <h3>Gesture Quick Reference Guide</h3>
                <ul>
                  <li><strong>Hover</strong>: Move single index finger on screen to control cursor.</li>
                  <li><strong>Click/Pinch</strong>: Pinch Index finger tip (8) and Thumb tip (4) close together.</li>
                  <li><strong>Drag Window</strong>: Pinch/click inside window headers and move hand.</li>
                  <li><strong>Resize Window</strong>: Bring up two hands. Use distance between Left/Right index tips to scale active window.</li>
                  <li><strong>Close Window</strong>: Make a fist with fingers curled over the window and hold for 1 second.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Keyboard simulator controls helper */}
          <div id="simulator-widget" className="simulator-helper-box hidden">
            <div className="widget-header">
              <span>VIRTUAL HAND SIMULATOR</span>
            </div>
            <div className="widget-content">
              <p>Simulating hand tracking with mouse/keyboard:</p>
              <ul>
                <li><strong>Cursor</strong>: Move your mouse</li>
                <li><strong>Pinch/Click</strong>: Left click and hold</li>
                <li><strong>Fist/Close</strong>: Press and hold <kbd>Space</kbd> key</li>
                <li><strong>Two Hands/Resize</strong>: Hold <kbd>Shift</kbd> key and scroll mouse wheel to change distance</li>
              </ul>
              <div className="sim-feedback-bars">
                <div>Pinch state: <span id="sim-pinch-status">False</span></div>
                <div>Fist State: <span id="sim-fist-status">False</span></div>
                <div>Sim Distance: <span id="sim-dist-val">200px</span></div>
              </div>
              <button id="disable-simulator-btn" className="fallback-btn mini-btn">Disable Simulator</button>
            </div>
          </div>

          {/* Floating Virtual Keyboard Panel */}
          <div id="virtual-keyboard-panel" className="virtual-keyboard-container" style={{ display: "none" }}>
            <div className="keyboard-row">
              <button className="kbd-key" data-char="q">Q</button>
              <button className="kbd-key" data-char="w">W</button>
              <button className="kbd-key" data-char="e">E</button>
              <button className="kbd-key" data-char="r">R</button>
              <button className="kbd-key" data-char="t">T</button>
              <button className="kbd-key" data-char="y">Y</button>
              <button className="kbd-key" data-char="u">U</button>
              <button className="kbd-key" data-char="i">I</button>
              <button className="kbd-key" data-char="o">O</button>
              <button className="kbd-key" data-char="p">P</button>
              <button className="kbd-key special" data-char="backspace">Backspace</button>
            </div>
            <div className="keyboard-row">
              <button className="kbd-key" data-char="a">A</button>
              <button className="kbd-key" data-char="s">S</button>
              <button className="kbd-key" data-char="d">D</button>
              <button className="kbd-key" data-char="f">F</button>
              <button className="kbd-key" data-char="g">G</button>
              <button className="kbd-key" data-char="h">H</button>
              <button className="kbd-key" data-char="j">J</button>
              <button className="kbd-key" data-char="k">K</button>
              <button className="kbd-key" data-char="l">L</button>
              <button className="kbd-key special" data-char="enter">Enter</button>
            </div>
            <div className="keyboard-row">
              <button className="kbd-key" data-char="z">Z</button>
              <button className="kbd-key" data-char="x">X</button>
              <button className="kbd-key" data-char="c">C</button>
              <button className="kbd-key" data-char="v">V</button>
              <button className="kbd-key" data-char="b">B</button>
              <button className="kbd-key" data-char="n">N</button>
              <button className="kbd-key" data-char="m">M</button>
              <button className="kbd-key" data-char=",">,</button>
              <button className="kbd-key" data-char=".">.</button>
              <button className="kbd-key" data-char="?">?</button>
            </div>
            <div className="keyboard-row">
              <button className="kbd-key space" data-char=" ">Space</button>
              <button className="kbd-key special close-kbd" data-char="close">Close</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
