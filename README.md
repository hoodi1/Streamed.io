# Streamed.io

Low-latency 1080p/60fps desktop screen streaming app powered by **WebRTC**. No accounts, no chat — just stream and watch.

---

## Project Structure

```
Streamed.io/
├── server/          ← Signaling server (deploy this)
│   ├── package.json
│   └── index.js
└── app/             ← Electron desktop app
    ├── package.json
    ├── .env         ← Set your server URL here
    ├── vite.config.js
    ├── index.html
    ├── electron/
    │   ├── main.js
    │   └── preload.js
    └── src/
        ├── config.js
        ├── App.jsx
        ├── components/TitleBar.jsx
        ├── screens/HomeScreen.jsx
        ├── screens/StreamerScreen.jsx
        ├── screens/ViewerScreen.jsx
        ├── hooks/useStreamer.js
        ├── hooks/useViewer.js
        └── styles/globals.css
```

---

## Setup

### 1. Start the Signaling Server

```bash
cd server
npm install
npm start        # runs on port 3001
```

For internet access, deploy this to a VPS (Railway, Render, Fly.io, etc).  
Free options: [Railway](https://railway.app) or [Render](https://render.com)

### 2. Configure the App

Edit `app/.env`:
```env
VITE_SERVER_URL=https://your-deployed-server.com
```
For local dev, leave it as `http://localhost:3001`.

### 3. Run the App (Development)

```bash
cd app
npm install
npm run dev
```

This starts Vite + Electron together.

### 4. Package for Distribution

```bash
cd app
npm run package
```

Output: `app/release/` — Windows NSIS installer.

---

## How It Works

1. **Streamer** → clicks "Go Live" → picks a screen → gets a 6-char room code
2. **Viewer** → clicks "Watch Stream" → types the room code → stream starts playing

After the initial WebRTC handshake (via the signaling server), **all video/audio travels directly P2P** between streamer and viewer — the signaling server is never involved again.

### Quality

| Setting | Value |
|---|---|
| Resolution | 1920×1080 |
| Frame Rate | 60 fps |
| Video Bitrate | 8 Mbps (H264) |
| Audio | System loopback (Windows) / 320 kbps |
| Protocol | WebRTC with TURN fallback |

---

## Internet Connectivity

For viewers outside your local network, the app uses:
- **Google STUN** servers — for most direct P2P connections
- **OpenRelay TURN** servers — as a fallback for strict NATs

For production, replace OpenRelay with your own TURN server (e.g. [coturn](https://github.com/coturn/coturn) or [Metered](https://metered.ca)) in `app/src/config.js`.
