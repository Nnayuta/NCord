import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

export function QRCodeCanvas({ text, size = 150, darkColor = '#181124', lightColor = '#ffffff' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !text) return;

    QRCode.toCanvas(
      canvasRef.current,
      text,
      {
        width: size,
        margin: 1,
        color: {
          dark: darkColor,
          light: lightColor
        },
        errorCorrectionLevel: 'M'
      },
      (error) => {
        if (error) {
          console.warn('[QRCode] Erro ao renderizar QR code:', error);
        }
      }
    );
  }, [text, size, darkColor, lightColor]);

  if (!text) return null;

  return (
    <div
      className="qrcode-canvas-wrap"
      style={{
        display: 'inline-flex',
        padding: 10,
        background: '#ffffff',
        borderRadius: 16,
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4), 0 0 15px rgba(244, 63, 142, 0.2)'
      }}
    >
      <canvas ref={canvasRef} style={{ width: size, height: size, display: 'block' }} />
    </div>
  );
}
