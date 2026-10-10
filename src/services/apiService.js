/**
 * Serviço de API HTTP para comunicação com o servidor LoveChat
 */

export class ApiService {
  constructor() {
    this.baseUrl = '';
    this.roomToken = '';
    if (typeof window !== 'undefined') {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('token');
        if (urlToken) {
          this.setRoomToken(urlToken);
        } else if (typeof sessionStorage !== 'undefined') {
          this.roomToken = sessionStorage.getItem('lovechat_room_token') || '';
        }
      } catch (e) {}
    }
  }

  setRoomToken(token) {
    this.roomToken = (token || '').trim();
    if (typeof sessionStorage !== 'undefined') {
      if (this.roomToken) {
        sessionStorage.setItem('lovechat_room_token', this.roomToken);
      } else {
        sessionStorage.removeItem('lovechat_room_token');
      }
    }
  }

  getRoomToken() {
    if (!this.roomToken && typeof sessionStorage !== 'undefined') {
      this.roomToken = sessionStorage.getItem('lovechat_room_token') || '';
    }
    return this.roomToken;
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
      if (!parsed.port && parsed.hostname !== 'localhost' && !cleaned.includes('trycloudflare.com')) {
        parsed.port = '3000';
      }
      this.baseUrl = parsed.origin;
    } catch (e) {
      this.baseUrl = cleaned;
    }
  }

  getFullUrl(path) {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    let url = '';
    if (!this.baseUrl) {
      if (typeof window !== 'undefined') {
        if (window.location.protocol === 'file:' || window.location.port === '5173') {
          url = `http://localhost:3000${cleanPath}`;
        } else {
          url = `${window.location.origin}${cleanPath}`;
        }
      } else {
        url = cleanPath;
      }
    } else {
      url = `${this.baseUrl}${cleanPath}`;
    }

    const token = this.getRoomToken();
    if (token && !url.includes('token=')) {
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}token=${encodeURIComponent(token)}`;
    }
    return url;
  }

  getHeaders(customHeaders = {}) {
    const headers = { ...customHeaders };
    const token = this.getRoomToken();
    if (token) {
      headers['x-room-token'] = token;
    }
    return headers;
  }

  async verifyToken(token) {
    const t = (token || this.getRoomToken() || '').trim();
    if (!t) return false;
    try {
      const res = await fetch(this.getFullUrl('/api/auth/verify'), {
        method: 'POST',
        headers: this.getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ token: t })
      });
      if (!res.ok) return false;
      const data = await res.json();
      return !!data.valid;
    } catch (e) {
      return false;
    }
  }

  async fetchRoomToken() {
    try {
      const res = await fetch(this.getFullUrl('/api/auth/token'), {
        headers: this.getHeaders()
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data && data.token) {
        this.setRoomToken(data.token);
        return data.token;
      }
      return null;
    } catch (e) {
      return null;
    }
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
      const res = await fetch(this.getFullUrl('/api/my-ip'), {
        headers: this.getHeaders()
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      return { ip: '127.0.0.1', zerotierIp: '127.0.0.1', lanIp: '127.0.0.1' };
    }
  }

  async getDb() {
    try {
      const res = await fetch(this.getFullUrl('/api/db'), {
        headers: this.getHeaders()
      });
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
        headers: this.getHeaders({ 'Content-Type': 'application/json' }),
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
      const res = await fetch(this.getFullUrl(`/api/room/${roomName}/status`), {
        headers: this.getHeaders()
      });
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
        headers: this.getHeaders({ 'Content-Type': 'application/json' }),
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
        headers: this.getHeaders({ 'Content-Type': 'application/json' }),
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
      const res = await fetch(this.getFullUrl('/api/discover-servers'), {
        headers: this.getHeaders()
      });
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
        headers: this.getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ peerId, profileId })
      });
    } catch (err) {
      console.warn('[ApiService] Erro ao notificar saída:', err);
    }
  }

  // Métodos do Álbum de Fotos Compartilhado
  async getAlbumStatus() {
    try {
      const res = await fetch(this.getFullUrl('/api/album/status'), {
        headers: this.getHeaders()
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      return { isConfigured: false, folderName: null, count: 0 };
    }
  }

  async getAlbumPhotos() {
    try {
      const res = await fetch(this.getFullUrl('/api/album/photos'), {
        headers: this.getHeaders()
      });
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
        headers: this.getHeaders({ 'Content-Type': 'application/json' }),
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
        headers: this.getHeaders({ 'Content-Type': 'application/json' })
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
