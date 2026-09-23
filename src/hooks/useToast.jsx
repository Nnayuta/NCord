import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });
  const timeoutRef = useRef(null);

  const showToast = useCallback((message, type = 'info', duration = 3000) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setToast({ show: true, message, type });
    timeoutRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
      timeoutRef.current = null;
    }, duration);
  }, []);

  const hideToast = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setToast((prev) => ({ ...prev, show: false }));
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toast, showToast, hideToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      toast: { show: false, message: '', type: 'info' },
      showToast: () => {},
      hideToast: () => {}
    };
  }
  return context;
}

