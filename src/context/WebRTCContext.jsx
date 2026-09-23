import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import Peer from 'peerjs';
import {
  QUALITY_PRESETS,
  ICE_CONFIG,
  createDummyVideoTrack,
  createDummyAudioTrack,
  applySenderParameters,
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

  // Alternar Microfone
  const toggleMic = useCallback(async () => {
    try {
      if (isMicMuted) {
        if (!realMicTrackRef.current) {
          const micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 2,
              sampleRate: 48000
            }
          });
          realMicTrackRef.current = micStream.getAudioTracks()[0];
        } else {
          realMicTrackRef.current.enabled = true;
        }

        if (!audioSenderRef.current && mainMediaCallRef.current?.peerConnection) {
          const senders = mainMediaCallRef.current.peerConnection.getSenders();
          audioSenderRef.current = senders.find((s) => s.track && s.track.kind === 'audio') || null;
        }

        if (audioSenderRef.current && realMicTrackRef.current) {
          await audioSenderRef.current.replaceTrack(realMicTrackRef.current);
        }

        setLocalStream((prev) => {
          const videoTrack = prev ? prev.getVideoTracks()[0] : (dummyVideoTrackRef.current || createDummyVideoTrack());
          return new MediaStream([videoTrack, realMicTrackRef.current].filter(Boolean));
        });

        updateLocalAudioDetector(realMicTrackRef.current);
        setIsMicMuted(false);
        showToast('Microfone ativado 🎙️', 'info');
      } else {
        if (realMicTrackRef.current) {
          realMicTrackRef.current.enabled = false;
        }
        if (!dummyAudioTrackRef.current) {
          dummyAudioTrackRef.current = createDummyAudioTrack();
        }

        if (!audioSenderRef.current && mainMediaCallRef.current?.peerConnection) {
          const senders = mainMediaCallRef.current.peerConnection.getSenders();
          audioSenderRef.current = senders.find((s) => s.track && s.track.kind === 'audio') || null;
        }

        if (audioSenderRef.current && dummyAudioTrackRef.current) {
          await audioSenderRef.current.replaceTrack(dummyAudioTrackRef.current);
        }
        updateLocalAudioDetector(null);
        setIsMicMuted(true);
        showToast('Microfone silenciado 🔇', 'info');
      }
    } catch (err) {
      console.warn('Erro ao alternar microfone:', err);
      showToast('Permissão de microfone não concedida.', 'error');
    }
  }, [isMicMuted, showToast, updateLocalAudioDetector]);

  // Alternar Câmera
  const toggleVideo = useCallback(async () => {
    try {
      if (isVideoOff) {
        if (!realCamTrackRef.current) {
          const camStream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 60, max: 60 }
            }
          });
          realCamTrackRef.current = camStream.getVideoTracks()[0];
        } else {
          realCamTrackRef.current.enabled = true;
        }

        if (!videoSenderRef.current && mainMediaCallRef.current?.peerConnection) {
          const senders = mainMediaCallRef.current.peerConnection.getSenders();
          videoSenderRef.current = senders.find((s) => s.track && s.track.kind === 'video') || null;
        }

        if (videoSenderRef.current && realCamTrackRef.current) {
          await videoSenderRef.current.replaceTrack(realCamTrackRef.current);
          await applySenderParameters(videoSenderRef.current, activePreset, false);
        }

        setLocalStream((prev) => {
          const audioTrack = prev ? prev.getAudioTracks()[0] : (dummyAudioTrackRef.current || createDummyAudioTrack());
          return new MediaStream([realCamTrackRef.current, audioTrack].filter(Boolean));
        });

        setIsVideoOff(false);
        showToast('Câmera ativada 📷', 'info');
      } else {
        if (realCamTrackRef.current) {
          realCamTrackRef.current.stop();
          realCamTrackRef.current = null;
        }
        if (!dummyVideoTrackRef.current) {
          dummyVideoTrackRef.current = createDummyVideoTrack();
        }

        if (!videoSenderRef.current && mainMediaCallRef.current?.peerConnection) {
          const senders = mainMediaCallRef.current.peerConnection.getSenders();
          videoSenderRef.current = senders.find((s) => s.track && s.track.kind === 'video') || null;
        }

        if (videoSenderRef.current && dummyVideoTrackRef.current) {
          await videoSenderRef.current.replaceTrack(dummyVideoTrackRef.current);
        }
        setIsVideoOff(true);
        showToast('Câmera desativada', 'info');
      }
    } catch (err) {
      console.warn('Erro ao alternar câmera:', err);
      showToast('Permissão de câmera não concedida.', 'error');
    }
  }, [isVideoOff, activePreset, showToast]);

  // Destaque / Foco (Spotlight): 'local-camera' | 'remote-camera' | 'local-screen' | 'remote-screen' | null
  const [spotlightTarget, setSpotlightTarget] = useState(null);

  const toggleSpotlight = useCallback((target) => {
    setSpotlightTarget((prev) => (prev === target ? null : target));
  }, []);

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
            frameRate: { ideal: activePreset.maxFps || 60 }
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
        videoTrack.contentHint = activePreset.contentHint || 'detail';

        // Lidar com fechamento da janela capturada de forma segura
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

        videoTrack.onmute = () => {
          console.log('[WebRTC] Track de tela pausada.');
        };

        videoTrack.onunmute = () => {
          console.log('[WebRTC] Track de tela retomada.');
        };
      }

      // Se já estava transmitindo tela, fazer troca dinâmica (In-Flight Replace)
      if (localScreenStream) {
        try {
          const oldVideoTrack = localScreenStream.getVideoTracks()[0];
          if (oldVideoTrack) {
            try { oldVideoTrack.stop(); } catch (e) {}
          }

          const wasapiAudioTrack = audioWorkletManager.getMixedAudioTrack();
          const combinedTracks = [videoTrack];
          if (wasapiAudioTrack) combinedTracks.push(wasapiAudioTrack);
          if (stream.getAudioTracks()[0]) combinedTracks.push(stream.getAudioTracks()[0]);

          const updatedScreenStream = new MediaStream(combinedTracks.filter(Boolean));
          setLocalScreenStream(updatedScreenStream);

          if (localScreenCallRef.current && localScreenCallRef.current.peerConnection) {
            try {
              const senders = localScreenCallRef.current.peerConnection.getSenders();
              const vSender = senders.find((s) => s.track && s.track.kind === 'video') || senders[0];
              if (vSender) {
                await vSender.replaceTrack(videoTrack);
                await applySenderParameters(vSender, activePreset, true);
              }
            } catch (swapErr) {
              console.warn('[WebRTC] Fallback recriando chamada de tela após troca de fonte:', swapErr);
              if (peerRef.current && remotePeerIdRef.current) {
                try { localScreenCallRef.current.close(); } catch (e) {}
                const newCall = peerRef.current.call(remotePeerIdRef.current, updatedScreenStream, {
                  metadata: { type: 'screen-share' }
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

      const wasapiAudioTrack = audioWorkletManager.getMixedAudioTrack();
      const combinedTracks = [videoTrack];
      if (wasapiAudioTrack) combinedTracks.push(wasapiAudioTrack);
      if (stream.getAudioTracks()[0]) combinedTracks.push(stream.getAudioTracks()[0]);

      const finalScreenStream = new MediaStream(combinedTracks.filter(Boolean));
      setLocalScreenStream(finalScreenStream);

      // Chamar parceiro com a stream de tela dedicada
      if (peerRef.current && remotePeerIdRef.current) {
        try {
          const screenCall = peerRef.current.call(remotePeerIdRef.current, finalScreenStream, {
            metadata: { type: 'screen-share' }
          });
          localScreenCallRef.current = screenCall;
        } catch (e) {
          console.warn('[WebRTC] Erro ao disparar chamada de tela:', e);
        }
      }

      if (dataConnRef.current && dataConnRef.current.open) {
        try {
          dataConnRef.current.send({ type: 'screen-share-start' });
        } catch (e) {}
      }

      showToast('Sua tela está sendo transmitida em Ultra HD! 🚀', 'success');
    } catch (err) {
      console.warn('[WebRTC] Falha ao iniciar compartilhamento de tela:', err);
      showToast('Compartilhamento de tela cancelado.', 'info');
    }
  }, [activePreset, localScreenStream, showToast, stopScreenShare]);



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

          // Disparar chamada de mídia principal
          const mediaCall = peer.call(targetPeerId, initialStream, { metadata: { type: 'media' } });
          setupMediaSenders(mediaCall);
          mediaCall.on('stream', (rStream) => {
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
      });

      peer.on('call', (call) => {
        const isScreenCall = call.metadata && call.metadata.type === 'screen-share';
        console.log(`[PeerJS] Recebida chamada [tipo: ${isScreenCall ? 'SCREEN' : 'MEDIA'}] de: ${call.peer}`);
        remotePeerIdRef.current = call.peer;

        if (isScreenCall) {
          // Responder com dummy stream para receber o fluxo de tela
          const dummyAnswerStream = new MediaStream([createDummyAudioTrack()].filter(Boolean));
          call.answer(dummyAnswerStream);
          call.on('stream', (incomingScreenStream) => {
            console.log('[PeerJS] Stream de tela do parceiro recebida com sucesso!');
            setRemoteScreenStream(incomingScreenStream);
          });
          call.on('close', () => {
            setRemoteScreenStream(null);
          });
        } else {
          // Chamada de mídia principal (voz/câmera)
          call.answer(initialStream);
          setupMediaSenders(call);
          call.on('stream', (rStream) => {
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
  }, [mode, remoteIp, myProfile, showToast, updateRemoteAudioDetector]);

  // Sincronizar atualizações de perfil em tempo real via WebRTC DataChannel
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

  function setupDataConnection(conn) {
    dataConnRef.current = conn;

    conn.on('open', () => {
      console.log(`[DataConnection] Canal de dados aberto com ${conn.peer}!`);
      setConnectionState('connected');
      conn.send({
        type: 'profile-sync',
        profile: myProfile
      });
    });

    conn.on('data', (data) => {
      if (!data) return;
      if (data.type === 'profile-sync' || data.type === 'profile-update') {
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

    if (realMicTrackRef.current) realMicTrackRef.current.stop();
    if (realCamTrackRef.current) realCamTrackRef.current.stop();
    if (localScreenStream) localScreenStream.getTracks().forEach((t) => t.stop());

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
