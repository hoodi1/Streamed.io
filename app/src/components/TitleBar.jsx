import React from 'react';

export default function TitleBar() {
  const api = window.electronAPI;
  return (
    <header className="titlebar">
      <div className="tb-drag">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <polygon points="5,3 19,12 5,21" fill="url(#tbGrad)" />
          <defs>
            <linearGradient id="tbGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#7c3aed" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
          </defs>
        </svg>
        <span className="tb-name">Streamed.io</span>
      </div>
      <div className="tb-controls">
        <button className="tb-btn" onClick={() => api?.minimize()} title="Minimize" aria-label="Minimize">
          <span className="tb-btn-icon">─</span>
        </button>
        <button className="tb-btn" onClick={() => api?.maximize()} title="Maximize" aria-label="Maximize">
          <span className="tb-btn-icon">□</span>
        </button>
        <button className="tb-btn tb-close" onClick={() => api?.close()} title="Close" aria-label="Close">
          <span className="tb-btn-icon">✕</span>
        </button>
      </div>
    </header>
  );
}
