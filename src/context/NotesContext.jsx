import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/apiService';
import { useToast } from '../hooks/useToast';

const NotesContext = createContext(null);

export function NotesProvider({ children }) {
  const { showToast } = useToast();
  const [notes, setNotes] = useState([
    { id: 1, text: 'Bem-vindo ao LoveChat! Adicione notas e recados aqui ✨', completed: false, category: 'cozy' },
    { id: 2, text: 'Clique para riscar ou adicione novos planos no botão acima 📝', completed: false, category: 'soft' }
  ]);

  const fetchNotes = useCallback(async () => {
    try {
      const db = await apiService.getDb();
      if (db && Array.isArray(db.notes)) {
        setNotes(db.notes);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    fetchNotes();
    const interval = setInterval(fetchNotes, 8000);
    return () => clearInterval(interval);
  }, [fetchNotes]);

  const addNote = useCallback(async (text) => {
    const trimmed = (text || '').trim();
    if (!trimmed) return;

    const newNote = {
      id: Date.now(),
      text: trimmed,
      completed: false,
      createdAt: new Date().toISOString()
    };

    const updated = [newNote, ...notes];
    setNotes(updated);

    try {
      await apiService.updateNotes(updated);
      showToast('Nota adicionada ao Quadro do Casal! 📝', 'success');
    } catch (e) {
      showToast('Erro ao salvar nota no servidor.', 'error');
    }
  }, [notes, showToast]);

  const toggleNote = useCallback(async (id) => {
    const updated = notes.map((n) => (n.id === id ? { ...n, completed: !n.completed } : n));
    setNotes(updated);
    try {
      await apiService.updateNotes(updated);
    } catch (e) {}
  }, [notes]);

  const deleteNote = useCallback(async (id) => {
    const updated = notes.filter((n) => n.id !== id);
    setNotes(updated);
    try {
      await apiService.updateNotes(updated);
      showToast('Nota removida.', 'info');
    } catch (e) {}
  }, [notes, showToast]);

  return (
    <NotesContext.Provider value={{ notes, addNote, toggleNote, deleteNote, fetchNotes }}>
      {children}
    </NotesContext.Provider>
  );
}

export function useNotes() {
  const context = useContext(NotesContext);
  if (!context) {
    throw new Error('useNotes must be used within a NotesProvider');
  }
  return context;
}
