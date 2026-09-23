import React, { useState } from 'react';
import { Edit2, X, Check } from 'lucide-react';

export function EditNameModal({ isOpen, onClose, currentName, onSave, title = 'Editar Nome' }) {
  const [name, setName] = useState(currentName || '');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) {
      onSave(name.trim());
      onClose();
    }
  };

  return (
    <div className="modal-overlay-backdrop" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '380px' }}>
        <div className="quality-header">
          <div className="quality-title">
            <Edit2 size={18} />
            <span>{title}</span>
          </div>
          <button className="btn-close-quality" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: '1rem' }}>
          <div className="remote-ip-box">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Digite o novo apelido"
              autoFocus
              maxLength={24}
            />
          </div>
          <div className="screen-picker-actions" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn-picker-cancel" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-picker-confirm">
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
