import React, { useState } from 'react';
import {
  Server,
  Wifi,
  Copy,
  Check,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  RotateCw,
  Globe,
  Monitor,
  QrCode,
  Loader2,
  PowerOff
} from 'lucide-react';
import { useServer } from '../../context/ServerContext';
import { isElectron } from '../../services/electronBridge';

export function ServerConnectPanel() {
  const {
    mode,
    setMode,
    myIp,
    lanIp,
    remoteIp,
    selectHostMode,
    connectToRemote,
    copyMyIp,
    requestFirewall,
    isFirewallApplied,
    discoveredServers,
    isScanningServers,
    scanForServers,
    openWebInviteModal,
    webTunnelInfo,
    startAndCopyWebLink,
    stopWebTunnelAction
  } = useServer();

  const [inputIp, setInputIp] = useState(remoteIp || '');
  const [copiedIp, setCopiedIp] = useState(false);
  const [copiedWeb, setCopiedWeb] = useState(false);
  const [isWebStarting, setIsWebStarting] = useState(false);
  const [isFirewallLoading, setIsFirewallLoading] = useState(false);

  React.useEffect(() => {
    if (remoteIp && !inputIp) {
      setInputIp(remoteIp);
    }
  }, [remoteIp]);

  const handleRemoteConnect = (e) => {
    e.preventDefault();
    if (inputIp.trim()) {
      connectToRemote(inputIp.trim());
    }
  };

  const handleCopyIpClick = () => {
    copyMyIp();
    setCopiedIp(true);
    setTimeout(() => setCopiedIp(false), 2200);
  };

  const handleStartAndCopyWeb = async (e) => {
    if (e) e.stopPropagation();
    setIsWebStarting(true);
    try {
      const res = await startAndCopyWebLink();
      if (res?.success) {
        setCopiedWeb(true);
        setTimeout(() => setCopiedWeb(false), 2400);
      }
    } finally {
      setIsWebStarting(false);
    }
  };

  const handleStopWeb = async (e) => {
    if (e) e.stopPropagation();
    await stopWebTunnelAction();
  };

  const handleFirewallClick = async () => {
    setIsFirewallLoading(true);
    try {
      await requestFirewall();
    } finally {
      setIsFirewallLoading(false);
    }
  };

  const isDetectingIp = !myIp || myIp.includes('Detectando');
  const isTunnelActive = webTunnelInfo?.isOnline && !!webTunnelInfo?.url;
  const isTunnelBusy = isWebStarting || webTunnelInfo?.status === 'starting';
  const showWebInvite = isElectron || (typeof window !== 'undefined' && window.location.port === '5173');
  const showFirewallTip = isElectron || (typeof window !== 'undefined' && window.location.port === '5173');

  return (
    <div className="server-mode-card">
      {/* Abas de Modo (Hospedar vs Conectar) */}
      <div className="server-mode-tabs">
        <button
          type="button"
          className={`server-mode-tab-btn ${mode === 'host' ? 'active' : ''}`}
          onClick={() => setMode('host')}
        >
          <Server size={16} />
          <span>Hospedar</span>
        </button>
        <button
          type="button"
          className={`server-mode-tab-btn ${mode === 'remote' ? 'active' : ''}`}
          onClick={() => {
            setMode('remote');
            scanForServers();
          }}
        >
          <Wifi size={16} />
          <span>Conectar no Amor</span>
        </button>
      </div>

      {mode === 'host' ? (
        <div className="server-mode-subpanel host-panel-clean">
          {/* Status do Servidor & Acesso Web Direto */}
          <div className="host-status-box">
            {/* Linha 1: Servidor Local */}
            <div className="host-status-row local-row">
              <div className="host-status-left">
                <span className="status-ping-dot"></span>
                <span className="host-status-title">Servidor Local Pronto</span>
              </div>
              <span className="host-port-badge">Porta 3000</span>
            </div>

            {/* Linha 2: Acesso Web Seguro (Iniciar / Copiar com 1 clique) */}
            {showWebInvite && (
              <div className="host-status-row web-row">
                <div className="host-status-left">
                  <Globe size={13} className={isTunnelActive ? "web-icon-live" : "web-icon-idle"} />
                  <span className="host-web-title">
                    {isTunnelActive ? 'Web' : 'Acesso Web'}
                  </span>
                  {isTunnelActive && <span className="host-chip-live">Online ✨</span>}
                </div>

                <div className="host-web-actions">
                  {isTunnelBusy ? (
                    <button type="button" className="btn-web-quick-action loading" disabled>
                      <Loader2 size={12} className="spin" />
                      <span>Iniciando...</span>
                    </button>
                  ) : isTunnelActive ? (
                    <div className="web-action-pill-group">
                      <button
                        type="button"
                        className={`btn-web-quick-action copy ${copiedWeb ? 'copied' : ''}`}
                        onClick={handleStartAndCopyWeb}
                        title="Copiar Link Mágico Web para o seu amor"
                      >
                        {copiedWeb ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copiedWeb ? 'Copiado!' : 'Copiar Link'}</span>
                      </button>
                      <button
                        type="button"
                        className="btn-web-quick-icon"
                        onClick={openWebInviteModal}
                        title="Ver QR Code na Tela"
                      >
                        <QrCode size={13} />
                      </button>
                      <button
                        type="button"
                        className="btn-web-quick-icon danger"
                        onClick={handleStopWeb}
                        title="Desativar Acesso Web"
                      >
                        <PowerOff size={11} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn-web-quick-action start"
                      onClick={handleStartAndCopyWeb}
                      title="Iniciar Versão Web e Copiar Link com 1 clique"
                    >
                      <Sparkles size={12} />
                      <span>Iniciar Web & Copiar Link</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Botão de Ação Primária: Continuar como Anfitrião */}
          <button
            type="button"
            className="btn-connect btn-host-continue"
            onClick={selectHostMode}
          >
            <span>Continuar como Anfitrião</span>
            <ArrowRight size={18} className="btn-arrow-slide" />
          </button>

          {/* Seção de Conexão com o Amor: IP para App no Computador */}
          <div className="host-quick-share-section">
            <div className="host-share-header">
              <Sparkles size={13} className="divider-sparkle" />
              <span>Conectar no Computador (App LoveChat)</span>
            </div>

            <div className="share-compact-card pc-card-full">
              <div className="share-card-top">
                <div className="share-card-label">
                  <Monitor size={14} className="invite-icon-desktop" />
                  <span>IP do Seu Computador</span>
                </div>
                <span className="share-chip-sub">ZeroTier / LAN</span>
              </div>

              <div className="share-ip-row">
                {isDetectingIp ? (
                  <span className="share-ip-loading">
                    <Loader2 size={12} className="spin" />
                    <span>Detectando...</span>
                  </span>
                ) : (
                  <span className="share-ip-value" title={lanIp && lanIp !== myIp ? `LAN: ${lanIp}` : ''}>
                    {myIp}
                  </span>
                )}
                <button
                  type="button"
                  className={`btn-share-copy ${copiedIp ? 'copied' : ''}`}
                  onClick={handleCopyIpClick}
                  disabled={isDetectingIp}
                  title="Copiar IP para o seu par colar na aba Conectar"
                >
                  {copiedIp ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copiedIp ? 'IP Copiado!' : 'Copiar IP'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Rodapé Discreto: Liberação de Firewall */}
          {showFirewallTip && (
            <div className="host-clean-footer">
              {!isFirewallApplied ? (
                <button
                  type="button"
                  className="btn-firewall-subtle"
                  onClick={handleFirewallClick}
                  disabled={isFirewallLoading}
                  title="Permite que conexões de outros computadores entrem na porta 3000"
                >
                  <ShieldCheck size={13} color="#38bdf8" />
                  <span>{isFirewallLoading ? 'Liberando...' : 'O parceiro não conecta? Liberar Firewall'}</span>
                </button>
              ) : (
                <div className="firewall-ok-badge">
                  <ShieldCheck size={12} color="#23a55a" />
                  <span>Firewall configurado</span>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="server-mode-subpanel remote-panel">
          {/* Card de Servidor Detectado Automaticamente */}
          {discoveredServers && discoveredServers.length > 0 && (
            <div className="auto-discovered-card">
              <div className="auto-discovered-header">
                <span className="auto-discovered-badge">
                  <Sparkles size={13} color="#f43f8e" />
                  <span>Servidor Encontrado na Rede!</span>
                </span>
                <span className="pulse-dot" style={{ background: '#23a55a' }}></span>
              </div>

              {discoveredServers.map((s, idx) => (
                <div key={s.ip || idx} className="auto-server-item">
                  <div className="auto-server-info">
                    <span className="auto-server-title">
                      {s.hostName ? `LoveChat (${s.hostName})` : 'Servidor do Amor'}
                    </span>
                    <span className="auto-server-ip">{s.ip}</span>
                  </div>
                  <button
                    type="button"
                    className="btn-auto-connect"
                    onClick={() => connectToRemote(s.ip)}
                  >
                    <span>Conectar</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Barra de Busca Manual & Botão de Varredura */}
          <div className="remote-scan-header">
            <span className="remote-scan-title">
              CONEXÃO POR IP
            </span>
            <button
              type="button"
              className="btn-refresh-scan"
              onClick={() => scanForServers(true)}
              title="Buscar Servidores no ZeroTier/LAN"
            >
              <RotateCw size={13} className={isScanningServers ? 'spin' : ''} />
              <span>{isScanningServers ? 'Buscando...' : 'Buscar na Rede'}</span>
            </button>
          </div>

          <form onSubmit={handleRemoteConnect} className="remote-connect-form">
            <div className="remote-ip-box">
              <input
                type="text"
                value={inputIp}
                onChange={(e) => setInputIp(e.target.value)}
                placeholder="Cole o IP do seu amor (Ex: 10.147.x.x)"
                autoComplete="off"
              />
              <button type="submit" className="btn-connect-ip" title="Conectar ao Servidor">
                <span>Conectar</span>
                <ArrowRight size={16} />
              </button>
            </div>
            <p className="remote-help-hint">
              💡 Peça para seu amor copiar o IP na aba &quot;Hospedar&quot; e enviar para você.
            </p>
          </form>
        </div>
      )}
    </div>
  );
}
