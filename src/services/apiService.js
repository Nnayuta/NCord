/**
 * Serviço de API HTTP para comunicação com o servidor LoveChat
 */

export class ApiService {
  constructor() {
    this.baseUrl = '';
  }

  setBaseUrl(url) {
    if (!url) {
      this.baseUrl = '';
      return;
    }
    let cleaned = url.trim();
    if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
      cleaned = `http://${cleaned}`;
    }
    try {
      const parsed = new URL(cleaned);
      if (!parsed.port && parsed.hostname !== 'localhost') {
        parsed.port = '3000';
      }
      this.baseUrl = parsed.origin;
    } catch (e) {
      this.baseUrl = cleaned;
    }
  }

  getFullUrl(path) {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    if (!this.baseUrl) {
      // Se estiver executando no Electron (file://) ou em ambiente dev, apontar para porta 3000
      if (typeof window !== 'undefined' && (window.location.protocol === 'file:' || !window.location.port || window.location.port === '5173')) {
        return `http://localhost:3000${cleanPath}`;
      }
      return cleanPath;
    }
    return `${this.baseUrl}${cleanPath}`;
  }

  async getMyIp() {
    try {
      const res = await fetch(this.getFullUrl('/api/my-ip'));
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('[ApiService] Erro ao obter IP:', err);
      return { ip: '127.0.0.1', zerotierIp: '127.0.0.1', lanIp: '127.0.0.1' };
    }
  }

  async getDb() {
    try {
      const res = await fetch(this.getFullUrl('/api/db'));
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('[ApiService] Erro ao obter DB:', err);
      return null;
    }
  }

  async updateDb(data) {
    try {
      const res = await fetch(this.getFullUrl('/api/db'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('[ApiService] Erro ao atualizar DB:', err);
      return null;
    }
  }

  async updateProfile(profileUpdate) {
    return await this.updateDb({ profileUpdate });
  }

  async updateNotes(notes) {
    return await this.updateDb({ notes });
  }

  async getRoomStatus(roomName) {
    try {
      const res = await fetch(this.getFullUrl(`/api/room/${roomName}/status`));
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('[ApiService] Erro ao consultar sala:', err);
      return { hostOnline: false, peersCount: 0, peers: [] };
    }
  }

  async discoverServers() {
    try {
      const res = await fetch(this.getFullUrl('/api/discover-servers'));
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      return { servers: [] };
    }
  }

  async leaveRoom(peerId) {
    try {
      await fetch(this.getFullUrl('/api/room/leave'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peerId })
      });
    } catch (err) {
      console.warn('[ApiService] Erro ao notificar saída:', err);
    }
  }
}

export const apiService = new ApiService();
