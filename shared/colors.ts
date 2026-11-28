/** Paleta de colors per a categories, etiquetes i persones (funcionen en mode clar i fosc). */
export const PALETTE: { hex: string; name: string }[] = [
  { hex: '#a8643a', name: 'Caramel' },
  { hex: '#c2410c', name: 'Taronja' },
  { hex: '#b45309', name: 'Ambre' },
  { hex: '#ca8a04', name: 'Mostassa' },
  { hex: '#4d7c0f', name: 'Oliva' },
  { hex: '#15803d', name: 'Verd' },
  { hex: '#0f766e', name: 'Verd blau' },
  { hex: '#0369a1', name: 'Blau' },
  { hex: '#4338ca', name: 'Indi' },
  { hex: '#7e22ce', name: 'Porpra' },
  { hex: '#be185d', name: 'Rosa' },
  { hex: '#b91c1c', name: 'Vermell' },
  { hex: '#57534e', name: 'Pedra' },
];

export const isColor = (s: unknown): s is string => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);

export const colorAt = (i: number) => PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length].hex;
