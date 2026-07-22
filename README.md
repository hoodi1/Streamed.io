# Streamed.io

Low-latency **1080p / 60fps** desktop screen streaming app powered by **WebRTC**. Built for seamless high-quality screen sharing with friends without complex setups or accounts.

---

## 🚀 Key Features

* **Real-Time P2P Streaming:** Sub-200ms ultra-low latency direct peer-to-peer WebRTC streaming.
* **1080p / 60fps High Quality:** 8 Mbps H264 hardware-accelerated video pipeline.
* **Independent Viewer Volume Controls:** Viewers have 1-click **Mute/Unmute** and a smooth **0–100% Volume Slider** directly on the playback overlay to easily balance stream sound with Discord or voice calls.
* **Stream Audio Modes:** Toggle system audio on or off to suit your setup (e.g. video-only when chatting on Discord).
* **Screens & Windows Picker:** Organized source selection with application icons and clear screen/window grouping.
* **NAT Traversal:** Includes Google STUN and OpenRelay TURN configurations to connect across different networks and firewalls.

---

## 📁 Project Structure

```text
Streamed.io/
├── server/          ← Signaling server (Node.js + Socket.io)
│   ├── package.json
│   └── index.js
└── app/             ← Electron + React desktop app
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

## 🛠️ Setup & Running

### Prerequisites
* **Node.js v20 or higher** (check with `node --version`)
* Run commands in **Command Prompt or PowerShell** on Windows (avoid WSL/bash for GUI apps)

### 1. Start the Signaling Server

```bash
cd server
npm install
npm start        # runs on port 3001
```

For remote connections over the internet, deploy the server to [Railway](https://railway.app) or use [ngrok](https://ngrok.com) (`ngrok http 3001`).

### 2. Configure the App

Edit `app/.env`:
```env
VITE_SERVER_URL=https://your-signaling-server.ngrok-free.app
```

### 3. Run the Desktop App

```bash
cd app
npm install
node start.js
```

---

## 📖 Usage Guide

* **Streamer Guide:** See [STREAMER.md](./STREAMER.md) for hosting and ngrok setup instructions.
* **Viewer Guide:** See [VIEWER.md](./VIEWER.md) for joining streams and using overlay controls.

---

## ⚡ Technical Specifications

| Feature | Specification |
|---|---|
| **Max Resolution** | 1920 × 1080 |
| **Target Frame Rate** | 60 fps |
| **Video Bitrate** | 8 Mbps (H264) |
| **Audio Bitrate** | 320 kbps (Opus) |
| **Viewer Controls** | Mute/Unmute, Volume Slider (0–100%), Fullscreen |
| **Protocols** | WebSockets (signaling) + WebRTC P2P (media) |
