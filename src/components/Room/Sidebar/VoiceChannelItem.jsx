import React from 'react';
import { Volume2 } from 'lucide-react';

export function VoiceChannelItem() {
  return (
    <div className="voice-channel-item">
      <Volume2 size={18} className="voice-channel-icon" />
      <span className="voice-channel-name">Nosso Cantinho</span>
    </div>
  );
}
