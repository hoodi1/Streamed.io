# Streamed.io — High-Level Design (HLD)
**Author:** Principal Architect Review  
**Version:** 1.0  
**Date:** July 2026

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Goals & Constraints](#2-system-goals--constraints)
3. [Architecture Overview](#3-architecture-overview)
4. [Component Deep-Dive](#4-component-deep-dive)
5. [The WebRTC Protocol — Full Explanation](#5-the-webrtc-protocol--full-explanation)
6. [What is ngrok & How It Works](#6-what-is-ngrok--how-it-works)
7. [Data Flow — Step by Step](#7-data-flow--step-by-step)
8. [NAT Traversal: STUN & TURN](#8-nat-traversal-stun--turn)
9. [Media Pipeline](#9-media-pipeline)
10. [Topology: Mesh vs SFU](#10-topology-mesh-vs-sfu)
11. [Security Model](#11-security-model)
12. [Scalability Analysis](#12-scalability-analysis)
13. [Failure Modes & Mitigations](#13-failure-modes--mitigations)
14. [Future Architecture (SFU Path)](#14-future-architecture-sfu-path)

---

## 1. Executive Summary

Streamed.io is a **desktop screen-streaming application** built on WebRTC (Web Real-Time Communication). It enables one user (Streamer) to broadcast their screen at 1080p/60fps to multiple remote viewers with sub-200ms latency — comparable to Discord's screen-share quality.

The core design principle is **media bypass**: the signaling server (the only "cloud" component) never touches audio or video data. All media travels directly peer-to-peer (P2P) between the streamer's machine and each viewer's machine.

---

## 2. System Goals & Constraints

### Goals
| Goal | Implementation |
|---|---|
| 1080p @ 60fps streaming | `desktopCapturer` with `maxWidth:1920, maxHeight:1080, maxFrameRate:60` |
| Sub-200ms latency | WebRTC P2P — no server relay for media |
| Works across internet | STUN/TURN for NAT traversal; ngrok/Railway for signaling |
| No account required | 6-char random room code system |
| Hardware-accelerated encoding | H264 codec preference via SDP manipulation |

### Constraints
| Constraint | Reason |
|---|---|
| Streamer's upload bandwidth caps viewers | Mesh topology — each viewer gets a full separate stream |
| ngrok URL changes on restart (free tier) | Tunnel re-established per session |
| TURN server is public/shared | OpenRelay is free but rate-limited; not for production |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        INTERNET                                  │
│                                                                  │
│  ┌──────────────┐    WebSocket     ┌─────────────────────────┐  │
│  │   STREAMER   │◄────────────────►│   SIGNALING SERVER      │  │
│  │  (Electron)  │    (signaling    │   (Node.js/Socket.IO)   │  │
│  │              │     only)        │   port 3001             │  │
│  │  ┌────────┐  │                  │   ↕ ngrok tunnel        │  │
│  │  │ Screen │  │◄────────────────►│   https://xyz.ngrok.app │  │
│  │  │Capture │  │                  └─────────────────────────┘  │
│  │  └────────┘  │                            ▲                   │
│  └──────┬───────┘                            │ WebSocket         │
│         │                                    │ (signaling only)  │
│         │  WebRTC P2P (Direct)               │                   │
│         │  Video + Audio                     │                   │
│         │  8 Mbps / 320kbps                  │                   │
│         │                           ┌────────┴──────┐           │
│         └──────────────────────────►│   VIEWER(S)   │           │
│                                     │  (Electron)   │           │
│         (If NAT blocks direct)      └───────────────┘           │
│         ┌─────────────────────────────────────────────┐         │
│         │           TURN SERVER (Relay)                │         │
│         │        openrelay.metered.ca                  │         │
│         │  Streamer → TURN → Viewer (fallback only)    │         │
│         └─────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

### The three planes of operation

| Plane | What travels | Via |
|---|---|---|
| **Signaling plane** | Room codes, WebRTC offers/answers, ICE candidates | Socket.IO → ngrok → Internet |
| **Media plane** | Raw video frames + audio | WebRTC P2P (direct or TURN relay) |
| **Control plane** | Window resize, stop stream | Electron IPC (local only) |

---

## 4. Component Deep-Dive

### 4.1 Electron Main Process (`electron/main.js`)

The **host process** of the desktop app. Responsible for:
- Creating the `BrowserWindow` (the visible app window)
- Calling `desktopCapturer.getSources()` to enumerate screens/windows for the picker UI
- Granting media permissions via `setPermissionRequestHandler` (required for `getUserMedia` with `chromeMediaSource: 'desktop'`)
- Bridging IPC calls (window minimize/maximize/close, get-sources) between the OS and the renderer

```
OS ──desktopCapturer──► main.js ──IPC──► preload.js ──contextBridge──► React UI
```

**Why `webSecurity: false`?**  
Electron's default security policy blocks `navigator.mediaDevices.getUserMedia` with `chromeMediaSource: 'desktop'`. Disabling `webSecurity` is the standard workaround for screen capture in Electron.

---

### 4.2 Preload Script (`electron/preload.js`)

A **security boundary** between Node.js and the browser renderer. Uses Electron's `contextBridge` to expose only 4 specific functions to the React UI:

```js
window.electronAPI = {
  getSources,   // enumerate screens
  minimize,     // window controls
  maximize,
  close
}
```

This means the React app has **zero direct access to Node.js APIs** — only what's explicitly exposed. This is a security best practice (Context Isolation).

---

### 4.3 Signaling Server (`server/index.js`)

A **lightweight message broker** built with Express + Socket.IO. It does exactly three things:

1. **Room management** — Generates 6-char codes, maps `roomCode → {streamerId, Set<viewerIds>}`
2. **Presence relay** — Tells the streamer when a new viewer joins (`viewer-joined`)
3. **SDP/ICE relay** — Forwards WebRTC offer/answer/candidate messages between peers by socket ID

**Critical design decision: The server never sees media.**  
It only relays ~5KB of JSON per connection (the WebRTC handshake messages). After `connectionState === 'connected'`, the Socket.IO connection goes completely idle.

```
Memory footprint per room:
  roomCode (6 bytes) + streamerId (20 bytes) + Set<viewerIds> (~20 bytes each)
  = ~100 bytes per room, regardless of stream quality or duration
```

---

### 4.4 `useStreamer.js` Hook

The **core streaming engine**. State machine:

```
idle ──startStreaming()──► connecting ──room created──► live
                                    └──error──► error
live ──stopStreaming()──► idle
```

Key operations:
1. Captures screen via `getUserMedia` with `chromeMediaSource: 'desktop'`
2. Connects Socket.IO to signaling server, emits `create-room`
3. On `viewer-joined` event: creates a new `RTCPeerConnection` for that viewer, adds all tracks, creates an offer (with H264 preferred), sends it via signaling
4. On connection established: calls `setParameters()` to lock video at 8 Mbps / 60fps

**One `RTCPeerConnection` per viewer** — this is the Mesh topology.

---

### 4.5 `useViewer.js` Hook

The **receiver engine**. Simpler than the streamer:

1. Connects Socket.IO, emits `join-room` with the room code
2. Waits for `offer` event from the signaling server (forwarded from streamer)
3. Creates `RTCPeerConnection`, sets remote description, generates answer, sends back
4. On `ontrack` event: attaches the incoming `MediaStream` to a `<video>` element

---

### 4.6 `config.js` — Quality & Codec Settings

```js
VIDEO_BITRATE = 8_000_000  // 8 Mbps
AUDIO_BITRATE = 320_000    // 320 kbps
maxWidth  = 1920
maxHeight = 1080
maxFrameRate = 60
```

**H264 SDP manipulation:**  
WebRTC by default may negotiate VP8 or VP9 codec. H264 is preferred because it has **hardware encoder/decoder support** on most modern GPUs (Intel QuickSync, NVIDIA NVENC, Apple VideoToolbox). The `preferH264()` function rewrites the SDP `m=video` line to put H264 payload types first, forcing negotiation to H264 when both sides support it.

---

## 5. The WebRTC Protocol — Full Explanation

WebRTC (Web Real-Time Communication) is a browser/runtime standard for **direct P2P communication** — audio, video, and data — without plugins or servers handling the media.

### 5.1 What Problem Does It Solve?

Traditional streaming (YouTube, Twitch) works like this:
```
Streamer → Upload to CDN server → CDN encodes & distributes → Viewers download
```
This introduces 5-30 seconds of latency (the CDN needs to buffer segments).

WebRTC eliminates the server from the media path:
```
Streamer → [handshake via server] → Direct to Viewer
```
Latency drops to 50-200ms — real-time.

### 5.2 The Three Core Components of WebRTC

```
┌─────────────────────────────────────────────────────────────┐
│                    WebRTC Stack                              │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  getUserMedia / desktopCapturer                       │   │
│  │  (Capture: camera, mic, screen)                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↓                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  RTCPeerConnection                                    │   │
│  │  - SDP negotiation (what codecs, what formats)        │   │
│  │  - ICE (find a network path between peers)            │   │
│  │  - DTLS (encrypt the connection)                      │   │
│  │  - SRTP (encrypt the media)                           │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↓                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  RTCDataChannel (not used here — media only)         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 SDP — Session Description Protocol

SDP is the "menu" both peers exchange to agree on capabilities:

```
v=0
o=- 123456 2 IN IP4 127.0.0.1
m=video 9 UDP/TLS/RTP/SAVPF 96 97 98   ← codec payload type IDs
a=rtpmap:96 H264/90000                  ← H264 at 90kHz clock
a=rtpmap:97 VP8/90000
a=fmtp:96 profile-level-id=42e01f      ← H264 profile (Baseline)
m=audio 9 UDP/TLS/RTP/SAVPF 111
a=rtpmap:111 opus/48000/2              ← Opus audio codec
```

The `preferH264()` function in `config.js` moves `96` (H264) to the front of `m=video 9 UDP/TLS/RTP/SAVPF **96** 97 98` so both peers agree on H264 first.

### 5.4 ICE — Interactive Connectivity Establishment

ICE is the process of finding the best network path between two peers. It collects **candidates** (possible connection addresses):

| Candidate Type | What It Is | Priority |
|---|---|---|
| `host` | Local network IP (e.g., `192.168.1.5:54321`) | Highest |
| `srflx` (server-reflexive) | Your public IP as seen by STUN server | Medium |
| `relay` | TURN server IP — the fallback | Lowest |

ICE tries all candidates in priority order and uses the best one that works.

---

## 6. What is ngrok & How It Works

### 6.1 The Problem: localhost is not the internet

When you run `node index.js` on your machine, the signaling server listens on `127.0.0.1:3001`. This address is only reachable from **your own machine**. People on the internet cannot connect to `localhost`.

### 6.2 What ngrok Does

ngrok creates a **reverse tunnel** — it punches a hole from the public internet into your localhost:

```
                  ngrok's cloud
                  ┌───────────────────────────────────────┐
Internet ────────►│ https://abc123.ngrok-free.app  (443)  │
                  │                                        │
                  │  ngrok agent (running on your PC)      │
                  │  maintains persistent TCP connection   │
                  │  ↕  to ngrok cloud                     │
                  └─────────────────┬─────────────────────┘
                                    │
                                    ▼ localhost tunnel
                         Your PC: 127.0.0.1:3001
                         (node index.js)
```

### 6.3 Step-by-Step: How a Request Flows Through ngrok

1. **Friend's app** sends a WebSocket connection request to `https://abc123.ngrok-free.app`
2. **ngrok cloud** receives it on port 443
3. **ngrok cloud** forwards it through the **persistent TCP tunnel** that your local `ngrok` agent maintains
4. **ngrok agent** (on your machine) forwards it to `127.0.0.1:3001`
5. **Your signaling server** handles the Socket.IO connection
6. **Response** travels back the same path in reverse

### 6.4 What ngrok Does NOT Do

In Streamed.io, ngrok only handles **signaling traffic** (the WebRTC handshake). Once the WebRTC connection is established, all video/audio flows **directly P2P** and never touches ngrok.

```
Total data through ngrok per viewer session:
  - Socket.IO handshake: ~2KB
  - create-room / join-room: ~0.5KB
  - SDP offer + answer: ~2KB
  - ICE candidates: ~1KB
  ─────────────────────
  Total: ~5KB (regardless of stream duration or quality)
```

### 6.5 ngrok Architecture Internals

```
┌──────────────────────────────────────────────────────────────┐
│  YOUR MACHINE                                                 │
│                                                               │
│  ┌───────────────┐       ┌──────────────────────────────┐   │
│  │  node index.js│       │  ngrok agent (ngrok.exe)     │   │
│  │  port 3001    │◄─────►│  - TLS tunnel to ngrok cloud │   │
│  └───────────────┘       │  - Multiplexes requests over │   │
│                           │    single persistent conn    │   │
│                           └──────────────┬───────────────┘   │
└──────────────────────────────────────────┼───────────────────┘
                                           │ TLS 1.3
                                           ▼
                              ┌────────────────────────┐
                              │  ngrok Cloud           │
                              │  - Edge servers (CDN)  │
                              │  - TLS termination     │
                              │  - HTTP/WS routing     │
                              │  - Free: random subdomain│
                              │  - Paid: custom domain │
                              └────────────┬───────────┘
                                           │ HTTPS / WSS
                                           ▼
                                    Friend's device
```

### 6.6 Free Tier Limitations

| Limitation | Impact on Streamed.io |
|---|---|
| URL changes on restart | Must re-share URL to viewers each session |
| 1 tunnel at a time | Fine — only 1 signaling server needed |
| ~40 conn/min rate limit | Fine — only ~5KB per viewer connection |
| No custom domain | Minor UX friction only |

---

## 7. Data Flow — Step by Step

### Phase 1: Streamer starts

```
Streamer App                 Signaling Server (via ngrok)
     │                               │
     │── WebSocket connect ─────────►│
     │                               │ registers socket, assigns ID
     │── create-room ───────────────►│
     │                               │ generates code "N7K3PQ"
     │                               │ stores { streamerId: "abc", viewers: Set{} }
     │◄── { code: "N7K3PQ" } ───────│
     │                               │
  [shows room code on screen]        │
```

### Phase 2: Viewer joins

```
Viewer App                   Signaling Server
     │                               │
     │── WebSocket connect ─────────►│
     │── join-room("N7K3PQ") ───────►│
     │                               │ looks up room → found
     │                               │ adds viewer to room.viewers
     │                               │──── viewer-joined → Streamer ────►
     │◄── { success: true } ─────────│
```

### Phase 3: WebRTC handshake (via signaling server)

```
Streamer                    Signaling                    Viewer
    │                           │                           │
    │  (on viewer-joined)       │                           │
    │  creates RTCPeerConnection│                           │
    │  addTrack(screenStream)   │                           │
    │  createOffer()            │                           │
    │  [SDP with H264 pref]     │                           │
    │── offer ─────────────────►│── offer ─────────────────►│
    │                           │   (relay by socket ID)    │
    │                           │       creates RTCPeerConnection
    │                           │       setRemoteDescription(offer)
    │                           │       createAnswer()
    │                           │◄── answer ────────────────│
    │◄── answer ────────────────│                           │
    │  setRemoteDescription()   │                           │
    │                           │                           │
    │── ICE candidates ────────►│── ICE candidates ────────►│
    │◄── ICE candidates ────────│◄── ICE candidates ─────────│
    │                           │                           │
    │  (ICE checks all paths: host → srflx → relay)        │
```

### Phase 4: Direct P2P connection established

```
Streamer                                              Viewer
    │                                                    │
    │══════════════ WebRTC DTLS/SRTP ════════════════════│
    │    Video: H264, 8 Mbps, 1080p/60fps                │
    │    Audio: Opus, 320 kbps                           │
    │                                                    │
    │  (Signaling server is completely idle now)         │
    │  (ngrok carries zero bytes of media)               │
```

---

## 8. NAT Traversal: STUN & TURN

Most home internet connections are **behind NAT** (Network Address Translation). Your router has a public IP, but your PC has a private IP (e.g., `192.168.1.5`). Two people behind different NATs cannot directly connect without help.

### 8.1 STUN (Session Traversal Utilities for NAT)

STUN tells you **what your public IP and port look like** from the internet:

```
Your PC (192.168.1.5:54321)
    │── "What's my public address?" ──►  stun.l.google.com:19302
    │◄── "You look like 203.0.113.42:12345" ──────────────────
```

The `srflx` (server-reflexive) candidate `203.0.113.42:12345` is then sent to the viewer via signaling. The viewer tries to connect directly to that address. For most home NATs (Full Cone, Restricted Cone), this works.

### 8.2 TURN (Traversal Using Relays around NAT)

For **Symmetric NAT** (common on corporate/mobile networks), STUN-discovered addresses don't work. TURN is the relay fallback:

```
Streamer ──media──► TURN server ──media──► Viewer
```

The TURN server acts as a relay, but it does carry the full media stream. This is why latency increases slightly (~50ms more) and bandwidth is consumed on both sides.

**Config in Streamed.io:**
```js
{ urls: 'turn:openrelay.metered.ca:80',  username: 'openrelayproject', credential: 'openrelayproject' }
{ urls: 'turns:openrelay.metered.ca:443' }  // TLS-encrypted TURN
```

WebRTC automatically falls back to TURN only if all direct paths fail.

---

## 9. Media Pipeline

```
OS Display Buffer
    │
    ▼
desktopCapturer (Chromium/Electron)
    │  [captures at OS compositing level — includes GPU-rendered content]
    │
    ▼
MediaStreamTrack (raw frames @ 1080p/60fps)
    │
    ▼
RTCPeerConnection encoder
    │  [H264 encoding — uses hardware if available: NVENC / QuickSync / VideoToolbox]
    │  [target: 8 Mbps max, enforced via RTCRtpSender.setParameters()]
    │
    ▼
SRTP (Secure RTP) — encrypted packetized video
    │
    ▼
UDP transport (ICE-selected path)
    │
    ▼
Network → [STUN direct] or [TURN relay]
    │
    ▼
Viewer RTCPeerConnection decoder
    │  [H264 decode — hardware accelerated]
    │
    ▼
MediaStreamTrack
    │
    ▼
<video> element (HTMLVideoElement.srcObject)
    │
    ▼
Viewer screen
```

### Audio Pipeline (Windows loopback)

```
System audio output (all apps)
    │
    ▼
chromeMediaSource: 'desktop' audio capture
    │  [captures loopback — whatever plays on your speakers]
    │
    ▼
Opus encoding @ 320 kbps
    │
    ▼
SRTP → same UDP connection (bundled with video via max-bundle)
    │
    ▼
Viewer speakers
```

---

## 10. Topology: Mesh vs SFU

### Current: Mesh (P2P per viewer)

```
         ┌─── 8 Mbps ───► Viewer 1
Streamer ├─── 8 Mbps ───► Viewer 2
         └─── 8 Mbps ───► Viewer 3

Upload required: 8 Mbps × N viewers
```

| Viewers | Upload required | Feasibility |
|---|---|---|
| 1 | 8 Mbps | ✅ Any broadband |
| 3 | 24 Mbps | ✅ Good connection |
| 5 | 40 Mbps | ⚠️ Needs fiber |
| 10+ | 80+ Mbps | ❌ Most home connections |

### Future: SFU (Selective Forwarding Unit)

```
         ──8 Mbps──► SFU ──8 Mbps──► Viewer 1
Streamer             │  ──8 Mbps──► Viewer 2
                     └──8 Mbps──► Viewer 3...100

Upload required: 8 Mbps regardless of viewer count
```

Implementing this would require replacing `useStreamer.js` with a mediasoup or LiveKit SDK integration. The signaling server would also need to be replaced with an SFU server.

---

## 11. Security Model

| Layer | What's Protected | How |
|---|---|---|
| Signaling (ngrok) | Transport | TLS 1.3 (HTTPS/WSS) |
| Media | Confidentiality + integrity | DTLS 1.2 (key exchange) + SRTP (encryption) |
| Screen capture | OS-level permission | Windows/macOS consent dialog |
| App bridge | Renderer isolation | Electron contextBridge (IPC only) |

**What's NOT protected:**
- Room codes are not password-protected — anyone with the code can join
- No authentication — the signaling server doesn't verify identities
- For private streams, share the room code securely (e.g., via Signal/WhatsApp)

---

## 12. Scalability Analysis

| Component | Current Limit | Bottleneck |
|---|---|---|
| Signaling server | ~10,000 concurrent rooms | Node.js single-thread; ~100 bytes RAM/room |
| ngrok free tier | 40 connections/min | Rate limit on tunnel |
| Stream quality | Limited by streamer upload | 8 Mbps × viewer count |
| Viewer count | ~5 comfortably | Streamer upload bandwidth |

---

## 13. Failure Modes & Mitigations

| Failure | Symptom | Current Mitigation |
|---|---|---|
| Signaling server crashes | All streams drop | Streamer restarts server; viewers see "Stream ended" |
| ngrok tunnel drops | New viewers can't connect | ngrok auto-reconnects; in-progress streams unaffected |
| NAT traversal fails | Viewer can't connect | OpenRelay TURN fallback |
| TURN server overloaded | Degraded quality | ICE automatically switches candidates |
| Streamer closes app | `stream-ended` event | Signaling server broadcasts to all viewers |
| Viewer disconnects | No effect on others | Peer connection closed; streamer's upload drops by 8 Mbps |

---

## 14. Future Architecture (SFU Path)

To support 50-1000+ viewers, the evolution path is:

```
Phase 1 (Current): Mesh P2P — 1-5 viewers
Phase 2: SFU — mediasoup or LiveKit — unlimited viewers, server cost

Technology choices for Phase 2:
  - mediasoup (self-hosted, TypeScript) — most control, complex setup
  - LiveKit (managed/self-hosted, Go) — easiest migration, free tier available
  - ion-sfu (Go) — minimal, educational

Architecture change required:
  - Replace RTCPeerConnection mesh with SFU SDK
  - Replace signaling server with SFU server
  - Add optional recording/relay via HLS for 1000+ viewers
  - Estimate: 2-3 weeks of engineering work
```

---

## Summary Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         STREAMED.IO FULL STACK                          │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  ELECTRON APP (both streamer and viewer)                          │   │
│  │                                                                    │   │
│  │  ┌──────────┐  IPC  ┌────────────┐  contextBridge  ┌──────────┐  │   │
│  │  │main.js   │◄─────►│preload.js  │◄───────────────►│React UI  │  │   │
│  │  │          │       │            │                  │          │  │   │
│  │  │desktop   │       │getSources  │                  │App.jsx   │  │   │
│  │  │Capturer  │       │minimize    │                  │HomeScreen│  │   │
│  │  │          │       │maximize    │                  │Streamer  │  │   │
│  │  │session   │       │close       │                  │Viewer    │  │   │
│  │  │perms     │       └────────────┘                  │          │  │   │
│  │  └──────────┘                                       │useStreamer│  │   │
│  │                                                     │useViewer │  │   │
│  │                                                     └──────────┘  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  SIGNALING SERVER (server/index.js)                               │   │
│  │  Express + Socket.IO                                               │   │
│  │  Rooms Map: code → {streamerId, Set<viewerIds>}                    │   │
│  │  Events: create-room, join-room, offer, answer, ice-candidate      │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                            ↕  ngrok tunnel                               │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  NGROK EDGE (abc123.ngrok-free.app)                               │   │
│  │  TLS termination → TCP tunnel → localhost:3001                    │   │
│  │  Carries: ~5KB per session (signaling only, zero media)            │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌────────────────────────────┐   ┌───────────────────────────────────┐ │
│  │  STUN (Google)             │   │  TURN (OpenRelay)                 │ │
│  │  stun.l.google.com:19302   │   │  openrelay.metered.ca             │ │
│  │  Discovers public IP/port  │   │  Media relay (fallback only)      │ │
│  │  for direct P2P            │   │  Used when NAT blocks direct path │ │
│  └────────────────────────────┘   └───────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```
