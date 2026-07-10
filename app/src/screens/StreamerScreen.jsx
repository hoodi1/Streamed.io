import React, { useState, useEffect } from 'react';
import { useStreamer } from '../hooks/useStreamer.js';

export default function StreamerScreen({ onBack }) {
  const [sources, setSources]           = useState([]);
  const [loadingSources, setLoading]    = useState(true);
  const [copied, setCopied]             = useState(false);
  const { startStreaming, stopStreaming, roomCode, viewerCount, status } = useStreamer();

  const loadSources = async () => {
    setLoading(true);
    try {
      const srcs = window.electronAPI ? await window.electronAPI.getSources() : [];
      setSources(srcs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSources(); }, []);

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── LIVE ────────────────────────────────────────────────────────────────────
  if (status === 'live') {
    return (
      <div className="live-screen">
        <div className="bg-orbs" aria-hidden="true">
          <div className="orb orb-purple" style={{ opacity: 0.2 }} />
          <div className="orb orb-blue"   style={{ opacity: 0.15 }} />
        </div>
        <div className="live-card">
          <div className="live-indicator">
            <span className="live-pulse" aria-hidden="true" />
            <span className="live-dot"  aria-hidden="true" />
            <span className="live-text">LIVE</span>
          </div>

          <h2 className="live-heading">You're streaming</h2>
          <p className="live-sub">Share this code — viewers enter it to watch</p>

          <div className="code-block">
            <span id="room-code" className="code-value" role="text" aria-label={`Room code: ${roomCode}`}>
              {roomCode}
            </span>
            <button id="btn-copy" className={`btn-copy ${copied ? 'btn-copy-done' : ''}`} onClick={copyCode}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>

          <div className="viewer-row">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <span>{viewerCount} viewer{viewerCount !== 1 ? 's' : ''} watching</span>
          </div>

          <div className="stats-row">
            <div className="stat-chip"><span className="sc-label">Resolution</span><span className="sc-val">1080p</span></div>
            <div className="stat-chip"><span className="sc-label">FPS</span><span className="sc-val">60</span></div>
            <div className="stat-chip"><span className="sc-label">Protocol</span><span className="sc-val">WebRTC</span></div>
            <div className="stat-chip"><span className="sc-label">Bitrate</span><span className="sc-val">8 Mbps</span></div>
          </div>

          <button id="btn-stop" className="btn-stop" onClick={() => { stopStreaming(); onBack(); }}>
            Stop Streaming
          </button>
        </div>
      </div>
    );
  }

  // ── CONNECTING ──────────────────────────────────────────────────────────────
  if (status === 'connecting') {
    return (
      <div className="center-screen">
        <div className="spinner" />
        <p className="center-label">Setting up your stream…</p>
      </div>
    );
  }

  // ── ERROR ───────────────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div className="center-screen">
        <p className="error-emoji">⚡</p>
        <p className="error-title">Stream failed to start</p>
        <p className="center-label dim">Check VITE_SERVER_URL in app/.env</p>
        <button className="btn-secondary" onClick={onBack}>← Go Back</button>
      </div>
    );
  }

  // ── SOURCE PICKER ───────────────────────────────────────────────────────────
  return (
    <div className="picker-screen">
      <div className="picker-bar">
        <button id="btn-back" className="btn-ghost" onClick={onBack}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back
        </button>
        <h2 className="picker-title">Select what to stream</h2>
        <button id="btn-refresh" className="btn-ghost" onClick={loadSources}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 4v6h-6M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          Refresh
        </button>
      </div>

      {loadingSources ? (
        <div className="center-screen">
          <div className="spinner" />
          <p className="center-label">Detecting screens and windows…</p>
        </div>
      ) : sources.length === 0 ? (
        <div className="center-screen">
          <p className="error-title">No sources found</p>
          <button className="btn-secondary" onClick={loadSources}>Try Again</button>
        </div>
      ) : (
        <div className="sources-grid">
          {sources.map((src) => (
            <button
              key={src.id}
              className="source-card"
              onClick={() => startStreaming(src.id)}
              title={src.name}
            >
              <div className="source-thumb-wrap">
                <img src={src.thumbnail} alt={src.name} className="source-thumb" draggable={false} />
                <div className="source-hover-veil">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5,3 19,12 5,21" fill="currentColor" stroke="none"/>
                  </svg>
                  Stream this
                </div>
              </div>
              <span className="source-name">{src.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
