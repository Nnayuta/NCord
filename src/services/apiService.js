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
    if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getMyIp) {
      try {
        const electronIp = await window.electronAPI.getMyIp();
        if (electronIp && (electronIp.ip || electronIp.zerotierIp || electronIp.lanIp)) {
          return electronIp;
        }
      } catch (e) {
        console.warn('[ApiService] Aviso ao obter IP nativo Electron:', e);
      }
    }
    try {
      const res = await fetch(this.getFullUrl('/api/my-ip'));
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
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

  async getRoomStatus(roomName = 'lovechat') {
    try {
      const res = await fetch(this.getFullUrl(`/api/room/${roomName}/status`));
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      return { hostOnline: false, peersCount: 0, peers: [], occupiedProfiles: [] };
    }
  }

  async occupyProfile(profileId, peerId, roomName = 'lovechat') {
    try {
      const res = await fetch(this.getFullUrl('/api/room/occupy'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, peerId, room: roomName })
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      return { success: false, occupiedProfiles: [] };
    }
  }

  async heartbeatProfile(profileId, peerId) {
    try {
      const res = await fetch(this.getFullUrl('/api/room/heartbeat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, peerId })
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      return { success: false };
    }
  }

  async discoverServers() {
    if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.discoverServers) {
      try {
        const electronRes = await window.electronAPI.discoverServers();
        if (electronRes && Array.isArray(electronRes.servers)) {
          return electronRes;
        }
      } catch (e) {
        console.warn('[ApiService] Erro ao descobrir servidores via Electron:', e);
      }
    }
    try {
      const res = await fetch(this.getFullUrl('/api/discover-servers'));
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      return { servers: [] };
    }
  }

  async leaveRoom(peerId, profileId) {
    try {
      await fetch(this.getFullUrl('/api/room/leave'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peerId, profileId })
      });
    } catch (err) {
      console.warn('[ApiService] Erro ao notificar saída:', err);
    }
  }

  // Métodos do Álbum de Fotos Compartilhado
  async getAlbumStatus() {
    try {
      const res = await fetch(this.getFullUrl('/api/album/status'));
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      return { isConfigured: false, folderName: null, count: 0 };
    }
  }

  async getAlbumPhotos() {
    try {
      const res = await fetch(this.getFullUrl('/api/album/photos'));
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      return { isConfigured: false, folderName: null, count: 0, photos: [] };
    }
  }

  async setAlbumFolder(folderPath) {
    try {
      const res = await fetch(this.getFullUrl('/api/album/set-folder'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath })
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async clearAlbumFolder() {
    try {
      const res = await fetch(this.getFullUrl('/api/album/clear-folder'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      return { success: false };
    }
  }

  getPhotoUrl(filename) {
    return this.getFullUrl(`/api/album/photo/${encodeURIComponent(filename)}`);
  }
}

export const apiService = new ApiService();
