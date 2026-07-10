import { useRef, useState, useCallback, useEffect } from 'react';
import { io } from 'socket.io-client';
import { SERVER_URL, ICE_SERVERS } from '../config.js';

export function useViewer() {
  const socketRef = useRef(null);
  const pcRef     = useRef(null);
  const [status,   setStatus]   = useState('idle'); // idle|connecting|live|ended|error
  const [errorMsg, setErrorMsg] = useState('');

  const joinStream = useCallback((roomCode, videoElement) => {
    setStatus('connecting');
    setErrorMsg('');

    const socket = io(SERVER_URL, { transports: ['websocket'], reconnection: false });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join-room', roomCode.trim().toUpperCase(), (res) => {
        if (res.error) {
          setStatus('error');
          setErrorMsg(res.error);
          socket.disconnect();
        }
        // else: waiting for streamer's WebRTC offer
      });
    });

    socket.on('connect_error', () => {
      setStatus('error');
      setErrorMsg('Cannot reach the server. Check your connection or server URL.');
    });

    socket.on('offer', async ({ from, offer }) => {
      const pc = new RTCPeerConnection({
        iceServers: ICE_SERVERS,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
      });
      pcRef.current = pc;

      pc.ontrack = (e) => {
        if (e.streams?.[0] && videoElement) {
          videoElement.srcObject = e.streams[0];
          videoElement.play().catch(() => {});
          setStatus('live');
        }
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit('ice-candidate', { to: from, candidate: e.candidate });
      };

      pc.onconnectionstatechange = () => {
        console.log('[Viewer] connection:', pc.connectionState);
        if (pc.connectionState === 'failed') {
          setStatus('error');
          setErrorMsg('Connection lost. The stream may have ended.');
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('answer', { to: from, answer });
    });

    socket.on('ice-candidate', async ({ candidate }) => {
      if (pcRef.current && candidate)
        try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* ignore */ }
    });

    socket.on('stream-ended', () => {
      setStatus('ended');
      if (videoElement) videoElement.srcObject = null;
    });
  }, []);

  const leaveStream = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    socketRef.current?.disconnect();
    socketRef.current = null;
    setStatus('idle');
    setErrorMsg('');
  }, []);

  useEffect(() => () => leaveStream(), [leaveStream]);

  return { joinStream, leaveStream, status, errorMsg };
}
