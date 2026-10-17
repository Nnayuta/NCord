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
    if (!path) return '';
    let targetPath = path;
    // Se recebeu uma URL absoluta que aponta para uma rota da API (/api/...), extrai a rota relativa
    if (typeof targetPath === 'string' && targetPath.includes('/api/')) {
      const apiIdx = targetPath.indexOf('/api/');
      targetPath = targetPath.substring(apiIdx);
    }
    const cleanPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
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

  async getWebAccessStatus() {
    try {
      const res = await fetch(this.getFullUrl('/api/auth/web-status'), {
        headers: this.getHeaders()
      });
      if (!res.ok) return { success: false, enabled: false };
      return await res.json();
    } catch (e) {
      return { success: false, enabled: false };
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

  async uploadAvatar(profileId, fileOrBlob) {
    const url = this.getFullUrl(`/api/avatar/${encodeURIComponent(profileId)}`);
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders({
        'Content-Type': 'image/jpeg'
      }),
      body: fileOrBlob
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  }

  async deleteAvatar(profileId) {
    const url = this.getFullUrl(`/api/avatar/${encodeURIComponent(profileId)}`);
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.getHeaders()
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  }

  getAvatarUrl(avatarPath) {
    if (!avatarPath) return null;
    if (avatarPath.startsWith('data:') || avatarPath.startsWith('blob:')) {
      return avatarPath;
    }
    // Se aponta para a rota interna /api/avatar/, sempre normaliza com getFullUrl para garantir a URL correta do cliente
    if (typeof avatarPath === 'string' && avatarPath.includes('/api/avatar/')) {
      const idx = avatarPath.indexOf('/api/avatar/');
      return this.getFullUrl(avatarPath.substring(idx));
    }
    if (avatarPath.startsWith('http://') || avatarPath.startsWith('https://')) {
      return avatarPath;
    }
    return this.getFullUrl(avatarPath);
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

  async occupyProfile(profileId, peerId, roomName = 'lovechat', sessionId = null) {
    try {
      const res = await fetch(this.getFullUrl('/api/room/occupy'), {
        method: 'POST',
        headers: this.getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ profileId, peerId, room: roomName, sessionId })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return { success: false, error: errData.error || `HTTP ${res.status}`, message: errData.message };
      }
      return await res.json();
    } catch (err) {
      return { success: false, error: err.message, occupiedProfiles: [] };
    }
  }

  async heartbeatProfile(profileId, peerId, sessionId = null) {
    try {
      const res = await fetch(this.getFullUrl('/api/room/heartbeat'), {
        method: 'POST',
        headers: this.getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ profileId, peerId, sessionId })
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

  async leaveRoom(peerId, profileId, sessionId = null) {
    try {
      await fetch(this.getFullUrl('/api/room/leave'), {
        method: 'POST',
        headers: this.getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ peerId, profileId, sessionId })
      });
    } catch (err) {
      console.warn('[ApiService] Erro ao notificar saída:', err);
    }
  }

  leaveRoomBeacon(peerId, profileId, sessionId = null) {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      try {
        const token = this.getRoomToken();
        const queryParams = new URLSearchParams({
          peerId: peerId || '',
          profileId: profileId || '',
          sessionId: sessionId || ''
        });
        if (token) queryParams.set('token', token);
        const url = this.getFullUrl(`/api/room/leave?${queryParams.toString()}`);
        const blob = new Blob([JSON.stringify({ peerId, profileId, sessionId })], { type: 'application/json' });
        return navigator.sendBeacon(url, blob);
      } catch (e) {
        console.warn('[ApiService] Falha no sendBeacon:', e);
      }
    }
    return false;
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
