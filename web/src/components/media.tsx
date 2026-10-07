import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { IconMic } from './icons';

export interface SignatureHandle {
  toDataUrl(): string | null;
  clear(): void;
}

/** Firma con el dedo. Devuelve un PNG (data URL) o null si está vacía. */
export const SignaturePad = forwardRef<SignatureHandle, { onChange?: (empty: boolean) => void }>(function SignaturePad({ onChange }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const empty = useRef(true);
  const last = useRef<{ x: number; y: number } | null>(null);
  // Guardar el callback en una ref: si cambia en cada render, no debe borrar la firma.
  const changed = useRef(onChange);
  changed.current = onChange;

  const setup = useCallback(() => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#10201e';
    empty.current = true;
    changed.current?.(true);
  }, []);

  useEffect(() => {
    setup();
  }, [setup]);

  useImperativeHandle(ref, () => ({
    toDataUrl: () => (empty.current ? null : canvas.current!.toDataURL('image/png')),
    clear: setup,
  }));

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <canvas
      ref={canvas}
      className="sigpad"
      role="img"
      aria-label="signature"
      onPointerDown={(e) => {
        canvas.current!.setPointerCapture(e.pointerId);
        drawing.current = true;
        last.current = pos(e);
      }}
      onPointerMove={(e) => {
        if (!drawing.current || !last.current) return;
        const p = pos(e);
        const ctx = canvas.current!.getContext('2d')!;
        ctx.beginPath();
        ctx.moveTo(last.current.x, last.current.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        last.current = p;
        if (empty.current) {
          empty.current = false;
          changed.current?.(false);
        }
      }}
      onPointerUp={() => {
        drawing.current = false;
        last.current = null;
      }}
      onPointerCancel={() => {
        drawing.current = false;
      }}
    />
  );
});

const speechLang = { fr: 'fr-CA', en: 'en-CA', es: 'es-419' } as const;

/** Botón de dictado (Chrome en Android y escritorio). No aparece si el navegador no lo permite. */
export function DictateButton({ onText }: { onText: (text: string) => void }) {
  const { t, lang } = useI18n();
  const [on, setOn] = useState(false);
  const rec = useRef<any>(null);
  const SR = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;
  useEffect(() => () => rec.current?.stop(), []);
  if (!SR) return null;
  function toggle() {
    if (on) {
      rec.current?.stop();
      return;
    }
    const r = new SR();
    r.lang = speechLang[lang];
    r.interimResults = false;
    r.continuous = true;
    r.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim());
    };
    r.onend = () => setOn(false);
    r.onerror = () => setOn(false);
    rec.current = r;
    r.start();
    setOn(true);
  }
  return (
    <button type="button" className="btn small" aria-pressed={on} onClick={toggle}>
      <IconMic />
      {on ? t('order.listening') : t('order.dictate')}
    </button>
  );
}
