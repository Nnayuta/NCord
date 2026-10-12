import React, { useState } from 'react';
import { Plus, Trash2, CheckCircle2, Circle, ChevronDown, ChevronRight, NotebookPen } from 'lucide-react';
import { useNotes } from '../../../context/NotesContext';

export function CoupleBoard() {
  const { notes, addNote, toggleNote, deleteNote } = useNotes();
  const [inputText, setInputText] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputText.trim()) {
      addNote(inputText.trim());
      setInputText('');
    }
  };

  return (
    <div className="couple-board">
      <div
        className="board-collapse-header"
        onClick={() => setIsExpanded((v) => !v)}
        title={isExpanded ? 'Recolher Quadro' : 'Expandir Quadro'}
        style={{ cursor: 'pointer' }}
      >
        <div className="board-header-title">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>Quadro de Recados 📝 ({notes.length})</span>
        </div>
      </div>

      {isExpanded && (
        <div className="board-expanded-content">
          <form onSubmit={handleSubmit} className="board-input-wrapper">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Adicionar segredo/recado..."
              autoComplete="off"
            />
            <button type="submit" title="Adicionar no Quadro">
              <Plus size={16} />
            </button>
          </form>

          <ul className="board-notes-list">
            {notes.map((note) => (
              <li key={note.id} className={`board-note-item ${note.completed ? 'completed' : ''}`}>
                <button
                  type="button"
                  onClick={() => toggleNote(note.id)}
                  style={{ display: 'flex', alignItems: 'center', color: note.completed ? '#23a55a' : '#949ba4' }}
                >
                  {note.completed ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                </button>
                <span onClick={() => toggleNote(note.id)} style={{ cursor: 'pointer' }}>
                  {note.text}
                </span>
                <button
                  type="button"
                  className="btn-delete-note"
                  onClick={() => deleteNote(note.id)}
                  title="Remover nota"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
