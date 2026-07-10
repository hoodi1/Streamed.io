// ── Server ─────────────────────────────────────────────────────────────────────
// Change VITE_SERVER_URL in app/.env to your deployed server URL
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

// ── ICE / TURN ─────────────────────────────────────────────────────────────────
// Google STUN + Open Relay public TURN for internet NAT traversal
export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  // For production, replace with your own TURN server for reliability
  { urls: 'turn:openrelay.metered.ca:80',  username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turns:openrelay.metered.ca:443',username: 'openrelayproject', credential: 'openrelayproject' },
];

// ── Capture quality ────────────────────────────────────────────────────────────
export const VIDEO_CONSTRAINTS = {
  maxWidth: 1920,
  maxHeight: 1080,
  maxFrameRate: 60,
  minFrameRate: 30,
};

export const VIDEO_BITRATE = 8_000_000;  // 8 Mbps
export const AUDIO_BITRATE = 320_000;    // 320 kbps

// ── SDP helper: prefer H264 for hardware-accelerated encoding ──────────────────
export function preferH264(sdp) {
  const lines = sdp.split('\r\n');
  const mIdx = lines.findIndex((l) => l.startsWith('m=video'));
  if (mIdx === -1) return sdp;
  const h264 = lines
    .filter((l) => /a=rtpmap:\d+ H264/i.test(l))
    .map((l) => l.match(/a=rtpmap:(\d+)/)?.[1])
    .filter(Boolean);
  if (!h264.length) return sdp;
  const parts = lines[mIdx].split(' ');
  const rest = parts.slice(3).filter((p) => !h264.includes(p));
  lines[mIdx] = [...parts.slice(0, 3), ...h264, ...rest].join(' ');
  return lines.join('\r\n');
}
