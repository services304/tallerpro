import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { startUploadQueue } from './uploadQueue';

declare global {
  interface Window {
    __tallerproMounted?: boolean;
  }
}

// Tema: oscuro por defecto (especificación); se puede cambiar en Mi cuenta.
try {
  const theme = localStorage.getItem('tallerpro.theme') ?? 'dark';
  if (theme !== 'auto') document.documentElement.dataset.theme = theme;
} catch {
  document.documentElement.dataset.theme = 'dark';
}

const root = document.getElementById('root')!;
createRoot(root).render(<App />);
window.__tallerproMounted = true;
startUploadQueue();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('service worker:', e));
  });
}
