# 🎬 Streamer Setup Guide

You are the **host**. You run the server, create the ngrok tunnel, and share the room code with viewers.

---

## Prerequisites

- [Node.js **v20 or higher**](https://nodejs.org) installed — check with `node --version`
- [ngrok](https://ngrok.com/download) installed
- A free ngrok account at [dashboard.ngrok.com](https://dashboard.ngrok.com)

> ⚠️ **Windows users:** Run all commands in **Command Prompt or PowerShell** — NOT in WSL/bash. Electron is a native GUI app and will not display through WSL.

> ⚠️ **Node.js version:** v18 or older will fail during `npm install`. If you see an `ERR_REQUIRE_ESM` error, upgrade Node.js to v20+ from [nodejs.org](https://nodejs.org) then delete `node_modules` and run `npm install` again.

---

## One-time Setup

### 1. Clone the repo

```bash
git clone https://github.com/hoodi1/Streamed.io.git
cd Streamed.io
```

### 2. Install dependencies

```bash
cd server
npm install

cd ../app
npm install
```

### 3. Save your ngrok auth token (do this once)

1. Sign up at [dashboard.ngrok.com](https://dashboard.ngrok.com)
2. Go to **"Your Authtoken"** → copy it
3. Run:
```bash
ngrok config add-authtoken YOUR_TOKEN_HERE
```

---

## Every Time You Want to Stream

Open **3 terminals** and run one command in each:

### Terminal 1 — Start the signaling server
```bash
cd Streamed.io/server
node index.js
```
✅ You should see: `✓ Streamed.io signaling server running on port 3001`

### Terminal 2 — Start the ngrok tunnel
```bash
ngrok http 3001
```
✅ You'll see a URL like:
```
Forwarding   https://abc123.ngrok-free.app -> http://localhost:3001
```
📋 **Copy the `https://...` URL — you'll need it in the next step.**

### Terminal 3 — Update `.env` and start the app

1. Open `Streamed.io/app/.env` in any text editor
2. Replace the server URL with your ngrok URL:
```
VITE_SERVER_URL=https://abc123.ngrok-free.app
```
3. Save the file, then run:
```bash
cd Streamed.io/app
node start.js
```
✅ The Streamed.io app opens on your screen.

---

## Go Live

1. In the app, click **"Go Live"**
2. Select the screen or window you want to share
3. A **6-character room code** appears (e.g. `N7K3PQ`)

---

## Share With Viewers

Send your viewers **two things**:
1. Your **ngrok URL**: `https://abc123.ngrok-free.app`
2. Your **room code**: e.g. `N7K3PQ`

They follow the [VIEWER.md](./VIEWER.md) guide to join.

---

## Notes

- The ngrok URL **changes every time** you restart ngrok on the free tier. Send the new URL to viewers each session.
- The actual video stream travels **directly P2P** between you and viewers — it does NOT go through ngrok. Ngrok only handles the initial connection setup (~5KB).
- Stop streaming: click **"Stop Streaming"** in the app or close it.
