import { useRef, useState, useCallback, useEffect } from 'react';
import { io } from 'socket.io-client';
import { SERVER_URL, ICE_SERVERS } from '../config.js';

// Bypass ngrok browser interstitial page (required for Socket.IO through ngrok free tier)
const SOCKET_OPTS = {
  transports: ['websocket'],
  reconnection: false,
  extraHeaders: { 'ngrok-skip-browser-warning': 'true' },
};

export function useViewer() {
  const socketRef  = useRef(null);
  const pcRef      = useRef(null);
  const streamRef  = useRef(null);          // stores incoming MediaStream
  const [status,       setStatus]       = useState('idle');
  const [statusDetail, setStatusDetail] = useState('');
  const [errorMsg,     setErrorMsg]     = useState('');
  const [stream,       setStream]       = useState(null); // triggers video attachment

  const joinStream = useCallback((roomCode) => {
    setStatus('connecting');
    setStatusDetail('Connecting to server…');
    setErrorMsg('');

    const socket = io(SERVER_URL, SOCKET_OPTS);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Viewer] Socket connected');
      setStatusDetail('Joining room…');
      socket.emit('join-room', roomCode.trim().toUpperCase(), (res) => {
        if (res.error) {
          setStatus('error');
          setErrorMsg(res.error);
          socket.disconnect();
          return;
        }
        console.log('[Viewer] Joined room — waiting for stream offer');
        setStatusDetail('Joined! Waiting for streamer offer…');
      });
    });

    socket.on('connect_error', (err) => {
      console.error('[Viewer] connect_error:', err);
      setStatus('error');
      setErrorMsg('Cannot reach the server. Check your connection or server URL.');
    });

    socket.on('offer', async ({ from, offer }) => {
      console.log('[Viewer] Received offer from streamer');
      setStatusDetail('Offer received — starting WebRTC handshake…');

      const pc = new RTCPeerConnection({
        iceServers: ICE_SERVERS,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
      });
      pcRef.current = pc;

      pc.ontrack = (e) => {
        console.log('[Viewer] Track received:', e.track.kind);
        if (e.streams?.[0]) {
          streamRef.current = e.streams[0];
          setStream(e.streams[0]);  // triggers useEffect in ViewerScreen
          setStatus('live');
          setStatusDetail('');
        }
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          console.log('[Viewer] Sending ICE candidate');
          socket.emit('ice-candidate', { to: from, candidate: e.candidate });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('[Viewer] ICE connection:', pc.iceConnectionState);
        setStatusDetail(`ICE state: ${pc.iceConnectionState}…`);
        if (pc.iceConnectionState === 'failed') {
          setStatus('error');
          setErrorMsg('Could not establish a media path (ICE failed). Both sides may be behind strict firewalls.');
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('[Viewer] Peer connection:', pc.connectionState);
        if (pc.connectionState === 'failed') {
          setStatus('error');
          setErrorMsg('Connection failed. Network may have blocked the stream path.');
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log('[Viewer] Answer sent');
      setStatusDetail('Answer sent — establishing media path…');
      socket.emit('answer', { to: from, answer });
    });

    socket.on('ice-candidate', async ({ candidate }) => {
      if (pcRef.current && candidate)
        try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* ignore */ }
    });

    socket.on('stream-ended', () => {
      setStatus('ended');
      setStream(null);
      streamRef.current = null;
    });
  }, []);

  const leaveStream = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    socketRef.current?.disconnect();
    socketRef.current = null;
    streamRef.current = null;
    setStream(null);
    setStatus('idle');
    setStatusDetail('');
    setErrorMsg('');
  }, []);

  useEffect(() => () => leaveStream(), [leaveStream]);

  return { joinStream, leaveStream, status, statusDetail, stream, errorMsg };
}
