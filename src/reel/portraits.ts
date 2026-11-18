// The four stock portraits, drawn in code: simple illustrated busts, no photograph and no likeness of anyone (owner S5).
// A portrait is a data URL, so it is same-origin and a canvas that draws it stays untainted. The keys are the ones
// public.stock_looks accepts (checked against the migration in stockLooks.sync.test.ts).
export type PortraitKey = 'p1' | 'p2' | 'p3' | 'p4';
export const PORTRAIT_KEYS: PortraitKey[] = ['p1', 'p2', 'p3', 'p4'];

// Each bust: a shoulder shape (the outfit), a head and a hairstyle, on a 120 x 150 board.
const bust = (skin: string, outfit: string, hair: string) =>
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150">' +
  `<path d="M10 150 C12 112 36 100 60 100 C84 100 108 112 110 150 Z" fill="${outfit}"/>` +
  `<rect x="50" y="86" width="20" height="18" rx="6" fill="${skin}"/>` +
  `<ellipse cx="60" cy="62" rx="26" ry="31" fill="${skin}"/>${hair}` +
  '<circle cx="50" cy="62" r="2.4" fill="#2b2b2b"/><circle cx="70" cy="62" r="2.4" fill="#2b2b2b"/>' +
  '<path d="M52 77 Q60 83 68 77" stroke="#7a3e32" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>';

export const PORTRAITS: Record<PortraitKey, string> = {
  p1: bust('#e8bfa0', '#5a3d5c', '<path d="M32 60 C30 28 50 22 62 22 C82 22 92 40 88 62 C84 46 72 38 60 38 C46 38 36 46 32 60 Z" fill="#8f8f96"/>'),
  p2: bust('#c68b64', '#1f3a5c', '<path d="M34 56 C34 30 48 26 60 26 C74 26 86 32 86 56 C80 42 70 40 60 40 C50 40 40 42 34 56 Z" fill="#2a2420"/>'),
  p3: bust('#f1cfb5', '#3b5a1c', '<path d="M32 66 C26 30 46 20 62 20 C80 20 94 34 88 66 C86 50 76 40 60 40 C46 40 36 50 32 66 Z" fill="#8a5a2c"/><path d="M32 66 C30 84 34 94 38 98 L40 70 Z" fill="#8a5a2c"/>'),
  p4: bust('#a8744f', '#7a4a1a', '<path d="M35 54 C36 32 48 30 60 30 C72 30 84 32 85 54 C78 44 70 42 60 42 C50 42 42 44 35 54 Z" fill="#555"/><path d="M48 84 C52 92 68 92 72 84 C70 96 50 96 48 84 Z" fill="#555"/>'),
};

export const portraitUrl = (key: PortraitKey) => 'data:image/svg+xml;utf8,' + encodeURIComponent(PORTRAITS[key]);

export function portraitImage(key: PortraitKey): HTMLImageElement {
  const img = new Image();
  img.src = portraitUrl(key);
  return img;
}
