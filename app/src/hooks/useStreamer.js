import { useRef, useState, useCallback, useEffect } from 'react';
import { io } from 'socket.io-client';
import { SERVER_URL, ICE_SERVERS, VIDEO_CONSTRAINTS, VIDEO_BITRATE, AUDIO_BITRATE, preferH264 } from '../config.js';

// Bypass ngrok browser interstitial page (required for Socket.IO through ngrok free tier)
const SOCKET_OPTS = {
  transports: ['websocket'],
  reconnection: false,
  extraHeaders: { 'ngrok-skip-browser-warning': 'true' },
};

export function useStreamer() {
  const socketRef = useRef(null);
  const peersRef  = useRef({});       // viewerId -> RTCPeerConnection
  const streamRef = useRef(null);
  const [roomCode,    setRoomCode]    = useState(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [status,      setStatus]      = useState('idle'); // idle|connecting|live|error

  const applyMaxBitrate = useCallback(async (pc) => {
    for (const sender of pc.getSenders()) {
      if (!sender.track) continue;
      const params = sender.getParameters();
      if (!params.encodings?.length) params.encodings = [{}];
      if (sender.track.kind === 'video') {
        params.encodings[0].maxBitrate      = VIDEO_BITRATE;
        params.encodings[0].maxFramerate    = 60;
        params.encodings[0].priority        = 'high';
        params.encodings[0].networkPriority = 'high';
      } else if (sender.track.kind === 'audio') {
        params.encodings[0].maxBitrate = AUDIO_BITRATE;
        params.encodings[0].priority   = 'high';
      }
      try { await sender.setParameters(params); } catch { /* ignore */ }
    }
  }, []);

  const createPeerForViewer = useCallback(async (viewerId, stream) => {
    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    });
    peersRef.current[viewerId] = pc;

    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    pc.onicecandidate = (e) => {
      if (e.candidate) socketRef.current?.emit('ice-candidate', { to: viewerId, candidate: e.candidate });
    };

    pc.onconnectionstatechange = async () => {
      console.log(`[Peer ${viewerId.slice(0, 6)}] ${pc.connectionState}`);
      if (pc.connectionState === 'connected') await applyMaxBitrate(pc);
      if (pc.connectionState === 'failed')    { pc.close(); delete peersRef.current[viewerId]; }
    };

    const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
    offer.sdp = preferH264(offer.sdp);
    await pc.setLocalDescription(offer);
    socketRef.current?.emit('offer', { to: viewerId, offer });
  }, [applyMaxBitrate]);

  const startStreaming = useCallback(async (sourceId, includeAudio = false) => {
    setStatus('connecting');
    try {
      // Capture screen. Audio loopback is opt-in (off by default to avoid Discord echo).
      let captureStream;
      if (includeAudio) {
        try {
          captureStream = await navigator.mediaDevices.getUserMedia({
            audio: { mandatory: { chromeMediaSource: 'desktop' } },
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId,
                maxWidth:     VIDEO_CONSTRAINTS.maxWidth,
                maxHeight:    VIDEO_CONSTRAINTS.maxHeight,
                maxFrameRate: VIDEO_CONSTRAINTS.maxFrameRate,
                minFrameRate: VIDEO_CONSTRAINTS.minFrameRate,
              },
            },
          });
        } catch {
          console.warn('System audio unavailable — falling back to video only');
          captureStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId,
                maxWidth:     VIDEO_CONSTRAINTS.maxWidth,
                maxHeight:    VIDEO_CONSTRAINTS.maxHeight,
                maxFrameRate: VIDEO_CONSTRAINTS.maxFrameRate,
              },
            },
          });
        }
      } else {
        // Audio OFF — video only (prevents Discord/voice chat echo)
        captureStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
              maxWidth:     VIDEO_CONSTRAINTS.maxWidth,
              maxHeight:    VIDEO_CONSTRAINTS.maxHeight,
              maxFrameRate: VIDEO_CONSTRAINTS.maxFrameRate,
              minFrameRate: VIDEO_CONSTRAINTS.minFrameRate,
            },
          },
        });
      }
      streamRef.current = captureStream;

      // Auto-stop if user dismisses the OS screen share dialog
      captureStream.getVideoTracks()[0].onended = () => stopStreaming();

      const socket = io(SERVER_URL, SOCKET_OPTS);
      socketRef.current = socket;

      socket.on('connect', () => {
        socket.emit('create-room', (res) => {
          if (res.error) { setStatus('error'); return; }
          setRoomCode(res.code);
          setStatus('live');
        });
      });

      socket.on('connect_error', () => setStatus('error'));

      socket.on('viewer-joined',  ({ viewerId }) => createPeerForViewer(viewerId, captureStream));
      socket.on('viewer-count',   (n) => setViewerCount(n));

      socket.on('answer', async ({ from, answer }) => {
        const pc = peersRef.current[from];
        if (pc && pc.signalingState !== 'stable')
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
      });

      socket.on('ice-candidate', async ({ from, candidate }) => {
        const pc = peersRef.current[from];
        if (pc && candidate)
          try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* ignore */ }
      });
    } catch (err) {
      console.error('startStreaming:', err);
      setStatus('error');
    }
  }, [createPeerForViewer]);

  const stopStreaming = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    Object.values(peersRef.current).forEach((pc) => pc.close());
    peersRef.current = {};
    socketRef.current?.disconnect();
    socketRef.current = null;
    setStatus('idle');
    setRoomCode(null);
    setViewerCount(0);
  }, []);

  useEffect(() => () => stopStreaming(), [stopStreaming]);

  return { startStreaming, stopStreaming, roomCode, viewerCount, status };
}
