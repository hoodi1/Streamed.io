import React from 'react';

export default function HomeScreen({ onStreamer, onViewer }) {
  return (
    <div className="home-screen">
      <div className="bg-orbs" aria-hidden="true">
        <div className="orb orb-purple" />
        <div className="orb orb-blue" />
        <div className="orb orb-pink" />
      </div>

      <div className="home-center">
        <div className="home-logo">
          <div className="logo-icon-wrap">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
              <polygon points="5,3 19,12 5,21" fill="url(#homeGrad)" />
              <defs>
                <linearGradient id="homeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#7c3aed" />
                  <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="logo-wordmark">Streamed<span className="logo-dot">.io</span></h1>
          <p className="logo-tagline">1080p · 60fps · Zero compromise</p>
        </div>

        <div className="home-cards">
          <button id="btn-go-live" className="hcard hcard-live" onClick={onStreamer}>
            <div className="hcard-glow" />
            <div className="hcard-icon hcard-icon-purple">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>
                <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/>
              </svg>
            </div>
            <div className="hcard-text">
              <span className="hcard-title">Go Live</span>
              <span className="hcard-desc">Share your screen at max quality</span>
            </div>
            <svg className="hcard-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </button>

          <button id="btn-watch" className="hcard hcard-watch" onClick={onViewer}>
            <div className="hcard-glow hcard-glow-blue" />
            <div className="hcard-icon hcard-icon-blue">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </div>
            <div className="hcard-text">
              <span className="hcard-title">Watch Stream</span>
              <span className="hcard-desc">Join with a 6-character room code</span>
            </div>
            <svg className="hcard-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </button>
        </div>

        <p className="home-footer">WebRTC P2P — media travels directly between you and your viewers</p>
      </div>
    </div>
  );
}
