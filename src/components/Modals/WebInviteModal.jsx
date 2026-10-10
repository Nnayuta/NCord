import React, { useState } from 'react';
import {
  X,
  Globe,
  Wifi,
  Copy,
  Check,
  QrCode,
  ShieldCheck,
  RefreshCw,
  PowerOff,
  Sparkles,
  Lock,
  ArrowRight
} from 'lucide-react';
import { useServer } from '../../context/ServerContext';
import { QRCodeCanvas } from '../Common/QRCodeCanvas';
import { useToast } from '../../hooks/useToast';

export function WebInviteModal() {
  const { showToast } = useToast();
  const {
    isWebInviteModalOpen,
    closeWebInviteModal,
    webTunnelInfo,
    startWebTunnelAction,
    stopWebTunnelAction,
    regenerateTokenAction,
    lanIp
  } = useServer();

  const [linkType, setLinkType] = useState('tunnel'); // 'tunnel' | 'local'
  const [copied, setCopied] = useState(false);

  if (!isWebInviteModalOpen) return null;

  const isOnline = webTunnelInfo?.isOnline && !!webTunnelInfo?.url;
  const isStarting = webTunnelInfo?.status === 'starting';

  // Gerar o Link Mágico com os parâmetros da sala e do token
  const baseUrl = linkType === 'tunnel' && webTunnelInfo?.url
    ? webTunnelInfo.url
    : `http://${lanIp || 'localhost'}:3000`;

  const tokenParam = webTunnelInfo?.token ? `&token=${encodeURIComponent(webTunnelInfo.token)}` : '';
  const magicLink = `${baseUrl}/?room=lovechat&role=guest&profile=user2${tokenParam}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(magicLink);
    setCopied(true);
    showToast('Link Mágico copiado com sucesso! 💕', 'success');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCopyToken = () => {
    if (webTunnelInfo?.token) {
      navigator.clipboard.writeText(webTunnelInfo.token);
      showToast('Chave secreta copiada!', 'info');
    }
  };

  return (
    <div className="modal-overlay-backdrop web-invite-overlay" onClick={closeWebInviteModal}>
      <div className="modal-dialog web-invite-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Cabeçalho */}
        <div className="web-modal-header">
          <div className="web-modal-title-row">
            <div className="web-modal-icon-wrap">
              <Globe size={22} color="#f43f8e" />
            </div>
            <div>
              <h3>Conexão Web para o Par</h3>
              <p className="web-modal-subtitle">Seu amor conecta pelo navegador sem instalar nada 💕</p>
            </div>
          </div>
          <button
            type="button"
            className="btn-close-web-modal"
            onClick={closeWebInviteModal}
            title="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="web-modal-body">
          {!isOnline ? (
            <div className="web-start-panel">
              <div className="web-start-art">
                <div className="web-art-circle">
                  <ShieldCheck size={36} color="#ec4899" />
                </div>
              </div>

              <h4>Iniciar Conexão Web Segura</h4>
              <p className="web-start-desc">
                Cria um link protegido por <strong>Criptografia SSL (HTTPS)</strong> com chave única.
                O par conecta do celular ou PC direto no navegador com 1 toque!
              </p>

              <div className="web-security-pills">
                <span className="web-sec-pill">
                  <Lock size={12} color="#22c55e" />
                  <span>Token Blindado</span>
                </span>
                <span className="web-sec-pill">
                  <ShieldCheck size={12} color="#a855f7" />
                  <span>P2P WebRTC Seguro</span>
                </span>
                <span className="web-sec-pill">
                  <Globe size={12} color="#f43f8e" />
                  <span>Internet / 4G</span>
                </span>
              </div>

              <button
                type="button"
                className="btn-launch-tunnel"
                onClick={startWebTunnelAction}
                disabled={isStarting}
              >
                {isStarting ? (
                  <>
                    <RefreshCw size={18} className="spin" />
                    <span>Iniciando Túnel Seguro...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    <span>Iniciar Versão Web & Gerar Link</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="web-active-panel">
              {/* Barra de Status */}
              <div className="web-live-status-bar">
                <div className="web-live-tag">
                  <span className="live-green-pulse"></span>
                  <span className="live-status-text">Túnel HTTPS Ativo & Protegido ✨</span>
                </div>
                <button
                  type="button"
                  className="btn-poweroff-tunnel"
                  onClick={stopWebTunnelAction}
                  title="Encerrar conexão web"
                >
                  <PowerOff size={13} />
                  <span>Desativar</span>
                </button>
              </div>

              {/* Seletor de Tipo de Link */}
              <div className="web-mode-segmented">
                <button
                  type="button"
                  className={`web-segment-btn ${linkType === 'tunnel' ? 'active' : ''}`}
                  onClick={() => setLinkType('tunnel')}
                >
                  <Globe size={14} />
                  <span>Internet / 4G (Recomendado)</span>
                </button>
                <button
                  type="button"
                  className={`web-segment-btn ${linkType === 'local' ? 'active' : ''}`}
                  onClick={() => setLinkType('local')}
                >
                  <Wifi size={14} />
                  <span>Wi-Fi Local ({lanIp || 'LAN'})</span>
                </button>
              </div>

              {/* QR Code */}
              <div className="web-qr-display-wrap">
                <QRCodeCanvas text={magicLink} size={150} darkColor="#181124" lightColor="#ffffff" />
                <span className="web-qr-subtext">
                  <QrCode size={13} />
                  <span>Aponte a câmera do celular para entrar</span>
                </span>
              </div>

              {/* Box de Cópia do Link Mágico */}
              <div className="web-link-field-group">
                <label className="web-field-label">Link de Convite Mágico:</label>
                <div className="web-input-button-wrap">
                  <input
                    type="text"
                    readOnly
                    value={magicLink}
                    className="web-link-text-input"
                    onClick={(e) => e.target.select()}
                  />
                  <button
                    type="button"
                    className={`btn-web-copy-magic ${copied ? 'copied' : ''}`}
                    onClick={handleCopyLink}
                    title="Copiar Link"
                  >
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                    <span>{copied ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                </div>
              </div>

              {/* Chave Secreta da Sala */}
              <div className="web-token-bar">
                <div className="web-token-details">
                  <span className="web-token-title">Chave da Sala:</span>
                  <code className="web-token-badge">{webTunnelInfo.token || 'Ativa'}</code>
                </div>
                <div className="web-token-btn-row">
                  <button
                    type="button"
                    className="btn-web-icon-action"
                    onClick={handleCopyToken}
                    title="Copiar chave secreta"
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    type="button"
                    className="btn-web-icon-action"
                    onClick={regenerateTokenAction}
                    title="Renovar chave secreta"
                  >
                    <RefreshCw size={13} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
