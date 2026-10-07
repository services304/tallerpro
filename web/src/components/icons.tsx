/** Íconos de trazo, 24×24. Heredan el color del texto. */
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const IconToday = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...P}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 3v3h6V3M9 11h6M9 15h4" /></svg>
);
export const IconAgenda = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...P}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M8 14h2M12 14h2M8 17h2" /></svg>
);
export const IconOrders = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...P}><path d="M3 12l9-9h8v8l-9 9z" /><circle cx="15.5" cy="8.5" r="1.5" /></svg>
);
export const IconClients = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...P}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.6c1.8.7 3 2.6 3.5 5.4" /></svg>
);
export const IconMore = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...P}><path d="M4 6h16M4 12h16M4 18h16" /></svg>
);
export const IconCamera = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...P}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
);
export const IconVideo = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...P}><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3" /></svg>
);
export const IconMic = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...P}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
);
export const IconMap = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...P}><path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z" /><circle cx="12" cy="10" r="2.2" /></svg>
);
export const IconPhone = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...P}><path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z" /></svg>
);
export const IconTruck = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...P}><path d="M2 6h11v10H2zM13 9h4l4 4v3h-8" /><circle cx="6" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></svg>
);
export const IconPlus = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...P}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconEye = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...P}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
);
export const IconLock = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...P}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);
