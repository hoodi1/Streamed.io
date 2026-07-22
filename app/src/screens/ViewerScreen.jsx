import React, { useState, useRef, useEffect } from 'react';
import { useViewer } from '../hooks/useViewer.js';

export default function ViewerScreen({ onBack }) {
  const [code, setCode]           = useState('');
  const [isFullscreen, setFs]     = useState(false);
  const [showOverlay, setOverlay] = useState(true);
  const videoRef    = useRef(null);
  const containerRef = useRef(null);
  const hideTimer   = useRef(null);
  const { joinStream, leaveStream, status, statusDetail, stream, errorMsg } = useViewer();

  const [volume, setVolume]       = useState(1);
  const [isMuted, setIsMuted]     = useState(false);

  // Attach stream to video element once both exist (fixes ontrack race condition)
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
    if (!stream && videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [stream]);

  // Apply volume and mute settings to video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = isMuted;
    }
  }, [volume, isMuted, status]);

  const toggleMute = (e) => {
    e.stopPropagation();
    setIsMuted((prev) => !prev);
  };

  const handleVolumeChange = (e) => {
    e.stopPropagation();
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (val === 0) setIsMuted(true);
    else if (isMuted) setIsMuted(false);
  };

  const handleJoin = () => {
    const trimmed = code.trim();
    if (trimmed.length < 4) return;
    joinStream(trimmed);
  };

  const toggleFs = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  };

  const revealOverlay = () => {
    setOverlay(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setOverlay(false), 3000);
  };

  useEffect(() => {
    const onFsChange = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      clearTimeout(hideTimer.current);
    };
  }, []);

  // ── Stream ended ─────────────────────────────────────────────────────────────
  if (status === 'ended') {
    return (
      <div className="center-screen">
        <p className="error-emoji">📡</p>
        <p className="error-title">Stream ended</p>
        <p className="center-label dim">The streamer has stopped sharing.</p>
        <button id="btn-back-home" className="btn-primary" onClick={onBack}>Back to Home</button>
      </div>
    );
  }

  // ── Live viewer ──────────────────────────────────────────────────────────────
  if (status === 'live') {
    return (
      <div
        className={`viewer-wrap ${showOverlay ? 'overlay-on' : 'overlay-off'}`}
        ref={containerRef}
        onMouseMove={revealOverlay}
        onClick={revealOverlay}
      >
        <video
          id="viewer-video"
          ref={videoRef}
          className="viewer-video"
          autoPlay
          playsInline
        />
        <div className="viewer-overlay">
          <span className="live-badge-sm"><span className="live-dot" />LIVE</span>
          <div className="viewer-ctrl-group" onClick={(e) => e.stopPropagation()}>
            <div className="volume-control-wrap">
              <button
                id="btn-mute"
                className="vctrl-btn"
                onClick={toggleMute}
                title={isMuted || volume === 0 ? 'Unmute stream' : 'Mute stream'}
              >
                {isMuted || volume === 0 ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="1" y1="1" x2="23" y2="23"/>
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                ) : volume < 0.5 ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
                  </svg>
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="vctrl-volume-slider"
                title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
              />
            </div>

            <button id="btn-fullscreen" className="vctrl-btn" onClick={toggleFs} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              {isFullscreen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>
                </svg>
              )}
            </button>
            <button id="btn-leave" className="vctrl-btn vctrl-leave" onClick={() => { leaveStream(); onBack(); }} title="Leave stream">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Join form ────────────────────────────────────────────────────────────────
  return (
    <div className="join-screen">
      <div className="bg-orbs" aria-hidden="true">
        <div className="orb orb-blue" />
        <div className="orb orb-pink" />
      </div>
      <div className="join-center">
        <button id="btn-join-back" className="btn-ghost join-back-btn" onClick={onBack}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back
        </button>

        <div className="join-card">
          <div className="join-card-icon">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="url(#jcGrad)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
              <defs>
                <linearGradient id="jcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#7c3aed"/>
                  <stop offset="100%" stopColor="#3b82f6"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h2 className="join-title">Watch a Stream</h2>
          <p className="join-sub">Enter the room code shared by the streamer</p>

          <div className="join-input-row">
            <input
              id="input-code"
              type="text"
              className="join-input"
              placeholder="ABC123"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              maxLength={8}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              aria-label="Room code"
            />
            <button
              id="btn-join"
              className="btn-primary"
              onClick={handleJoin}
              disabled={status === 'connecting' || code.trim().length < 4}
            >
              {status === 'connecting' ? (
                <><span className="spinner-sm" />Joining…</>
              ) : 'Join'}
            </button>
          </div>
          {status === 'connecting' && statusDetail && (
            <p className="center-label dim" style={{fontSize:'12px',marginTop:'6px'}}>{statusDetail}</p>
          )}


          {status === 'error' && (
            <p className="error-msg" role="alert">{errorMsg || 'Failed to join stream.'}</p>
          )}

          <p className="join-hint">
            Stream travels directly P2P — nothing passes through our servers
          </p>
        </div>
      </div>
    </div>
  );
}
