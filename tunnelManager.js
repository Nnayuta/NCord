const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');
const { bin, install, use, Tunnel } = require('cloudflared');

class TunnelManager extends EventEmitter {
  constructor() {
    super();
    this.currentTunnel = null;
    this.publicUrl = null;
    this.status = 'idle'; // 'idle' | 'installing' | 'starting' | 'online' | 'error'
    this.lastError = null;
    this.customBinPath = null;
  }

  init(userDataDir) {
    if (userDataDir) {
      const binDir = path.join(userDataDir, 'bin');
      try {
        if (!fs.existsSync(binDir)) {
          fs.mkdirSync(binDir, { recursive: true });
        }
      } catch (e) {}

      const exeName = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
      this.customBinPath = path.join(binDir, exeName);
      use(this.customBinPath);
    }
  }

  async ensureBinaryInstalled() {
    const targetBin = this.customBinPath || bin;
    if (fs.existsSync(targetBin)) {
      return true;
    }

    this.status = 'installing';
    this.emit('status-change', { status: 'installing' });
    console.log(`[TunnelManager] Baixando binário oficial do Cloudflare em: ${targetBin}...`);

    try {
      await install(targetBin);
      console.log('[TunnelManager] Binário do Cloudflare instalado com sucesso!');
      return true;
    } catch (err) {
      console.error('[TunnelManager] Erro ao instalar cloudflared:', err);
      this.lastError = err.message;
      this.status = 'error';
      this.emit('status-change', { status: 'error', error: err.message });
      throw err;
    }
  }

  async startTunnel(port = 3000) {
    if (this.currentTunnel && this.publicUrl) {
      return { success: true, url: this.publicUrl, status: this.status };
    }

    try {
      this.status = 'starting';
      this.lastError = null;
      this.emit('status-change', { status: 'starting' });

      await this.ensureBinaryInstalled();

      const targetUrl = `http://127.0.0.1:${port}`;
      console.log(`[TunnelManager] Iniciando Quick Tunnel seguro para ${targetUrl}...`);

      const tunnel = Tunnel.quick(targetUrl);
      this.currentTunnel = tunnel;

      return new Promise((resolve, reject) => {
        let resolved = false;

        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            this.status = 'error';
            this.lastError = 'Tempo limite excedido ao obter URL do túnel da Cloudflare.';
            this.emit('status-change', { status: 'error', error: this.lastError });
            this.stopTunnel();
            resolve({ success: false, error: this.lastError });
          }
        }, 30000);

        tunnel.once('url', (url) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            this.publicUrl = url;
            this.status = 'online';
            console.log(`[TunnelManager] 🌐 Túnel HTTPS ativo: ${url}`);
            this.emit('status-change', { status: 'online', url });
            resolve({ success: true, url, status: 'online' });
          }
        });

        tunnel.on('error', (err) => {
          console.warn('[TunnelManager] Erro no túnel:', err);
          this.lastError = err.message;
          this.emit('error', err);
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            this.status = 'error';
            this.emit('status-change', { status: 'error', error: err.message });
            resolve({ success: false, error: err.message });
          }
        });

        tunnel.on('exit', (code, signal) => {
          console.log(`[TunnelManager] Processo do túnel encerrou (code: ${code}, signal: ${signal})`);
          this.currentTunnel = null;
          this.publicUrl = null;
          this.status = 'idle';
          this.emit('status-change', { status: 'idle' });
        });
      });
    } catch (err) {
      this.status = 'error';
      this.lastError = err.message;
      this.emit('status-change', { status: 'error', error: err.message });
      return { success: false, error: err.message };
    }
  }

  stopTunnel() {
    if (this.currentTunnel) {
      try {
        console.log('[TunnelManager] Encerrando túnel Cloudflare...');
        this.currentTunnel.stop();
      } catch (e) {
        console.warn('[TunnelManager] Aviso ao parar túnel:', e);
      }
      this.currentTunnel = null;
    }
    this.publicUrl = null;
    this.status = 'idle';
    this.emit('status-change', { status: 'idle' });
    return { success: true };
  }

  getStatus() {
    return {
      status: this.status,
      url: this.publicUrl,
      error: this.lastError,
      isOnline: this.status === 'online' && !!this.publicUrl
    };
  }
}

module.exports = new TunnelManager();
