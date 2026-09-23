import React from 'react';
import { useToast } from '../../hooks/useToast';
import { Info, CheckCircle2, AlertCircle } from 'lucide-react';

export function Toast() {
  const { toast } = useToast();

  if (!toast.show) return null;

  const IconComponent =
    toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? AlertCircle : Info;

  return (
    <div className={`toast-msg ${toast.type}`}>
      <IconComponent size={18} />
      <span>{toast.message}</span>
    </div>
  );
}
