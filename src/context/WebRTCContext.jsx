import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import Peer from 'peerjs';
import {
  QUALITY_PRESETS,
  ICE_CONFIG,
  createDummyVideoTrack,
  createDummyAudioTrack,
  applySenderParameters,
  transformSDP,
  createAudioLevelDetector
} from '../services/webrtcEngine';
import { apiService } from '../services/apiService';
import { audioWorkletManager } from '../services/audioWorkletManager';
import { electronBridge, isElectron } from '../services/electronBridge';
import { useProfiles } from './ProfileContext';
import { useServer } from './ServerContext';
import { useToast } from '../hooks/useToast';

const WebRTCContext = createContext(null);

export function WebRTCProvider({ children }) {
  const { showToast } = useToast();
  const { myProfile, otherProfile, applyRemoteProfileUpdate } = useProfiles();
  const { mode, remoteIp } = useServer();

  const [inCall, setInCall] = useState(false);
  const [connectionState, setConnectionState] = useState('idle'); // idle | connecting | connected | disconnected
  const [peerRole, setPeerRole] = useState('host');

  const [isMicMuted, setIsMicMuted] = useState(true);
  const [isVideoOff, setIsVideoOff] = useState(true);
  const [isRemoteMicMuted, setIsRemoteMicMuted] = useState(true);
  const [isRemoteVideoOff, setIsRemoteVideoOff] = useState(true);

  // Compartilhamento de Tela Duplo (Dual Screen Share)
  const [localScreenStream, setLocalScreenStream] = useState(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState(null);
  const isLocalScreenSharing = !!localScreenStream;
  const isRemoteScreenSharing = !!remoteScreenStream;
  const isScreenSharing = isLocalScreenSharing || isRemoteScreenSharing;

  // Modo de visualização de tela dupla: 'remote' | 'local' | 'split'
  const [dualScreenViewMode, setDualScreenViewMode] = useState('remote');

  // Controle de Avatares Flutuantes (PIP)
  const [isFloatingAvatarsMinimized, setIsFloatingAvatarsMinimized] = useState(false);
  const [isFloatingAvatarsHidden, setIsFloatingAvatarsHidden] = useState(false);

  const [activePreset, setActivePreset] = useState(QUALITY_PRESETS.ultra);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [screenFitMode, setScreenFitMode] = useState('contain'); // 'contain' | 'cover'
  const [screenVolume, setScreenVolume] = useState(1.0);
  const [isScreenMuted, setIsScreenMuted] = useState(false);

  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
  const [isRemoteSpeaking, setIsRemoteSpeaking] = useState(false);

  // Streams de Câmera/Microfone
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  // Referências para conexões e canais
  const peerRef = useRef(null);
  const dataConnRef = useRef(null);
  const remotePeerIdRef = useRef(null);
  const localScreenCallRef = useRef(null);
  const occupyIntervalRef = useRef(null);

  const realMicTrackRef = useRef(null);
  const realCamTrackRef = useRef(null);
  const dummyAudioTrackRef = useRef(null);
  const dummyVideoTrackRef = useRef(null);

  const videoSenderRef = useRef(null);
  const audioSenderRef = useRef(null);
  const mainMediaCallRef = useRef(null);

  const setupMediaSenders = useCallback((call) => {
    if (!call) return;
    mainMediaCallRef.current = call;

    const extractSenders = () => {
      try {
        const pc = call.peerConnection;
        if (!pc) return;
        const senders = pc.getSenders();
        for (const sender of senders) {
          if (sender.track) {
            if (sender.track.kind === 'video') {
              videoSenderRef.current = sender;
            } else if (sender.track.kind === 'audio') {
              audioSenderRef.current = sender;
            }
          }
        }
      } catch (err) {
        console.warn('Erro ao extrair senders de mídia:', err);
      }
    };

    extractSenders();
    if (call.peerConnection) {
      call.peerConnection.addEventListener('connectionstatechange', extractSenders);
    }
    call.on('stream', extractSenders);
  }, []);

  const localLevelDetectorRef = useRef(null);
  const remoteLevelDetectorRef = useRef(null);

  const updateLocalAudioDetector = useCallback((audioTrack) => {
    if (localLevelDetectorRef.current) {
      localLevelDetectorRef.current.stop();
      localLevelDetectorRef.current = null;
    }
    if (audioTrack && audioTrack.enabled) {
      localLevelDetectorRef.current = createAudioLevelDetector(audioTrack, ({ isSpeaking }) => {
        setIsLocalSpeaking(isSpeaking);
      });
    } else {
      setIsLocalSpeaking(false);
    }
  }, []);

  const updateRemoteAudioDetector = useCallback((audioTrack) => {
    if (remoteLevelDetectorRef.current) {
      remoteLevelDetectorRef.current.stop();
      remoteLevelDetectorRef.current = null;
    }
    if (audioTrack && audioTrack.enabled) {
      remoteLevelDetectorRef.current = createAudioLevelDetector(audioTrack, ({ isSpeaking }) => {
        setIsRemoteSpeaking(isSpeaking);
      });
    } else {
      setIsRemoteSpeaking(false);
    }
  }, []);

  // Captura de microfone com fallback inteligente
  const getMicrophoneStream = async () => {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 2,
          sampleRate: 48000
        }
      });
    } catch (err1) {
      console.warn('[WebRTC] Tentando fallback para captura básica de microfone:', err1);
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    }
  };

  // Captura de câmera com fallback inteligente
  const getCameraStream = async () => {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 },
          frameRate: { ideal: 30 }
        }
      });
    } catch (err1) {
      console.warn('[WebRTC] Tentando fallback para captura básica de câmera:', err1);
      return await navigator.mediaDevices.getUserMedia({ video: true });
    }
  };

  // Alternar Microfone
  const toggleMic = useCallback(async () => {
    try {
      if (isMicMuted) {
        if (!realMicTrackRef.current || realMicTrackRef.current.readyState === 'ended') {
          const micStream = await getMicrophoneStream();
          realMicTrackRef.current = micStream.getAudioTracks()[0];
        } else {
          realMicTrackRef.current.enabled = true;
        }

        const pc = mainMediaCallRef.current?.peerConnection;
        if (pc) {
          let aSender = audioSenderRef.current;
          if (!aSender) {
            const senders = pc.getSenders();
            aSender = senders.find((s) => s.track && s.track.kind === 'audio');
            if (!aSender && pc.getTransceivers) {
              const at = pc.getTransceivers().find((t) => t.receiver?.track?.kind === 'audio' || t.sender?.track?.kind === 'audio');
              if (at) aSender = at.sender;
            }
            audioSenderRef.current = aSender;
          }

          if (aSender && realMicTrackRef.current) {
            await aSender.replaceTrack(realMicTrackRef.current);
          }
        }

        setLocalStream((prev) => {
          const videoTrack = prev ? prev.getVideoTracks()[0] : (dummyVideoTrackRef.current || createDummyVideoTrack());
          return new MediaStream([videoTrack, realMicTrackRef.current].filter(Boolean));
        });

        updateLocalAudioDetector(realMicTrackRef.current);
        setIsMicMuted(false);

        if (dataConnRef.current && dataConnRef.current.open) {
          try {
            dataConnRef.current.send({
              type: 'media-state',
              isVideoOff,
              isMicMuted: false
            });
          } catch (e) {}
        }

        showToast('Microfone ativado 🎙️', 'info');
      } else {
        if (realMicTrackRef.current) {
          realMicTrackRef.current.enabled = false;
        }
        if (!dummyAudioTrackRef.current) {
          dummyAudioTrackRef.current = createDummyAudioTrack();
        }

        const pc = mainMediaCallRef.current?.peerConnection;
        if (pc) {
          let aSender = audioSenderRef.current;
          if (!aSender) {
            const senders = pc.getSenders();
            aSender = senders.find((s) => s.track && s.track.kind === 'audio');
            if (!aSender && pc.getTransceivers) {
              const at = pc.getTransceivers().find((t) => t.receiver?.track?.kind === 'audio' || t.sender?.track?.kind === 'audio');
              if (at) aSender = at.sender;
            }
            audioSenderRef.current = aSender;
          }

          if (aSender && dummyAudioTrackRef.current) {
            await aSender.replaceTrack(dummyAudioTrackRef.current);
          }
        }

        updateLocalAudioDetector(null);
        setIsMicMuted(true);

        if (dataConnRef.current && dataConnRef.current.open) {
          try {
            dataConnRef.current.send({
              type: 'media-state',
              isVideoOff,
              isMicMuted: true
            });
          } catch (e) {}
        }

        showToast('Microfone silenciado 🔇', 'info');
      }
    } catch (err) {
      console.warn('Erro ao alternar microfone:', err);
      let errorMsg = 'Não foi possível acessar o microfone.';
      if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMsg = 'O microfone já está em uso por outro aplicativo.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'Nenhum microfone encontrado no computador.';
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'Permissão de microfone negada no Windows.';
      }
      showToast(errorMsg, 'error');
    }
  }, [isMicMuted, isVideoOff, showToast, updateLocalAudioDetector]);

  // Alternar Câmera
  const toggleVideo = useCallback(async () => {
    try {
      if (isVideoOff) {
        if (!realCamTrackRef.current || realCamTrackRef.current.readyState === 'ended') {
          const camStream = await getCameraStream();
          realCamTrackRef.current = camStream.getVideoTracks()[0];
        } else {
          realCamTrackRef.current.enabled = true;
        }

        const pc = mainMediaCallRef.current?.peerConnection;
        if (pc) {
          let vSender = videoSenderRef.current;
          if (!vSender) {
            const senders = pc.getSenders();
            vSender = senders.find((s) => s.track && s.track.kind === 'video');
            if (!vSender && pc.getTransceivers) {
              const vt = pc.getTransceivers().find((t) => t.receiver?.track?.kind === 'video' || t.sender?.track?.kind === 'video');
              if (vt) vSender = vt.sender;
            }
            videoSenderRef.current = vSender;
          }

          if (vSender && realCamTrackRef.current) {
            await vSender.replaceTrack(realCamTrackRef.current);
            await applySenderParameters(vSender, activePreset, false);
          }
        }

        setLocalStream((prev) => {
          const audioTrack = prev ? prev.getAudioTracks()[0] : (dummyAudioTrackRef.current || createDummyAudioTrack());
          return new MediaStream([realCamTrackRef.current, audioTrack].filter(Boolean));
        });

        setIsVideoOff(false);

        if (dataConnRef.current && dataConnRef.current.open) {
          try {
            dataConnRef.current.send({
              type: 'media-state',
              isVideoOff: false,
              isMicMuted
            });
          } catch (e) {}
        }

        showToast('Câmera ativada 📷', 'info');
      } else {
        if (realCamTrackRef.current) {
          try {
            realCamTrackRef.current.stop();
          } catch (e) {}
          realCamTrackRef.current = null;
        }
        if (!dummyVideoTrackRef.current || dummyVideoTrackRef.current.readyState === 'ended') {
          dummyVideoTrackRef.current = createDummyVideoTrack();
        }

        const pc = mainMediaCallRef.current?.peerConnection;
        if (pc) {
          let vSender = videoSenderRef.current;
          if (!vSender) {
            const senders = pc.getSenders();
            vSender = senders.find((s) => s.track && s.track.kind === 'video');
            if (!vSender && pc.getTransceivers) {
              const vt = pc.getTransceivers().find((t) => t.receiver?.track?.kind === 'video' || t.sender?.track?.kind === 'video');
              if (vt) vSender = vt.sender;
            }
            videoSenderRef.current = vSender;
          }

          if (vSender && dummyVideoTrackRef.current) {
            await vSender.replaceTrack(dummyVideoTrackRef.current);
          }
        }

        setLocalStream((prev) => {
          const audioTrack = prev ? prev.getAudioTracks()[0] : (dummyAudioTrackRef.current || createDummyAudioTrack());
          return new MediaStream([dummyVideoTrackRef.current, audioTrack].filter(Boolean));
        });

        setIsVideoOff(true);

        if (dataConnRef.current && dataConnRef.current.open) {
          try {
            dataConnRef.current.send({
              type: 'media-state',
              isVideoOff: true,
              isMicMuted
            });
          } catch (e) {}
        }

        showToast('Câmera desativada', 'info');
      }
    } catch (err) {
      console.warn('Erro ao alternar câmera:', err);
      let errorMsg = 'Não foi possível acessar a câmera.';
      if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMsg = 'A câmera já está em uso por outro aplicativo ou janela.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'Nenhuma webcam encontrada conectada ao computador.';
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'Permissão de câmera negada nas configurações do Windows.';
      }
      showToast(errorMsg, 'error');
    }
  }, [isVideoOff, isMicMuted, activePreset, showToast]);

  // Destaque / Foco (Spotlight): 'local-camera' | 'remote-camera' | 'local-screen' | 'remote-screen' | null
  const [spotlightTarget, setSpotlightTarget] = useState(null);

  const toggleSpotlight = useCallback((target) => {
    setSpotlightTarget((prev) => (prev === target ? null : target));
  }, []);

  // Monitorar desconexão por estado do RTCPeerConnection (ICE / ConnectionState)
  const attachPcLifecycle = useCallback((pc, peerId) => {
    if (!pc) return;
    const handleState = () => {
      const cState = pc.connectionState;
      const iceState = pc.iceConnectionState;
      console.log(`[WebRTC] Peer "${peerId}" estado: connectionState=${cState}, iceState=${iceState}`);
      
      if (
        cState === 'disconnected' ||
        cState === 'failed' ||
        cState === 'closed' ||
        iceState === 'disconnected' ||
        iceState === 'failed' ||
        iceState === 'closed'
      ) {
        if (remotePeerIdRef.current === peerId || (dataConnRef.current && dataConnRef.current.peer === peerId)) {
          console.log(`[WebRTC] Desconexão do parceiro detectada (${peerId})`);
          setIsRemoteVideoOff(true);
          setIsRemoteMicMuted(true);
          setRemoteStream(null);
          setRemoteScreenStream(null);
          setConnectionState(mode === 'host' ? 'waiting' : 'disconnected');
        }
      } else if (cState === 'connected' || iceState === 'connected' || iceState === 'completed') {
        setConnectionState('connected');
      }
    };

    pc.addEventListener('connectionstatechange', handleState);
    pc.addEventListener('iceconnectionstatechange', handleState);
  }, [mode]);

  // Parar Compartilhamento de Tela Local
  const stopScreenShare = useCallback(() => {
    try {
      if (localScreenStream) {
        localScreenStream.getTracks().forEach((t) => {
          try { t.stop(); } catch (e) {}
        });
      }
      setLocalScreenStream(null);

      if (localScreenCallRef.current) {
        try {
          localScreenCallRef.current.close();
        } catch (e) {}
        localScreenCallRef.current = null;
      }

      if (dataConnRef.current && dataConnRef.current.open) {
        try {
          dataConnRef.current.send({ type: 'screen-share-stop' });
        } catch (e) {}
      }

      electronBridge.stopProcessAudio().catch(() => {});
      showToast('Compartilhamento de tela finalizado.', 'info');
    } catch (err) {
      console.warn('[WebRTC] Erro ao parar compartilhamento de tela:', err);
    }
  }, [localScreenStream, showToast]);

  // Iniciar ou Alterar Compartilhamento de Tela Local (In-Flight Swap)
  const startScreenShare = useCallback(async (sourceId = null) => {
    try {
      // Inicializar AudioWorklet de áudio do sistema/processo
      await audioWorkletManager.init().catch(() => {});

      let stream = null;
      if (isElectron && sourceId) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
              maxWidth: 3840,
              maxHeight: 2160,
              maxFrameRate: activePreset.maxFps || 60
            }
          }
        }).catch((err) => {
          console.warn('[WebRTC] getUserMedia desktop capture falhou/cancelado:', err);
          return null;
        });
      } else {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: 'always',
            frameRate: { ideal: activePreset.maxFps || 60, max: 60 },
            width: { ideal: 3840, max: 3840 },
            height: { ideal: 2160, max: 2160 }
          },
          audio: true
        }).catch((err) => {
          console.warn('[WebRTC] getDisplayMedia falhou/cancelado:', err);
          return null;
        });
      }

      if (!stream) {
        return;
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.contentHint = 'detail';

        videoTrack.onended = () => {
          try {
            console.log('[WebRTC] Track de tela finalizada (janela fechada ou captura interrompida).');
            stopScreenShare();
            electronBridge.stopProcessAudio().catch(() => {});
            showToast('A transmissão da janela foi encerrada.', 'info');
          } catch (e) {
            console.warn('[WebRTC] Erro no encerramento da track de vídeo:', e);
          }
        };
      }

      const wasapiAudioTrack = audioWorkletManager.getMixedAudioTrack();
      const rawAudioTrack = stream.getAudioTracks()[0];
      const audioTrackToSend = wasapiAudioTrack || rawAudioTrack || createDummyAudioTrack();

      // Se já estava transmitindo tela, fazer troca dinâmica (In-Flight Replace)
      if (localScreenStream) {
        try {
          const oldVideoTrack = localScreenStream.getVideoTracks()[0];
          if (oldVideoTrack) {
            try { oldVideoTrack.stop(); } catch (e) {}
          }

          const combinedTracks = [videoTrack, audioTrackToSend].filter(Boolean);
          const updatedScreenStream = new MediaStream(combinedTracks);
          setLocalScreenStream(updatedScreenStream);

          if (localScreenCallRef.current && localScreenCallRef.current.peerConnection) {
            try {
              const senders = localScreenCallRef.current.peerConnection.getSenders();
              const vSender = senders.find((s) => s.track && s.track.kind === 'video') || senders[0];
              if (vSender) {
                await vSender.replaceTrack(videoTrack);
                await applySenderParameters(vSender, activePreset, true);
              }
              const aSender = senders.find((s) => s.track && s.track.kind === 'audio');
              if (aSender && audioTrackToSend) {
                await aSender.replaceTrack(audioTrackToSend);
              }
            } catch (swapErr) {
              console.warn('[WebRTC] Fallback recriando chamada de tela após troca de fonte:', swapErr);
              if (peerRef.current && remotePeerIdRef.current) {
                try { localScreenCallRef.current.close(); } catch (e) {}
                const newCall = peerRef.current.call(remotePeerIdRef.current, updatedScreenStream, {
                  metadata: { type: 'screen-share' },
                  sdpTransform: (sdp) => transformSDP(sdp, true, activePreset)
                });
                localScreenCallRef.current = newCall;
              }
            }
          }
          showToast('Fonte de transmissão alterada com sucesso! 🔄', 'success');
        } catch (inFlightErr) {
          console.warn('[WebRTC] Erro durante troca dinâmica de tela:', inFlightErr);
        }
        return;
      }

      const combinedTracks = [videoTrack, audioTrackToSend].filter(Boolean);
      const finalScreenStream = new MediaStream(combinedTracks);
      setLocalScreenStream(finalScreenStream);

      // Chamar parceiro com a stream de tela dedicada e SDP otimizado a 35 Mbps
      if (peerRef.current && remotePeerIdRef.current) {
        try {
          const screenCall = peerRef.current.call(remotePeerIdRef.current, finalScreenStream, {
            metadata: { type: 'screen-share' },
            sdpTransform: (sdp) => transformSDP(sdp, true, activePreset)
          });
          localScreenCallRef.current = screenCall;

          const applyScreenBitrate = async () => {
            try {
              if (screenCall.peerConnection) {
                const senders = screenCall.peerConnection.getSenders();
                for (const s of senders) {
                  if (s.track && s.track.kind === 'video') {
                    await applySenderParameters(s, activePreset, true);
                  }
                }
              }
            } catch (e) {}
          };

          if (screenCall.peerConnection) {
            screenCall.peerConnection.addEventListener('connectionstatechange', applyScreenBitrate);
            screenCall.peerConnection.addEventListener('iceconnectionstatechange', applyScreenBitrate);
            attachPcLifecycle(screenCall.peerConnection, remotePeerIdRef.current);
            setTimeout(applyScreenBitrate, 200);
            setTimeout(applyScreenBitrate, 800);
            setTimeout(applyScreenBitrate, 2000);
          }
        } catch (e) {
          console.warn('[WebRTC] Erro ao disparar chamada de tela:', e);
        }
      }

      if (dataConnRef.current && dataConnRef.current.open) {
        try {
          dataConnRef.current.send({ type: 'screen-share-start' });
        } catch (e) {}
      }

      showToast('Sua tela está sendo transmitida em Ultra HD 60 FPS! 🚀', 'success');
    } catch (err) {
      console.warn('[WebRTC] Falha ao iniciar compartilhamento de tela:', err);
      showToast('Compartilhamento de tela cancelado.', 'info');
    }
  }, [activePreset, localScreenStream, showToast, stopScreenShare, attachPcLifecycle]);

  // Entrar na Sala
  const joinRoom = useCallback(async (room = 'lovechat') => {
    setInCall(true);
    setConnectionState('connecting');

    const cleanRoom = (room || 'lovechat').toLowerCase().replace(/[^a-z0-9-]/g, '');
    const prefix = cleanRoom.startsWith('lovechat') ? cleanRoom : `lovechat-${cleanRoom}`;

    dummyAudioTrackRef.current = createDummyAudioTrack();
    dummyVideoTrackRef.current = createDummyVideoTrack();

    const initialStream = new MediaStream([dummyVideoTrackRef.current, dummyAudioTrackRef.current].filter(Boolean));
    setLocalStream(initialStream);

    const isHost = mode === 'host';
    const myPeerId = isHost ? `${prefix}-host` : `${prefix}-guest-${Math.floor(Math.random() * 10000)}`;
    const targetPeerId = isHost ? null : `${prefix}-host`;
    setPeerRole(isHost ? 'host' : 'guest');

    if (!isHost) {
      remotePeerIdRef.current = targetPeerId;
    }

    try {
      let peerHost = 'localhost';
      let peerPort = 3000;
      let peerPath = '/peerjs';

      if (!isHost && remoteIp) {
        peerHost = remoteIp;
        peerPort = 3000;
      } else if (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== '') {
        peerHost = window.location.hostname;
        if (window.location.port && window.location.port !== '5173') {
          peerPort = Number(window.location.port) || 3000;
        }
      }

      const peer = new Peer(myPeerId, {
        host: peerHost,
        port: peerPort,
        path: peerPath,
        config: ICE_CONFIG,
        debug: 1
      });

      peerRef.current = peer;

      peer.on('open', (id) => {
        console.log(`[PeerJS] Conectado como: ${id}`);
        
        // Registrar perfil como ocupado no servidor
        const currentProfId = myProfile?.id || 'user1';
        apiService.occupyProfile(currentProfId, id, cleanRoom);

        if (occupyIntervalRef.current) clearInterval(occupyIntervalRef.current);
        occupyIntervalRef.current = setInterval(() => {
          if (peerRef.current) {
            apiService.heartbeatProfile(currentProfId, id);
          }
        }, 6000);

        if (!isHost && targetPeerId) {
          const conn = peer.connect(targetPeerId, { reliable: true });
          setupDataConnection(conn);

          // Disparar chamada de mídia principal com SDP otimizado
          const mediaCall = peer.call(targetPeerId, initialStream, {
            metadata: { type: 'media' },
            sdpTransform: (sdp) => transformSDP(sdp, false, activePreset)
          });
          setupMediaSenders(mediaCall);
          
          if (mediaCall.peerConnection) {
            attachPcLifecycle(mediaCall.peerConnection, targetPeerId);
          }

          mediaCall.on('stream', (rStream) => {
            console.log('[PeerJS] Stream de áudio/vídeo recebida do parceiro!');
            setRemoteStream(rStream);
            const aTrack = rStream.getAudioTracks()[0];
            if (aTrack) updateRemoteAudioDetector(aTrack);
          });

          mediaCall.on('close', () => {
            if (mainMediaCallRef.current && mainMediaCallRef.current.peer === targetPeerId) {
              setRemoteStream(null);
              setConnectionState('disconnected');
            }
          });
        }
      });

      peer.on('connection', (conn) => {
        console.log(`[PeerJS] Recebida conexão de dados de: ${conn.peer}`);
        remotePeerIdRef.current = conn.peer;
        setupDataConnection(conn);
        if (conn.peerConnection) {
          attachPcLifecycle(conn.peerConnection, conn.peer);
        }
      });

      peer.on('call', (call) => {
        const isScreenCall = call.metadata && call.metadata.type === 'screen-share';
        console.log(`[PeerJS] Recebida chamada [tipo: ${isScreenCall ? 'SCREEN' : 'MEDIA'}] de: ${call.peer}`);
        remotePeerIdRef.current = call.peer;

        if (isScreenCall) {
          // Responder com dummy stream para receber o fluxo de tela e áudio com SDP em alta fidelidade
          const dummyAnswerStream = new MediaStream([createDummyAudioTrack()].filter(Boolean));
          call.answer(dummyAnswerStream, {
            sdpTransform: (sdp) => transformSDP(sdp, true, activePreset)
          });
          if (call.peerConnection) {
            attachPcLifecycle(call.peerConnection, call.peer);
          }
          call.on('stream', (incomingScreenStream) => {
            console.log('[PeerJS] Stream de tela do parceiro recebida com sucesso! Tracks:', incomingScreenStream.getTracks().map(t => `${t.kind}:${t.enabled}`));
            setRemoteScreenStream(incomingScreenStream);
          });
          call.on('close', () => {
            setRemoteScreenStream(null);
          });
        } else {
          // Chamada de mídia principal (voz/câmera)
          call.answer(initialStream, {
            sdpTransform: (sdp) => transformSDP(sdp, false, activePreset)
          });
          setupMediaSenders(call);
          if (call.peerConnection) {
            attachPcLifecycle(call.peerConnection, call.peer);
          }
          call.on('stream', (rStream) => {
            console.log('[PeerJS] Stream de mídia recebida do parceiro!');
            setRemoteStream(rStream);
            const aTrack = rStream.getAudioTracks()[0];
            if (aTrack) updateRemoteAudioDetector(aTrack);
          });
          call.on('close', () => {
            if (mainMediaCallRef.current && mainMediaCallRef.current.peer === call.peer) {
              setRemoteStream(null);
              setConnectionState(isHost ? 'waiting' : 'disconnected');
            }
          });
        }
      });

      peer.on('error', (err) => {
        console.warn('[PeerJS] Erro:', err);
        if (err.type === 'peer-unavailable') {
          showToast('Anfitrião ainda não está online na sala. Aguardando...', 'info');
          setConnectionState('connecting');
        }
      });

      // Se for host, aguarda o par; se for guest, aguarda abertura do canal
      setConnectionState(isHost ? 'waiting' : 'connecting');
    } catch (err) {
      console.error('Erro fatal ao conectar:', err);
      setConnectionState('disconnected');
    }
  }, [mode, remoteIp, myProfile, showToast, updateRemoteAudioDetector, attachPcLifecycle]);

  const isVideoOffRef = useRef(isVideoOff);
  isVideoOffRef.current = isVideoOff;
  const isMicMutedRef = useRef(isMicMuted);
  isMicMutedRef.current = isMicMuted;
  const myProfileRef = useRef(myProfile);
  myProfileRef.current = myProfile;

  // Sincronizar atualizações de perfil e estado de mídia em tempo real via WebRTC DataChannel
  useEffect(() => {
    if (dataConnRef.current && dataConnRef.current.open && myProfile) {
      try {
        dataConnRef.current.send({
          type: 'profile-update',
          profile: myProfile
        });
      } catch (e) {}
    }
  }, [myProfile]);

  useEffect(() => {
    if (dataConnRef.current && dataConnRef.current.open) {
      try {
        dataConnRef.current.send({
          type: 'media-state',
          isVideoOff,
          isMicMuted
        });
      } catch (e) {}
    }
  }, [isVideoOff, isMicMuted]);

  function setupDataConnection(conn) {
    if (!conn) return;
    dataConnRef.current = conn;

    const sendInitialSync = () => {
      console.log(`[DataConnection] Canal de dados aberto com ${conn.peer}!`);
      setConnectionState('connected');
      try {
        conn.send({
          type: 'media-sync',
          isVideoOff: isVideoOffRef.current,
          isMicMuted: isMicMutedRef.current,
          profile: myProfileRef.current
        });
      } catch (e) {
        console.warn('[DataConnection] Falha ao enviar media-sync inicial:', e);
      }
    };

    if (conn.open) {
      sendInitialSync();
    } else {
      conn.on('open', sendInitialSync);
    }

    conn.on('data', (data) => {
      if (!data) return;
      if (data.type === 'profile-sync' || data.type === 'profile-update') {
        if (data.profile) {
          applyRemoteProfileUpdate(data.profile);
        }
      } else if (data.type === 'media-sync' || data.type === 'media-state') {
        if (data.isVideoOff !== undefined) {
          setIsRemoteVideoOff(data.isVideoOff);
        }
        if (data.isMicMuted !== undefined) {
          setIsRemoteMicMuted(data.isMicMuted);
        }
        if (data.profile) {
          applyRemoteProfileUpdate(data.profile);
        }
      } else if (data.type === 'screen-share-start') {
        showToast('O parceiro começou a transmitir a tela! 📺', 'info');
      } else if (data.type === 'screen-share-stop') {
        setRemoteScreenStream(null);
        showToast('O parceiro encerrou a transmissão de tela.', 'info');
      }
    });

    conn.on('close', () => {
      console.log(`[DataConnection] Canal de dados fechado para ${conn.peer}.`);
      if (dataConnRef.current && dataConnRef.current.peer === conn.peer) {
        dataConnRef.current = null;
        setIsRemoteVideoOff(true);
        setIsRemoteMicMuted(true);
        setConnectionState(mode === 'host' ? 'waiting' : 'disconnected');
        setRemoteStream(null);
        setRemoteScreenStream(null);
      }
    });
  }

  // Sair da Sala
  const leaveRoom = useCallback(() => {
    if (occupyIntervalRef.current) {
      clearInterval(occupyIntervalRef.current);
      occupyIntervalRef.current = null;
    }

    if (realMicTrackRef.current) {
      try { realMicTrackRef.current.stop(); } catch (e) {}
      realMicTrackRef.current = null;
    }
    if (realCamTrackRef.current) {
      try { realCamTrackRef.current.stop(); } catch (e) {}
      realCamTrackRef.current = null;
    }
    if (dummyAudioTrackRef.current) {
      try { dummyAudioTrackRef.current.stop(); } catch (e) {}
      dummyAudioTrackRef.current = null;
    }
    if (dummyVideoTrackRef.current) {
      try { dummyVideoTrackRef.current.stop(); } catch (e) {}
      dummyVideoTrackRef.current = null;
    }
    if (localScreenStream) {
      localScreenStream.getTracks().forEach((t) => {
        try { t.stop(); } catch (e) {}
      });
    }

    if (mainMediaCallRef.current) {
      try { mainMediaCallRef.current.close(); } catch (e) {}
      mainMediaCallRef.current = null;
    }
    videoSenderRef.current = null;
    audioSenderRef.current = null;

    if (peerRef.current) {
      apiService.leaveRoom(peerRef.current.id, myProfile?.id);
      peerRef.current.destroy();
      peerRef.current = null;
    }

    setInCall(false);
    setConnectionState('idle');
    setLocalStream(null);
    setRemoteStream(null);
    setLocalScreenStream(null);
    setRemoteScreenStream(null);
    setIsMicMuted(true);
    setIsVideoOff(true);
    showToast('Você saiu da chamada.', 'info');
  }, [localScreenStream, myProfile, showToast]);

  const changeQualityPreset = useCallback(async (presetKey) => {
    const preset = QUALITY_PRESETS[presetKey];
    if (!preset) return;
    setActivePreset(preset);
    if (videoSenderRef.current) {
      await applySenderParameters(videoSenderRef.current, preset, false);
    }
    showToast(`Qualidade ajustada para: ${preset.label} 🚀`, 'success');
  }, [showToast]);

  return (
    <WebRTCContext.Provider
      value={{
        inCall,
        connectionState,
        peerRole,
        isMicMuted,
        isVideoOff,
        isRemoteMicMuted,
        isRemoteVideoOff,
        isScreenSharing,
        isLocalScreenSharing,
        isRemoteScreenSharing,
        localScreenStream,
        remoteScreenStream,
        dualScreenViewMode,
        setDualScreenViewMode,
        isFloatingAvatarsMinimized,
        setIsFloatingAvatarsMinimized,
        isFloatingAvatarsHidden,
        setIsFloatingAvatarsHidden,
        spotlightTarget,
        setSpotlightTarget,
        toggleSpotlight,
        activePreset,
        isTheaterMode,
        screenFitMode,
        screenVolume,
        isScreenMuted,
        isLocalSpeaking,
        isRemoteSpeaking,
        localStream,
        remoteStream,
        joinRoom,
        leaveRoom,
        toggleMic,
        toggleVideo,
        startScreenShare,
        stopScreenShare,
        changeQualityPreset,
        setIsTheaterMode,
        setScreenFitMode,
        setScreenVolume,
        setIsScreenMuted
      }}
    >
      {children}
    </WebRTCContext.Provider>
  );
}

export function useWebRTC() {
  const context = useContext(WebRTCContext);
  if (!context) {
    throw new Error('useWebRTC must be used within a WebRTCProvider');
  }
  return context;
}
