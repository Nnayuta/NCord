import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import Peer from 'peerjs';
import {
  QUALITY_PRESETS,
  STREAM_RESOLUTIONS,
  STREAM_FPS_OPTIONS,
  getModularStreamPreset,
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

export const CAMERA_RESOLUTIONS = {
  '1080p': { id: '1080p', label: '1080p (Full HD)', desc: 'Máxima nitidez e riqueza de detalhes', width: 1920, height: 1080, fps: 30 },
  '720p': { id: '720p', label: '720p (HD)', desc: 'Equilíbrio ideal entre fluidez e nitidez', width: 1280, height: 720, fps: 30 },
  '480p': { id: '480p', label: '480p (SD)', desc: 'Econômico e leve para conexões móveis', width: 640, height: 480, fps: 30 }
};

export const CAMERA_FILTERS = [
  { id: 'none', label: 'Natural', desc: 'Cores autênticas e originais' },
  { id: 'soft-glow', label: 'Suave Romântico', desc: 'Pele aveludada com brilho sutil caloroso' },
  { id: 'warm-cozy', label: 'Luz de Velas', desc: 'Tons dourados e atmosfera acolhedora' },
  { id: 'cinema', label: 'Cinemático', desc: 'Contraste artístico e profundidade refinada' },
  { id: 'vintage', label: 'Retrô Nostalgia', desc: 'Toque analógico suave com cores de filme' },
  { id: 'noir', label: 'P&B Elegante', desc: 'Preto e branco romântico clássico' }
];

export function WebRTCProvider({ children }) {
  const { showToast } = useToast();
  const { myProfile, otherProfile, applyRemoteProfileUpdate } = useProfiles();
  const { mode, remoteIp } = useServer();

  const [inCall, setInCall] = useState(false);
  const [connectionState, setConnectionState] = useState('idle'); // idle | connecting | connected | disconnected
  const [peerRole, setPeerRole] = useState('host');

  const [isMicMuted, setIsMicMuted] = useState(true);
  const [isVideoOff, setIsVideoOff] = useState(true);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isRemoteMicMuted, setIsRemoteMicMuted] = useState(true);
  const [isRemoteVideoOff, setIsRemoteVideoOff] = useState(true);

  // Compartilhamento de Tela Duplo (Dual Screen Share)
  const [localScreenStream, setLocalScreenStream] = useState(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState(null);
  const [isRemoteScreenSharingState, setIsRemoteScreenSharingState] = useState(false);
  const isLocalScreenSharing = !!localScreenStream;
  const isRemoteScreenSharing = Boolean(remoteScreenStream || isRemoteScreenSharingState);
  const isScreenSharing = isLocalScreenSharing || isRemoteScreenSharing;

  // Modo de visualização de tela dupla: 'remote' | 'local' | 'split'
  const [dualScreenViewMode, setDualScreenViewMode] = useState('remote');

  // Controle de Avatares Flutuantes (PIP)
  const [isFloatingAvatarsMinimized, setIsFloatingAvatarsMinimized] = useState(false);
  const [isFloatingAvatarsHidden, setIsFloatingAvatarsHidden] = useState(false);

  const [streamResolution, setStreamResolution] = useState('1080p');
  const [streamFps, setStreamFps] = useState(60);
  const [activePreset, setActivePreset] = useState(() => getModularStreamPreset('1080p', 60));
  const [remoteScreenPreset, setRemoteScreenPreset] = useState(null);
  const [isQualityModalOpen, setIsQualityModalOpen] = useState(false);

  const activePresetRef = useRef(activePreset);
  activePresetRef.current = activePreset;
  const [isTheaterMode, setIsTheaterMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768;
    }
    return false;
  });
  const [screenFitMode, setScreenFitMode] = useState('contain'); // 'contain' | 'cover'
  const [cameraFitMode, setCameraFitMode] = useState('contain'); // 'contain' | 'cover'
  const [screenVolume, setScreenVolume] = useState(1.0);
  const [isScreenMuted, setIsScreenMuted] = useState(false);

  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
  const [isRemoteSpeaking, setIsRemoteSpeaking] = useState(false);

  // Streams de Câmera/Microfone
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  // Configurações e Dispositivos de Câmera
  const [availableCameras, setAvailableCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [cameraFacingMode, setCameraFacingMode] = useState('user'); // 'user' | 'environment'
  const [isCameraMirrored, setIsCameraMirrored] = useState(true);
  const [cameraFilter, setCameraFilter] = useState('none');
  const [remoteCameraFilter, setRemoteCameraFilter] = useState('none');
  const [cameraResolution, setCameraResolution] = useState('1080p');

  const selectedCameraIdRef = useRef(selectedCameraId);
  selectedCameraIdRef.current = selectedCameraId;
  const cameraFacingModeRef = useRef(cameraFacingMode);
  cameraFacingModeRef.current = cameraFacingMode;
  const cameraResolutionRef = useRef(cameraResolution);
  cameraResolutionRef.current = cameraResolution;
  const cameraFilterRef = useRef(cameraFilter);
  cameraFilterRef.current = cameraFilter;

  // Referências para conexões e canais
  const peerRef = useRef(null);
  const dataConnRef = useRef(null);
  const remotePeerIdRef = useRef(null);
  const localScreenCallRef = useRef(null);
  const localScreenStreamRef = useRef(null);
  localScreenStreamRef.current = localScreenStream;
  const remoteScreenStreamRef = useRef(null);
  remoteScreenStreamRef.current = remoteScreenStream;
  const activeIncomingScreenCallRef = useRef(null);
  const occupyIntervalRef = useRef(null);

  const isVideoOffRef = useRef(isVideoOff);
  isVideoOffRef.current = isVideoOff;
  const isMicMutedRef = useRef(isMicMuted);
  isMicMutedRef.current = isMicMuted;
  const myProfileRef = useRef(myProfile);
  myProfileRef.current = myProfile;

  const realMicTrackRef = useRef(null);
  const realCamTrackRef = useRef(null);
  const dummyAudioTrackRef = useRef(null);
  const dummyVideoTrackRef = useRef(null);

  const videoSenderRef = useRef(null);
  const audioSenderRef = useRef(null);
  const mainMediaCallRef = useRef(null);
  const currentSessionIdRef = useRef(null);

  // Liberação imediata e confiável da vaga ao fechar ou recarregar o navegador (sem travar por 60s)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (peerRef.current && myProfile) {
        apiService.leaveRoomBeacon(peerRef.current.id, myProfile.id, currentSessionIdRef.current);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [myProfile]);

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

  // Enumeração e escuta de dispositivos de câmera
  const refreshCameraDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return [];
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label || `Câmera ${idx + 1}`
        }));
      setAvailableCameras(videoDevices);
      if (videoDevices.length > 0 && !selectedCameraIdRef.current) {
        setSelectedCameraId(videoDevices[0].deviceId);
      }
      return videoDevices;
    } catch (err) {
      console.warn('[WebRTC] Erro ao enumerar câmeras:', err);
      return [];
    }
  }, []);

  useEffect(() => {
    refreshCameraDevices();
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
      const handleDeviceChange = () => {
        refreshCameraDevices();
      };
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      };
    }
  }, [refreshCameraDevices]);

  // Captura de câmera com suporte flexível a deviceId, facingMode e resolução
  const getCameraStream = useCallback(async (targetDeviceId, targetFacingMode, targetResolution) => {
    const devId = targetDeviceId !== undefined ? targetDeviceId : selectedCameraIdRef.current;
    const facing = targetFacingMode !== undefined ? targetFacingMode : cameraFacingModeRef.current;
    const resKey = targetResolution || cameraResolutionRef.current || '1080p';
    const chosenRes = CAMERA_RESOLUTIONS[resKey] || CAMERA_RESOLUTIONS['1080p'];

    const videoConstraints = {
      width: { ideal: chosenRes.width, min: 480 },
      height: { ideal: chosenRes.height, min: 360 },
      frameRate: { ideal: chosenRes.fps }
    };

    if (devId) {
      videoConstraints.deviceId = { ideal: devId };
    } else if (facing) {
      videoConstraints.facingMode = { ideal: facing };
    }

    try {
      return await navigator.mediaDevices.getUserMedia({
        video: videoConstraints
      });
    } catch (err1) {
      console.warn('[WebRTC] Tentando fallback para captura de câmera com constraints básicas:', err1);
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: devId ? { deviceId: { ideal: devId } } : (facing ? { facingMode: { ideal: facing } } : true)
        });
      } catch (err2) {
        console.warn('[WebRTC] Tentando fallback definitivo para qualquer câmera:', err2);
        return await navigator.mediaDevices.getUserMedia({ video: true });
      }
    }
  }, []);

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

  // Alternar Ensurdecer / Deafen (Muta todo o áudio de saída recebido e o mic)
  const toggleDeafen = useCallback(() => {
    setIsDeafened((prev) => {
      const next = !prev;
      if (next) {
        if (!isMicMuted) {
          toggleMic();
        }
        showToast('Áudio ensurdecido (Silêncio total) 🎧', 'info');
      } else {
        showToast('Áudio restaurado 🔊', 'info');
      }
      return next;
    });
  }, [isMicMuted, toggleMic, showToast]);

  // Alternar Câmera
  const toggleVideo = useCallback(async () => {
    try {
      if (isVideoOff) {
        if (!realCamTrackRef.current || realCamTrackRef.current.readyState === 'ended') {
          const camStream = await getCameraStream(selectedCameraIdRef.current, cameraFacingModeRef.current, cameraResolutionRef.current);
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
              isMicMuted,
              cameraFilter: cameraFilterRef.current
            });
          } catch (e) {}
        }

        refreshCameraDevices();
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
  }, [isVideoOff, isMicMuted, activePreset, getCameraStream, refreshCameraDevices, showToast]);

  // Troca dinâmica de câmera (In-flight ReplaceTrack)
  const switchCamera = useCallback(async (deviceId) => {
    try {
      setSelectedCameraId(deviceId);

      if (!isVideoOff) {
        const camStream = await getCameraStream(deviceId, cameraFacingModeRef.current, cameraResolutionRef.current);
        const newTrack = camStream.getVideoTracks()[0];
        if (!newTrack) throw new Error('Não foi possível obter vídeo do novo dispositivo.');

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

          if (vSender) {
            await vSender.replaceTrack(newTrack);
            await applySenderParameters(vSender, activePreset, false);
          }
        }

        if (realCamTrackRef.current) {
          try { realCamTrackRef.current.stop(); } catch (e) {}
        }
        realCamTrackRef.current = newTrack;

        setLocalStream((prev) => {
          const audioTrack = prev ? prev.getAudioTracks()[0] : (dummyAudioTrackRef.current || createDummyAudioTrack());
          return new MediaStream([newTrack, audioTrack].filter(Boolean));
        });

        refreshCameraDevices();
      }

      const camObj = availableCameras.find((c) => c.deviceId === deviceId);
      showToast(`Câmera alterada: ${camObj?.label || 'Dispositivo selecionado'} 🎥`, 'success');
    } catch (err) {
      console.error('Erro ao trocar câmera:', err);
      showToast('Falha ao alternar para a câmera selecionada.', 'error');
    }
  }, [isVideoOff, activePreset, availableCameras, getCameraStream, refreshCameraDevices, showToast]);

  // Inverter câmera (Frontal / Traseira ou próxima câmera)
  const flipCamera = useCallback(async () => {
    try {
      const nextFacing = cameraFacingModeRef.current === 'user' ? 'environment' : 'user';
      setCameraFacingMode(nextFacing);

      // Auto-ajuste de espelhamento: frontal espelha, traseira não
      const nextMirror = nextFacing === 'user';
      setIsCameraMirrored(nextMirror);

      let nextDevId = selectedCameraIdRef.current;
      if (availableCameras.length > 1) {
        const currIndex = availableCameras.findIndex((c) => c.deviceId === selectedCameraIdRef.current);
        const nextIndex = (currIndex + 1) % availableCameras.length;
        nextDevId = availableCameras[nextIndex]?.deviceId || '';
        setSelectedCameraId(nextDevId);
      }

      if (!isVideoOff) {
        const camStream = await getCameraStream(nextDevId, nextFacing, cameraResolutionRef.current);
        const newTrack = camStream.getVideoTracks()[0];
        if (!newTrack) throw new Error('Não foi possível obter vídeo ao virar câmera.');

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

          if (vSender) {
            await vSender.replaceTrack(newTrack);
            await applySenderParameters(vSender, activePreset, false);
          }
        }

        if (realCamTrackRef.current) {
          try { realCamTrackRef.current.stop(); } catch (e) {}
        }
        realCamTrackRef.current = newTrack;

        setLocalStream((prev) => {
          const audioTrack = prev ? prev.getAudioTracks()[0] : (dummyAudioTrackRef.current || createDummyAudioTrack());
          return new MediaStream([newTrack, audioTrack].filter(Boolean));
        });

        refreshCameraDevices();
      }

      showToast(`Câmera invertida (${nextFacing === 'user' ? 'Frontal' : 'Traseira / Ambiente'}) 🔄`, 'info');
    } catch (err) {
      console.error('Erro ao virar câmera:', err);
      showToast('Falha ao virar câmera.', 'error');
    }
  }, [availableCameras, isVideoOff, activePreset, getCameraStream, refreshCameraDevices, showToast]);

  // Alternar espelhamento horizontal
  const toggleCameraMirror = useCallback(() => {
    setIsCameraMirrored((prev) => {
      const next = !prev;
      showToast(next ? 'Vídeo espelhado (Modo Selfie) 🪞' : 'Espelhamento desativado 👁️', 'info');
      return next;
    });
  }, [showToast]);

  // Alterar filtro romântico/estético de câmera
  const changeCameraFilter = useCallback((filterId) => {
    setCameraFilter(filterId);
    if (dataConnRef.current && dataConnRef.current.open) {
      try {
        dataConnRef.current.send({
          type: 'camera-filter',
          filter: filterId
        });
      } catch (e) {}
    }
    const filterObj = CAMERA_FILTERS.find((f) => f.id === filterId);
    showToast(`Filtro aplicado: ${filterObj?.label || 'Natural'} ✨`, 'info');
  }, [showToast]);

  // Alterar resolução da câmera
  const changeCameraResolution = useCallback(async (resKey) => {
    setCameraResolution(resKey);
    if (!isVideoOff) {
      try {
        const camStream = await getCameraStream(selectedCameraIdRef.current, cameraFacingModeRef.current, resKey);
        const newTrack = camStream.getVideoTracks()[0];
        if (newTrack) {
          const pc = mainMediaCallRef.current?.peerConnection;
          if (pc) {
            let vSender = videoSenderRef.current;
            if (vSender) {
              await vSender.replaceTrack(newTrack);
              await applySenderParameters(vSender, activePreset, false);
            }
          }
          if (realCamTrackRef.current) {
            try { realCamTrackRef.current.stop(); } catch (e) {}
          }
          realCamTrackRef.current = newTrack;

          setLocalStream((prev) => {
            const audioTrack = prev ? prev.getAudioTracks()[0] : (dummyAudioTrackRef.current || createDummyAudioTrack());
            return new MediaStream([newTrack, audioTrack].filter(Boolean));
          });
        }
      } catch (err) {
        console.warn('Erro ao atualizar resolução da câmera:', err);
      }
    }
    const resObj = CAMERA_RESOLUTIONS[resKey];
    showToast(`Resolução da câmera: ${resObj?.label || resKey} 📐`, 'info');
  }, [isVideoOff, activePreset, getCameraStream, showToast]);

  // Destaque / Foco (Spotlight): 'local-camera' | 'remote-camera' | 'local-screen' | 'remote-screen' | null
  const [spotlightTarget, setSpotlightTarget] = useState(null);

  const toggleSpotlight = useCallback((target) => {
    setSpotlightTarget((prev) => (prev === target ? null : target));
  }, []);

  const disconnectTimerRef = useRef(null);

  // Monitorar desconexão por estado do RTCPeerConnection (ICE / ConnectionState) com tolerância a oscilações
  const attachPcLifecycle = useCallback((pc, peerId) => {
    if (!pc) return;
    const handleState = () => {
      const cState = pc.connectionState;
      const iceState = pc.iceConnectionState;
      console.log(`[WebRTC] Peer "${peerId}" estado: connectionState=${cState}, iceState=${iceState}`);
      
      // Se reconectou com sucesso, cancelar temporizador de queda
      if (cState === 'connected' || iceState === 'connected' || iceState === 'completed') {
        if (disconnectTimerRef.current) {
          clearTimeout(disconnectTimerRef.current);
          disconnectTimerRef.current = null;
        }
        setConnectionState('connected');
        return;
      }

      // Falha definitiva de conexão apenas quando ambos estão closed ou failed
      const isDefinitiveFailure = cState === 'closed' || (cState === 'failed' && iceState === 'failed');
      // Oscilação transitória típica de redes móveis (4G/Wi-Fi/Túneis)
      const isTransientDisconnect = cState === 'disconnected' || iceState === 'disconnected' || (cState === 'failed' && iceState !== 'failed');

      if (isDefinitiveFailure) {
        // Se o canal de dados ainda estiver aberto e ativo com o parceiro, não derruba a chamada
        if (dataConnRef.current && dataConnRef.current.open && dataConnRef.current.peer === peerId) {
          console.log(`[WebRTC] PeerConnection de mídia encerrou, mas canal de dados com ${peerId} continua aberto. Mantendo sessão.`);
          return;
        }

        if (disconnectTimerRef.current) {
          clearTimeout(disconnectTimerRef.current);
          disconnectTimerRef.current = null;
        }
        if (remotePeerIdRef.current === peerId || (dataConnRef.current && dataConnRef.current.peer === peerId)) {
          console.log(`[WebRTC] Desconexão definitiva do parceiro (${peerId})`);
          setIsRemoteVideoOff(true);
          setIsRemoteMicMuted(true);
          setRemoteStream(null);
          if (mainMediaCallRef.current && mainMediaCallRef.current.peer === peerId) {
            try { mainMediaCallRef.current.close(); } catch (e) {}
            mainMediaCallRef.current = null;
          }
          setConnectionState(mode === 'host' ? 'waiting' : 'disconnected');
        }
      } else if (isTransientDisconnect) {
        // Tolerância de 10 segundos para reconexão/ICE restart antes de encerrar
        if (!disconnectTimerRef.current) {
          console.log(`[WebRTC] Oscilação detectada para ${peerId}. Aguardando reconexão ICE (10s de tolerância)...`);
          disconnectTimerRef.current = setTimeout(() => {
            disconnectTimerRef.current = null;
            if (dataConnRef.current && dataConnRef.current.open && dataConnRef.current.peer === peerId) {
              return; // Canal de dados segue aberto
            }
            if (remotePeerIdRef.current === peerId || (dataConnRef.current && dataConnRef.current.peer === peerId)) {
              console.log(`[WebRTC] Tempo limite de reconexão excedido para ${peerId}`);
              setIsRemoteVideoOff(true);
              setIsRemoteMicMuted(true);
              setRemoteStream(null);
              if (mainMediaCallRef.current && mainMediaCallRef.current.peer === peerId) {
                try { mainMediaCallRef.current.close(); } catch (e) {}
                mainMediaCallRef.current = null;
              }
              setConnectionState(mode === 'host' ? 'waiting' : 'disconnected');
            }
          }, 10000);
        }
      }
    };

    pc.addEventListener('connectionstatechange', handleState);
    pc.addEventListener('iceconnectionstatechange', handleState);
  }, [mode]);

  // Monitorar ciclo de vida da chamada de tela dedicada (Isolado da chamada principal da sala)
  const attachScreenPcLifecycle = useCallback((pc, call) => {
    if (!pc) return;
    const handleScreenState = () => {
      const cState = pc.connectionState;
      const iceState = pc.iceConnectionState;
      console.log(`[WebRTC Screen] Estado: connectionState=${cState}, iceState=${iceState}`);
      if (cState === 'failed' || cState === 'closed') {
        if (!call || activeIncomingScreenCallRef.current === call) {
          activeIncomingScreenCallRef.current = null;
          remoteScreenStreamRef.current = null;
          setRemoteScreenStream(null);
          setIsRemoteScreenSharingState(false);
        }
      }
    };
    pc.addEventListener('connectionstatechange', handleScreenState);
    pc.addEventListener('iceconnectionstatechange', handleScreenState);
  }, []);

  // Disparar ou Reenviar Transmissão de Tela para o Parceiro (Late Joiner & Reconnect Support)
  const publishScreenShareToPeer = useCallback(async (targetPeerId) => {
    if (!targetPeerId || !peerRef.current || peerRef.current.destroyed) return;
    const stream = localScreenStreamRef.current;
    if (!stream) return;

    const liveTracks = stream.getTracks().filter((t) => t.readyState === 'live');
    if (liveTracks.length === 0) {
      console.warn('[WebRTC] Não há faixas ativas na transmissão de tela para enviar.');
      return;
    }

    const currentPreset = activePresetRef.current || activePreset;

    // Se já houver chamada ativa e estável com esse mesmo peer, apenas sincroniza via data-channel
    const currentCall = localScreenCallRef.current;
    const currentPc = currentCall?.peerConnection;
    if (
      currentCall &&
      currentCall.peer === targetPeerId &&
      currentPc &&
      (currentPc.connectionState === 'connected' || currentPc.connectionState === 'connecting') &&
      currentPc.signalingState !== 'closed'
    ) {
      console.log(`[WebRTC] Chamada de tela já conectada/conectando com ${targetPeerId}. Sincronizando estado.`);
      if (dataConnRef.current && dataConnRef.current.open) {
        try {
          dataConnRef.current.send({
            type: 'screen-share-start',
            preset: currentPreset,
            resolutionKey: currentPreset.resolutionKey,
            fps: currentPreset.maxFps
          });
        } catch (e) {}
      }
      return;
    }

    // Encerrar chamada anterior de tela se estiver morta ou associada a peer antigo
    if (localScreenCallRef.current) {
      try {
        localScreenCallRef.current.close();
      } catch (e) {}
      localScreenCallRef.current = null;
    }

    let screenToken = apiService.getRoomToken();
    if (!screenToken && (isElectron || isHost)) {
      try {
        screenToken = await apiService.fetchRoomToken();
      } catch (e) {}
    }

    console.log(`[WebRTC] Disparando chamada de tela para parceiro "${targetPeerId}" [preset: ${currentPreset.label}]...`);
    try {
      const screenCall = peerRef.current.call(targetPeerId, stream, {
        metadata: {
          type: 'screen-share',
          preset: currentPreset,
          token: screenToken || apiService.getRoomToken(),
          profileId: myProfileRef.current?.id || myProfile?.id || 'user1'
        },
        sdpTransform: (sdp) => transformSDP(sdp, true, currentPreset)
      });
      localScreenCallRef.current = screenCall;

      const applyScreenBitrate = async () => {
        try {
          if (screenCall.peerConnection && screenCall.peerConnection.signalingState === 'stable') {
            const senders = screenCall.peerConnection.getSenders();
            for (const s of senders) {
              if (s.track && s.track.kind === 'video') {
                await applySenderParameters(s, currentPreset, true);
              }
            }
          }
        } catch (e) {}
      };

      if (screenCall.peerConnection) {
        attachScreenPcLifecycle(screenCall.peerConnection, screenCall);
        const onConnected = () => {
          if (screenCall.peerConnection?.connectionState === 'connected') {
            applyScreenBitrate();
          }
        };
        screenCall.peerConnection.addEventListener('connectionstatechange', onConnected);
      }

      screenCall.on('close', () => {
        if (localScreenCallRef.current === screenCall) {
          localScreenCallRef.current = null;
        }
      });

      screenCall.on('error', (err) => {
        console.warn('[WebRTC] Erro na chamada de tela enviada:', err);
        if (localScreenCallRef.current === screenCall) {
          localScreenCallRef.current = null;
        }
      });

      // Notificar parceiro via canal de dados se aberto
      if (dataConnRef.current && dataConnRef.current.open) {
        try {
          dataConnRef.current.send({
            type: 'screen-share-start',
            preset: currentPreset,
            resolutionKey: currentPreset.resolutionKey,
            fps: currentPreset.maxFps
          });
        } catch (e) {}
      }
    } catch (callErr) {
      console.warn('[WebRTC] Erro ao disparar chamada de tela:', callErr);
    }
  }, [activePreset, attachScreenPcLifecycle, isElectron, isHost, myProfile]);

  // Parar Compartilhamento de Tela Local
  const stopScreenShare = useCallback(() => {
    try {
      if (localScreenStreamRef.current) {
        localScreenStreamRef.current.getTracks().forEach((t) => {
          if (audioWorkletManager.isMixedAudioTrack(t)) return;
          try { t.stop(); } catch (e) {}
        });
      }
      localScreenStreamRef.current = null;
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
      audioWorkletManager.clearBuffer();
      showToast('Compartilhamento de tela finalizado.', 'info');
    } catch (err) {
      console.warn('[WebRTC] Erro ao parar compartilhamento de tela:', err);
    }
  }, [showToast]);

  // Iniciar ou Alterar Compartilhamento de Tela Local (In-Flight Swap)
  const startScreenShare = useCallback(async (sourceId = null, audioOptions = {}) => {
    try {
      const {
        streamAudio = true,
        useNativeAudio = true,
        requestSystemAudioFallback = false
      } = audioOptions || {};

      const currentPreset = activePresetRef.current || activePreset;

      // Inicializar AudioWorklet se estiver rodando no Electron
      if (isElectron) {
        await audioWorkletManager.init().catch(() => {});
      }

      let stream = null;
      if (isElectron && sourceId) {
        const videoConstraints = {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            maxWidth: currentPreset.maxWidth || 1920,
            maxHeight: currentPreset.maxHeight || 1080,
            maxFrameRate: currentPreset.maxFps || 60
          }
        };
        const audioConstraints = requestSystemAudioFallback ? {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId
          },
          optional: [
            { echoCancellation: false },
            { googEchoCancellation: false },
            { googAutoGainControl: false },
            { googNoiseSuppression: false },
            { googHighpassFilter: false }
          ]
        } : false;

        stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: videoConstraints
        }).catch(async (err) => {
          if (audioConstraints) {
            console.warn('[WebRTC] Captura de áudio desktop fallback falhou; tentando vídeo sem áudio:', err);
            return navigator.mediaDevices.getUserMedia({
              audio: false,
              video: videoConstraints
            }).catch((videoOnlyErr) => {
              console.warn('[WebRTC] getUserMedia desktop capture falhou/cancelado:', videoOnlyErr);
              return null;
            });
          }

          console.warn('[WebRTC] getUserMedia desktop capture falhou/cancelado:', err);
          return null;
        });
      } else {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: 'always',
            frameRate: { ideal: currentPreset.maxFps || 60, max: currentPreset.maxFps || 60 },
            width: { ideal: currentPreset.maxWidth || 1920, max: currentPreset.maxWidth || 1920 },
            height: { ideal: currentPreset.maxHeight || 1080, max: currentPreset.maxHeight || 1080 }
          },
          audio: streamAudio ? {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 2,
            sampleRate: 48000
          } : false
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

      // Priorização de áudio correta:
      // - No Electron: WASAPI do processo/sistema via AudioWorklet quando ativo
      // - Fallback Electron: áudio do desktop entregue pelo Chromium, se disponível
      // - No Navegador Web: áudio da aba/sistema capturado pelo getDisplayMedia
      let audioTrackToSend = null;
      const rawAudioTrack = stream.getAudioTracks()[0] || null;

      if (isElectron) {
        const wasapiAudioTrack = streamAudio && useNativeAudio ? audioWorkletManager.getMixedAudioTrack() : null;
        audioTrackToSend = streamAudio ? (wasapiAudioTrack || rawAudioTrack || createDummyAudioTrack()) : createDummyAudioTrack();
      } else {
        audioTrackToSend = rawAudioTrack || createDummyAudioTrack();
      }

      if (audioTrackToSend && 'contentHint' in audioTrackToSend) {
        audioTrackToSend.contentHint = 'music';
      }

      // Verificar se chamada anterior ainda está ativa para realizar In-Flight Replace
      const currentCall = localScreenCallRef.current;
      const pc = currentCall?.peerConnection;
      const canDoInFlightReplace = Boolean(
        localScreenStreamRef.current &&
        currentCall &&
        pc &&
        pc.connectionState !== 'closed' &&
        pc.connectionState !== 'failed' &&
        pc.signalingState !== 'closed'
      );

      if (canDoInFlightReplace) {
        try {
          const oldVideoTrack = localScreenStreamRef.current?.getVideoTracks()[0];

          const combinedTracks = [videoTrack, audioTrackToSend].filter(Boolean);
          const updatedScreenStream = new MediaStream(combinedTracks);
          localScreenStreamRef.current = updatedScreenStream;
          setLocalScreenStream(updatedScreenStream);

          try {
            const senders = pc.getSenders();
            const vSender = senders.find((s) => s.track && s.track.kind === 'video') || senders[0];
            if (vSender) {
              await vSender.replaceTrack(videoTrack);
              await applySenderParameters(vSender, currentPreset, true);
            }
            const aSender = senders.find((s) => s.track && s.track.kind === 'audio');
            if (aSender && audioTrackToSend) {
              await aSender.replaceTrack(audioTrackToSend);
            }
          } catch (swapErr) {
            console.warn('[WebRTC] Fallback recriando chamada de tela após troca de fonte:', swapErr);
            if (peerRef.current && remotePeerIdRef.current) {
              try { currentCall.close(); } catch (e) {}
              const newCall = peerRef.current.call(remotePeerIdRef.current, updatedScreenStream, {
                metadata: {
                  type: 'screen-share',
                  preset: currentPreset,
                  token: apiService.getRoomToken(),
                  profileId: myProfile?.id || 'user1'
                },
                sdpTransform: (sdp) => transformSDP(sdp, true, currentPreset)
              });
              localScreenCallRef.current = newCall;
            }
          }

          if (oldVideoTrack && oldVideoTrack !== videoTrack) {
            oldVideoTrack.onended = null;
            try { oldVideoTrack.stop(); } catch (e) {}
          }

          showToast('Fonte de transmissão alterada com sucesso! 🔄', 'success');
        } catch (inFlightErr) {
          console.warn('[WebRTC] Erro durante troca dinâmica de tela:', inFlightErr);
        }
        return;
      }

      // Reinício limpo: fechar qualquer chamada anterior ou parar tracks antigas
      if (localScreenCallRef.current) {
        try { localScreenCallRef.current.close(); } catch (e) {}
        localScreenCallRef.current = null;
      }
      if (localScreenStreamRef.current) {
        localScreenStreamRef.current.getTracks().forEach((t) => {
          if (t !== videoTrack && t !== audioTrackToSend) {
            if (audioWorkletManager.isMixedAudioTrack(t)) return;
            try { t.stop(); } catch (e) {}
          }
        });
      }

      const combinedTracks = [videoTrack, audioTrackToSend].filter(Boolean);
      const finalScreenStream = new MediaStream(combinedTracks);
      localScreenStreamRef.current = finalScreenStream;
      setLocalScreenStream(finalScreenStream);

      // Publicar tela para parceiro caso ele já esteja na sala
      if (remotePeerIdRef.current) {
        await publishScreenShareToPeer(remotePeerIdRef.current);
      }

      showToast(`Sua tela está sendo transmitida em ${currentPreset.label}! 🚀`, 'success');
    } catch (err) {
      console.warn('[WebRTC] Falha ao iniciar compartilhamento de tela:', err);
      showToast('Compartilhamento de tela cancelado.', 'info');
    }
  }, [activePreset, publishScreenShareToPeer, showToast, stopScreenShare]);

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
      let isSecure = false;

      if (!isHost && remoteIp) {
        peerHost = remoteIp;
        peerPort = 3000;
        isSecure = false;
      } else if (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== '') {
        peerHost = window.location.hostname;
        isSecure = window.location.protocol === 'https:';
        if (isSecure) {
          peerPort = window.location.port ? Number(window.location.port) : 443;
        } else {
          peerPort = window.location.port && window.location.port !== '5173' ? Number(window.location.port) : 3000;
        }
      }

      let roomToken = apiService.getRoomToken();
      if (!roomToken && (isElectron || isHost)) {
        try {
          roomToken = await apiService.fetchRoomToken();
        } catch (e) {}
        if (!roomToken && isElectron) {
          try {
            const status = await electronBridge.getWebTunnelStatus();
            if (status?.token) {
              roomToken = status.token;
              apiService.setRoomToken(roomToken);
            }
          } catch (e) {}
        }
      }

      const peer = new Peer(myPeerId, {
        host: peerHost,
        port: peerPort,
        path: peerPath,
        secure: isSecure,
        token: roomToken || undefined,
        config: ICE_CONFIG,
        debug: 1
      });

      peerRef.current = peer;

      peer.on('open', async (id) => {
        console.log(`[PeerJS] Conectado como: ${id}`);
        
        // Registrar perfil como ocupado no servidor com verificação de limite de sala (máx 2 participantes)
        const currentProfId = myProfile?.id || 'user1';
        const occupyRes = await apiService.occupyProfile(currentProfId, id, cleanRoom, currentSessionIdRef.current);

        if (occupyRes && !occupyRes.success) {
          console.warn('[WebRTC] Não foi possível ocupar perfil na sala:', occupyRes.message || occupyRes.error);
          showToast(occupyRes.message || 'Sala cheia ou perfil já em uso por outro participante.', 'error');
          if (peerRef.current) {
            peerRef.current.destroy();
            peerRef.current = null;
          }
          setInCall(false);
          setConnectionState('idle');
          return;
        }

        if (occupyIntervalRef.current) clearInterval(occupyIntervalRef.current);
        occupyIntervalRef.current = setInterval(() => {
          if (peerRef.current) {
            apiService.heartbeatProfile(currentProfId, id, currentSessionIdRef.current);
          }
        }, 6000);

        if (!isHost && targetPeerId) {
          remotePeerIdRef.current = targetPeerId;
          const conn = peer.connect(targetPeerId, {
            reliable: true,
            metadata: {
              token: roomToken,
              profileId: currentProfId
            }
          });
          setupDataConnection(conn);

          // Disparar chamada de mídia principal com SDP otimizado e credenciais de autorização
          const mediaCall = peer.call(targetPeerId, initialStream, {
            metadata: {
              type: 'media',
              token: roomToken,
              profileId: currentProfId
            },
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
        const expectedToken = apiService.getRoomToken();
        const incomingToken = conn.metadata?.token;

        // 1. Validar autorização: rejeitar conexões de dados sem token válido
        if (expectedToken && incomingToken !== expectedToken) {
          console.warn(`[WebRTC Security] Conexão de dados rejeitada: token ausente ou inválido de "${conn.peer}"`);
          try { conn.close(); } catch (e) {}
          return;
        }

        // 2. Impor limite de 2 participantes: se já existe um canal aberto com o parceiro, rejeita terceiro
        if (dataConnRef.current && dataConnRef.current.open && dataConnRef.current.peer !== conn.peer) {
          const oldPc = dataConnRef.current.peerConnection;
          const isOldDead = !oldPc || oldPc.connectionState === 'closed' || oldPc.connectionState === 'failed' || oldPc.iceConnectionState === 'disconnected' || oldPc.iceConnectionState === 'failed';
          if (isOldDead) {
            console.log(`[WebRTC] Substituindo canal de dados obsoleto de "${dataConnRef.current.peer}" pelo novo de "${conn.peer}".`);
            try { dataConnRef.current.close(); } catch (e) {}
          } else {
            console.warn(`[WebRTC Security] Conexão de dados rejeitada: parceiro já conectado ("${dataConnRef.current.peer}"). Bloqueando terceiro "${conn.peer}".`);
            try { conn.close(); } catch (e) {}
            return;
          }
        }

        console.log(`[PeerJS] Recebida conexão de dados autorizada de: ${conn.peer}`);
        remotePeerIdRef.current = conn.peer;
        setupDataConnection(conn);
        if (conn.peerConnection) {
          attachPcLifecycle(conn.peerConnection, conn.peer);
        }
      });

      peer.on('call', (call) => {
        const isScreenCall = call.metadata && call.metadata.type === 'screen-share';
        const expectedToken = (apiService.getRoomToken() || '').trim();
        const incomingToken = (call.metadata?.token || '').trim();

        // 1. Validar autorização:
        // A chamada é autorizada se o token enviado bater com o da sala OU se vier comprovadamente do parceiro já conectado
        const isFromConnectedPartner = Boolean(
          remotePeerIdRef.current &&
          call.peer === remotePeerIdRef.current &&
          (
            mainMediaCallRef.current?.open ||
            (dataConnRef.current && (dataConnRef.current.open || dataConnRef.current.peer === call.peer))
          )
        );
        const hasValidToken = Boolean(expectedToken && incomingToken && incomingToken === expectedToken);

        if (expectedToken && !hasValidToken && !isFromConnectedPartner) {
          console.warn(`[WebRTC Security] Chamada [tipo: ${isScreenCall ? 'SCREEN' : 'MEDIA'}] rejeitada: token ausente ou inválido de "${call.peer}"`);
          try { call.close(); } catch (e) {}
          return;
        }

        // 2. Rejeitar chamadas de terceiros (garantir exclusividade de 2 participantes)
        if (!isScreenCall) {
          // Chamada de mídia principal (voz/câmera)
          const currentCall = mainMediaCallRef.current;
          const currentPc = currentCall?.peerConnection;
          const isCurrentDead = !currentCall || !currentCall.open || !currentPc || currentPc.connectionState === 'closed' || currentPc.connectionState === 'failed' || currentPc.iceConnectionState === 'disconnected' || currentPc.iceConnectionState === 'failed';

          if (currentCall && currentCall.open && currentCall.peer !== call.peer) {
            // Se o canal de dados atual já pertence ao novo peer do parceiro autorizado, substitui a chamada antiga:
            if ((dataConnRef.current && dataConnRef.current.peer === call.peer) || isCurrentDead) {
              console.log(`[WebRTC] Parceiro reconectou com novo peer (${call.peer}). Substituindo chamada antiga (${currentCall.peer}).`);
              try { currentCall.close(); } catch (e) {}
            } else {
              console.warn(`[WebRTC Security] Chamada de mídia rejeitada: parceiro legítimo já está conectado ("${currentCall.peer}"). Bloqueando terceiro peer "${call.peer}".`);
              try { call.close(); } catch (e) {}
              return;
            }
          }
        } else {
          // Chamada de tela: só pode vir do parceiro de sessão
          const isAllowedScreenSender = remotePeerIdRef.current === call.peer || (dataConnRef.current && dataConnRef.current.peer === call.peer);
          if (remotePeerIdRef.current && !isAllowedScreenSender) {
            console.warn(`[WebRTC Security] Chamada de tela rejeitada: peer "${call.peer}" não corresponde ao parceiro autorizado "${remotePeerIdRef.current}".`);
            try { call.close(); } catch (e) {}
            return;
          }
        }

        console.log(`[PeerJS] Recebida chamada autorizada [tipo: ${isScreenCall ? 'SCREEN' : 'MEDIA'}] de: ${call.peer}`);
        remotePeerIdRef.current = call.peer;

        if (isScreenCall) {
          activeIncomingScreenCallRef.current = call;
          setIsRemoteScreenSharingState(true);
          if (call.metadata?.preset) {
            setRemoteScreenPreset(call.metadata.preset);
          }

          // Responder com dummy stream contendo vídeo e áudio para negociar ambos os transceivers simetricamente
          const dummyAnswerStream = new MediaStream([
            createDummyVideoTrack(),
            createDummyAudioTrack()
          ].filter(Boolean));
          call.answer(dummyAnswerStream, {
            sdpTransform: (sdp) => transformSDP(sdp, true, activePreset)
          });
          if (call.peerConnection) {
            attachScreenPcLifecycle(call.peerConnection, call);
          }

          const remoteTracksMap = new Map();

          const updateRemoteStreamFromTracks = () => {
            if (activeIncomingScreenCallRef.current !== call) return;
            const liveTracks = Array.from(remoteTracksMap.values()).filter((t) => t.readyState === 'live');
            if (liveTracks.length > 0) {
              const newStream = new MediaStream(liveTracks);
              remoteScreenStreamRef.current = newStream;
              setRemoteScreenStream(newStream);
              setIsRemoteScreenSharingState(true);
            }
          };

          // Escutar evento 'track' no RTCPeerConnection para captura imediata de vídeo E áudio
          if (call.peerConnection) {
            call.peerConnection.addEventListener('track', (evt) => {
              if (activeIncomingScreenCallRef.current !== call) return;
              if (evt.track) {
                console.log(`[WebRTC Screen] ontrack no PC: ${evt.track.kind} (${evt.track.id}, enabled=${evt.track.enabled})`);
                remoteTracksMap.set(evt.track.kind, evt.track);
                updateRemoteStreamFromTracks();

                evt.track.onended = () => {
                  if (activeIncomingScreenCallRef.current === call) {
                    remoteTracksMap.delete(evt.track.kind);
                    const remainingLive = Array.from(remoteTracksMap.values()).filter((t) => t.readyState === 'live');
                    if (remainingLive.length === 0) {
                      remoteScreenStreamRef.current = null;
                      setRemoteScreenStream(null);
                      setIsRemoteScreenSharingState(false);
                    } else {
                      updateRemoteStreamFromTracks();
                    }
                  }
                };
              }
            });
          }

          call.on('stream', (incomingScreenStream) => {
            if (activeIncomingScreenCallRef.current !== call) return;
            console.log('[PeerJS] Stream de tela do parceiro recebida! Tracks:', incomingScreenStream.getTracks().map(t => `${t.kind}:${t.enabled}`));
            incomingScreenStream.getTracks().forEach((t) => {
              remoteTracksMap.set(t.kind, t);
            });
            updateRemoteStreamFromTracks();

            incomingScreenStream.onaddtrack = (evt) => {
              if (activeIncomingScreenCallRef.current !== call) return;
              if (evt.track) {
                remoteTracksMap.set(evt.track.kind, evt.track);
                updateRemoteStreamFromTracks();
              }
            };
            incomingScreenStream.onremovetrack = (evt) => {
              if (activeIncomingScreenCallRef.current !== call) return;
              if (evt.track) {
                remoteTracksMap.delete(evt.track.kind);
                updateRemoteStreamFromTracks();
              }
            };
          });

          call.on('close', () => {
            console.log(`[PeerJS] Chamada de tela encerrada. É ativa? ${activeIncomingScreenCallRef.current === call}`);
            if (activeIncomingScreenCallRef.current === call) {
              activeIncomingScreenCallRef.current = null;
              remoteScreenStreamRef.current = null;
              setRemoteScreenStream(null);
              setIsRemoteScreenSharingState(false);
            }
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

          // Se já estávamos transmitindo tela antes do parceiro entrar, publica agora que ele conectou
          if (localScreenStreamRef.current && localScreenStreamRef.current.getTracks().some((t) => t.readyState === 'live')) {
            console.log(`[WebRTC] Parceiro ${call.peer} conectou. Publicando transmissão de tela ativa em 600ms...`);
            setTimeout(() => {
              publishScreenShareToPeer(call.peer);
            }, 600);
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

      peer.on('disconnected', () => {
        console.log('[PeerJS] Sinalização desconectada temporariamente. Tentando reconectar...');
        if (peerRef.current && !peerRef.current.destroyed) {
          try {
            peerRef.current.reconnect();
          } catch (e) {
            console.warn('[PeerJS] Erro ao reconectar sinalização:', e);
          }
        }
      });

      // Se for host, aguarda o par; se for guest, aguarda abertura do canal
      setConnectionState(isHost ? 'waiting' : 'connecting');
    } catch (err) {
      console.error('Erro fatal ao conectar:', err);
      setConnectionState('disconnected');
    }
  }, [mode, remoteIp, myProfile, showToast, updateRemoteAudioDetector, attachPcLifecycle]);


  const cleanProfileForSync = (prof) => {
    if (!prof) return prof;
    let avatar = prof.avatar;
    if (typeof avatar === 'string' && avatar.includes('/api/avatar/')) {
      const idx = avatar.indexOf('/api/avatar/');
      avatar = avatar.substring(idx);
    }
    return { ...prof, avatar };
  };

  // Sincronizar atualizações de perfil e estado de mídia em tempo real via WebRTC DataChannel
  useEffect(() => {
    if (dataConnRef.current && dataConnRef.current.open && myProfile) {
      try {
        dataConnRef.current.send({
          type: 'profile-update',
          profile: cleanProfileForSync(myProfile)
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
          profile: cleanProfileForSync(myProfileRef.current),
          cameraFilter: cameraFilterRef.current,
          isScreenSharing: !!(localScreenStreamRef.current && localScreenStreamRef.current.getTracks().some((t) => t.readyState === 'live')),
          screenPreset: localScreenStreamRef.current ? (activePresetRef.current || activePreset) : null
        });
      } catch (e) {
        console.warn('[DataConnection] Falha ao enviar media-sync inicial:', e);
      }
      if (localScreenStreamRef.current && localScreenStreamRef.current.getTracks().some((t) => t.readyState === 'live') && conn.peer) {
        console.log(`[WebRTC] Canal de dados aberto. Publicando transmissão de tela para ${conn.peer} em 400ms...`);
        setTimeout(() => {
          publishScreenShareToPeer(conn.peer);
        }, 400);
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
        if (data.type === 'media-sync') {
          // Responde com o nosso estado atual: garante que o parceiro nunca fique com estado desatualizado
          try {
            conn.send({
              type: 'media-state',
              isVideoOff: isVideoOffRef.current,
              isMicMuted: isMicMutedRef.current,
              cameraFilter: cameraFilterRef.current,
              isScreenSharing: !!(localScreenStreamRef.current && localScreenStreamRef.current.getTracks().some((t) => t.readyState === 'live')),
              screenPreset: localScreenStreamRef.current ? (activePresetRef.current || activePreset) : null
            });
          } catch (e) {}
        }
        if (data.isVideoOff !== undefined) {
          setIsRemoteVideoOff(data.isVideoOff);
        }
        if (data.isMicMuted !== undefined) {
          setIsRemoteMicMuted(data.isMicMuted);
        }
        if (data.profile) {
          applyRemoteProfileUpdate(data.profile);
        }
        if (data.cameraFilter !== undefined) {
          setRemoteCameraFilter(data.cameraFilter);
        }
        if (data.isScreenSharing) {
          setIsRemoteScreenSharingState(true);
          if (data.screenPreset) {
            setRemoteScreenPreset(data.screenPreset);
          }
          if (!remoteScreenStreamRef.current) {
            console.log('[WebRTC] Parceiro está transmitindo tela. Solicitando stream...');
            try {
              conn.send({ type: 'request-screen-share' });
            } catch (e) {}
          }
        } else if (data.isScreenSharing === false) {
          setIsRemoteScreenSharingState(false);
          setRemoteScreenPreset(null);
        }
      } else if (data.type === 'request-screen-share') {
        if (localScreenStreamRef.current && localScreenStreamRef.current.getTracks().some((t) => t.readyState === 'live')) {
          console.log(`[WebRTC] Parceiro solicitou transmissão de tela. Publicando para ${conn.peer}...`);
          publishScreenShareToPeer(conn.peer);
        }
      } else if (data.type === 'camera-filter') {
        if (data.filter !== undefined) {
          setRemoteCameraFilter(data.filter);
        }
      } else if (data.type === 'screen-share-start') {
        setIsRemoteScreenSharingState(true);
        if (data.preset) {
          setRemoteScreenPreset(data.preset);
        }
        showToast('O parceiro começou a transmitir a tela! 📺', 'info');
        if (!remoteScreenStreamRef.current) {
          try {
            conn.send({ type: 'request-screen-share' });
          } catch (e) {}
        }
      } else if (data.type === 'screen-quality-update') {
        if (data.preset) {
          setRemoteScreenPreset(data.preset);
          showToast(`Transmissão do parceiro atualizada para: ${data.preset.label} 📺`, 'info');
        }
      } else if (data.type === 'screen-share-stop') {
        setIsRemoteScreenSharingState(false);
        setRemoteScreenPreset(null);
        if (activeIncomingScreenCallRef.current) {
          try { activeIncomingScreenCallRef.current.close(); } catch (e) {}
          activeIncomingScreenCallRef.current = null;
        }
        remoteScreenStreamRef.current = null;
        setRemoteScreenStream(null);
        showToast('O parceiro encerrou a transmissão de tela.', 'info');
      }
    });

    conn.on('close', () => {
      console.log(`[DataConnection] Canal de dados fechado para ${conn.peer}.`);
      if (dataConnRef.current && dataConnRef.current.peer === conn.peer) {
        dataConnRef.current = null;
        setTimeout(() => {
          if (!dataConnRef.current) {
            const pcState = mainMediaCallRef.current?.peerConnection?.connectionState;
            if (pcState !== 'connected') {
              setIsRemoteVideoOff(true);
              setIsRemoteMicMuted(true);
              setConnectionState(mode === 'host' ? 'waiting' : 'disconnected');
              setRemoteStream(null);
              setRemoteScreenStream(null);
            }
          }
        }, 3000);
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
    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach((t) => {
        if (audioWorkletManager.isMixedAudioTrack(t)) return;
        try { t.stop(); } catch (e) {}
      });
      localScreenStreamRef.current = null;
    }
    if (localScreenCallRef.current) {
      try { localScreenCallRef.current.close(); } catch (e) {}
      localScreenCallRef.current = null;
    }
    if (activeIncomingScreenCallRef.current) {
      try { activeIncomingScreenCallRef.current.close(); } catch (e) {}
      activeIncomingScreenCallRef.current = null;
    }
    remoteScreenStreamRef.current = null;

    electronBridge.stopProcessAudio().catch(() => {});
    audioWorkletManager.clearBuffer();

    if (mainMediaCallRef.current) {
      try { mainMediaCallRef.current.close(); } catch (e) {}
      mainMediaCallRef.current = null;
    }
    videoSenderRef.current = null;
    audioSenderRef.current = null;

    if (peerRef.current) {
      apiService.leaveRoom(peerRef.current.id, myProfile?.id, currentSessionIdRef.current);
      peerRef.current.destroy();
      peerRef.current = null;
    }

    setInCall(false);
    setConnectionState('idle');
    setLocalStream(null);
    setRemoteStream(null);
    setLocalScreenStream(null);
    setRemoteScreenStream(null);
    setRemoteScreenPreset(null);
    setIsMicMuted(true);
    setIsVideoOff(true);
    showToast('Você saiu da chamada.', 'info');
  }, [myProfile, showToast]);

  const changeModularQuality = useCallback(async (resKey, fps) => {
    const newPreset = getModularStreamPreset(resKey, fps);
    activePresetRef.current = newPreset;
    setStreamResolution(resKey);
    setStreamFps(fps);
    setActivePreset(newPreset);

    // 1. Atualizar constraints do track de vídeo da tela local em tempo real
    if (localScreenStreamRef.current) {
      const vTrack = localScreenStreamRef.current.getVideoTracks()[0];
      if (vTrack && vTrack.applyConstraints) {
        try {
          await vTrack.applyConstraints({
            width: { ideal: newPreset.maxWidth, max: newPreset.maxWidth },
            height: { ideal: newPreset.maxHeight, max: newPreset.maxHeight },
            frameRate: { ideal: newPreset.maxFps, max: newPreset.maxFps }
          });
        } catch (cErr) {
          console.debug('[WebRTC] applyConstraints não suportado no track local:', cErr);
        }
      }
    }

    // 2. Atualizar parâmetros do RTCRtpSender da chamada de tela dedicada
    if (localScreenCallRef.current?.peerConnection) {
      try {
        const senders = localScreenCallRef.current.peerConnection.getSenders();
        for (const s of senders) {
          if (s.track && s.track.kind === 'video') {
            await applySenderParameters(s, newPreset, true);
          }
        }
      } catch (pErr) {
        console.debug('[WebRTC] Erro ao aplicar parâmetros no RTCRtpSender de tela:', pErr);
      }
    }

    // 3. Notificar parceiro remoto da nova qualidade da transmissão (apenas se estivermos transmitindo tela)
    if (localScreenStreamRef.current && dataConnRef.current && dataConnRef.current.open) {
      try {
        dataConnRef.current.send({
          type: 'screen-quality-update',
          preset: newPreset,
          resolutionKey: resKey,
          fps
        });
      } catch (e) {}
    }

    // 4. Se houver sender de câmera, atualizar também
    if (videoSenderRef.current) {
      await applySenderParameters(videoSenderRef.current, newPreset, false);
    }

    if (localScreenStreamRef.current) {
      showToast(`Qualidade da sua transmissão: ${newPreset.label} (${(newPreset.screenBitrate / 1_000_000).toFixed(1)} Mbps) 🚀`, 'success');
    } else {
      showToast(`Predefinição salva: ${newPreset.label}`, 'info');
    }
  }, [showToast]);

  const changeQualityPreset = useCallback((presetKey) => {
    const preset = QUALITY_PRESETS[presetKey];
    if (!preset) return;
    changeModularQuality(preset.resolutionKey || '1080p', preset.fps || 60);
  }, [changeModularQuality]);

  const openQualityModal = useCallback(() => setIsQualityModalOpen(true), []);
  const closeQualityModal = useCallback(() => setIsQualityModalOpen(false), []);

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
        remoteScreenPreset,
        streamResolution,
        streamFps,
        setStreamResolution,
        setStreamFps,
        changeModularQuality,
        isQualityModalOpen,
        setIsQualityModalOpen,
        openQualityModal,
        closeQualityModal,
        isTheaterMode,
        screenFitMode,
        cameraFitMode,
        availableCameras,
        selectedCameraId,
        cameraFacingMode,
        isCameraMirrored,
        cameraFilter,
        remoteCameraFilter,
        cameraResolution,
        switchCamera,
        flipCamera,
        toggleCameraMirror,
        setCameraFilter: changeCameraFilter,
        setCameraResolution: changeCameraResolution,
        refreshCameraDevices,
        getCameraStream,
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
        setCameraFitMode,
        setScreenVolume,
        setIsScreenMuted,
        isDeafened,
        toggleDeafen
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
