import React, { useState } from 'react';
import { Server, Wifi, Copy, ShieldCheck, ArrowRight, Sparkles, RotateCw, CheckCircle2 } from 'lucide-react';
import { useServer } from '../../context/ServerContext';
import { isElectron } from '../../services/electronBridge';

export function ServerConnectPanel() {
  const {
    mode,
    setMode,
    myIp,
    remoteIp,
    selectHostMode,
    connectToRemote,
    copyMyIp,
    requestFirewall,
    isFirewallApplied,
    discoveredServers,
    isScanningServers,
    scanForServers
  } = useServer();

  const [inputIp, setInputIp] = useState(remoteIp || '');

  const handleRemoteConnect = (e) => {
    e.preventDefault();
    if (inputIp.trim()) {
      connectToRemote(inputIp.trim());
    }
  };

  return (
    <div className="server-mode-card">
      <div className="server-mode-tabs">
        <button
          type="button"
          className={`server-mode-tab-btn ${mode === 'host' ? 'active' : ''}`}
          onClick={() => setMode('host')}
        >
          <Server size={16} />
          <span>Hospedar (Meu PC)</span>
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
        <div className="server-mode-subpanel">
          <div className="server-ip-pill">
            <span className="ip-title">Seu IP ZeroTier:</span>
            <span className="ip-addr">{myIp}</span>
            <button
              type="button"
              className="btn-copy-ip-pill"
              onClick={copyMyIp}
              title="Copiar IP para mandar pro amor"
            >
              <Copy size={16} />
            </button>
          </div>

          <div className="server-status-pill">
            <span className="status-indicator-dot"></span>
            <span>Servidor Pronto na Porta 3000 ✨</span>
          </div>

          {isElectron && !isFirewallApplied && (
            <button
              type="button"
              className="btn-firewall-action"
              onClick={requestFirewall}
              title="Garantir liberação no Firewall do Windows"
            >
              <ShieldCheck size={16} />
              <span>Liberar Firewall do Windows</span>
            </button>
          )}

          <button
            type="button"
            className="btn-connect btn-step-action"
            onClick={selectHostMode}
          >
            <span>Continuar como Anfitrião</span>
            <ArrowRight size={18} />
          </button>
        </div>
      ) : (
        <div className="server-mode-subpanel">
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
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#949ba4' }}>
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

          <form onSubmit={handleRemoteConnect}>
            <div className="remote-ip-box">
              <input
                type="text"
                value={inputIp}
                onChange={(e) => setInputIp(e.target.value)}
                placeholder="Digite o IP do ZeroTier do Amor"
                autoComplete="off"
              />
              <button type="submit" className="btn-connect-ip" title="Conectar ao Servidor">
                <span>Conectar</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
