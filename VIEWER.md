# 👁 Viewer Setup Guide

You are a **viewer**. The streamer will send you a URL and a room code — that's all you need.

---

## Prerequisites

- [Node.js **v20 or higher**](https://nodejs.org) installed — check with `node --version`
- The **ngrok URL** from the streamer (e.g. `https://abc123.ngrok-free.app`)
- The **room code** from the streamer (e.g. `N7K3PQ`)

> ⚠️ **Windows users:** Run all commands in **Command Prompt or PowerShell** — NOT in WSL/bash. Electron is a native GUI app and will not display through WSL.

> ⚠️ **Node.js version:** v18 or older will fail during `npm install`. If you see an `ERR_REQUIRE_ESM` error, upgrade Node.js to v20+ from [nodejs.org](https://nodejs.org) then delete `node_modules` and run `npm install` again.

---

## One-time Setup

### 1. Clone the repo

```bash
git clone https://github.com/hoodi1/Streamed.io.git
cd Streamed.io/app
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set the server URL

1. Open `Streamed.io/app/.env` in any text editor
2. Replace the server URL with the **ngrok URL the streamer sent you**:
```
VITE_SERVER_URL=https://abc123.ngrok-free.app
```
3. Save the file.

---

## Every Time You Want to Watch

```bash
cd Streamed.io/app
node start.js
```

✅ The Streamed.io app opens on your screen.

---

## Join a Stream

1. Click **"Watch Stream"**
2. Type the **room code** the streamer gave you (e.g. `N7K3PQ`)
3. Press **Join**
4. ✅ The stream starts playing

---

## Controls

| Action | How |
|---|---|
| Fullscreen | Click the ⊞ icon (top right of video) |
| Exit fullscreen | Click the ⊠ icon or press `Esc` |
| Leave stream | Click the → icon (top right) |

---

## Notes

- **If you can't connect:** Ask the streamer to confirm their ngrok tunnel is still running. The URL changes every time they restart ngrok.
- **If the stream ends:** You'll see a "Stream ended" screen. The streamer has stopped sharing.
- You do **not** need to run any server yourself — just the app.
- The video travels **directly P2P** from the streamer to you once connected. No middleman after the initial handshake.
