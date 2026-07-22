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
  const audioCtxRef = useRef(null);
  const processAudioCleanupRef = useRef(null);

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

  const startStreaming = useCallback(async (sourceInput, includeAudio = false) => {
    setStatus('connecting');
    try {
      const sourceId = typeof sourceInput === 'object' ? sourceInput.id : sourceInput;
      const sourceType = typeof sourceInput === 'object' ? sourceInput.type : (sourceId.startsWith('screen:') ? 'screen' : 'window');
      const pid = typeof sourceInput === 'object' ? sourceInput.pid : null;

      let captureStream;

      // Always capture video first
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

      // Handle Audio options
      if (includeAudio) {
        if (sourceType === 'window' && pid && window.electronAPI?.startProcessAudio) {
          // Process-Isolated Audio (WASAPI Process Loopback targeting ONLY this window PID)
          console.log(`[Streamer] Starting WASAPI Process Audio Capture for PID: ${pid}`);
          try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
            audioCtxRef.current = audioCtx;
            const destination = audioCtx.createMediaStreamDestination();

            const sampleQueue = [];
            const bufferSize = 4096;
            const scriptNode = audioCtx.createScriptProcessor(bufferSize, 2, 2);

            scriptNode.onaudioprocess = (e) => {
              const leftChannel = e.outputBuffer.getChannelData(0);
              const rightChannel = e.outputBuffer.getChannelData(1);

              for (let i = 0; i < bufferSize; i++) {
                if (sampleQueue.length >= 2) {
                  leftChannel[i] = sampleQueue.shift() / 32768.0;
                  rightChannel[i] = sampleQueue.shift() / 32768.0;
                } else {
                  leftChannel[i] = 0;
                  rightChannel[i] = 0;
                }
              }
            };

            scriptNode.connect(destination);

            const removeListener = window.electronAPI.onProcessAudioData((chunk) => {
              const buffer = chunk.buffer || chunk;
              const int16Array = new Int16Array(buffer, chunk.byteOffset || 0, Math.floor(chunk.byteLength / 2));
              for (let i = 0; i < int16Array.length; i++) {
                sampleQueue.push(int16Array[i]);
              }
              if (sampleQueue.length > 48000) {
                sampleQueue.splice(0, sampleQueue.length - 24000);
              }
            });

            window.electronAPI.startProcessAudio(pid);

            const processAudioTrack = destination.stream.getAudioTracks()[0];
            if (processAudioTrack) {
              captureStream.addTrack(processAudioTrack);
            }

            processAudioCleanupRef.current = () => {
              removeListener?.();
              scriptNode.disconnect();
              window.electronAPI.stopProcessAudio();
              if (audioCtx.state !== 'closed') audioCtx.close();
            };
          } catch (e) {
            console.error('[Streamer] Failed to initialize WASAPI process audio:', e);
          }
        } else {
          // System-wide desktop loopback audio
          try {
            const systemAudioStream = await navigator.mediaDevices.getUserMedia({
              audio: { mandatory: { chromeMediaSource: 'desktop' } },
              video: false,
            });
            const sysAudioTrack = systemAudioStream.getAudioTracks()[0];
            if (sysAudioTrack) captureStream.addTrack(sysAudioTrack);
          } catch (e) {
            console.warn('[Streamer] System audio loopback unavailable:', e);
          }
        }
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
    if (processAudioCleanupRef.current) {
      processAudioCleanupRef.current();
      processAudioCleanupRef.current = null;
    }
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
