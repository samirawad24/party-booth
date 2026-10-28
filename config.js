// Defaults for the booth. Anyone can change the words, style and prompts on
// the Customize screen; those choices ride along in the link (see settings.js).

export const DEFAULTS = {
  title: 'Photo Booth',
  // Empty means today's date.
  sub: '',
  theme: 'neon',
  prompts: true,
};

export const MAX_TITLE = 40;
export const MAX_SUB = 48;

export const PALETTE = {
  white: '#FFFFFF',
  cream: '#F3ECDD',
  creamDeep: '#E6DCC6',
  sage: '#C9D2BD',
  sageDeep: '#8A9B7E',
  green: '#3E5541',
  greenDeep: '#2C4033',
  ink: '#2E3A2D',
  gold: '#B39558',
};

// Sizes are print pixels at 400 dpi: the strip is 2x6 in, the grids are 4x6 in.
// Each cell's aspect sets the viewfinder shape for that layout.
export const LAYOUTS = {
  strip: { label: 'Classic strip', detail: '3 photos', cols: 1, rows: 3, W: 800, H: 2400, pad: 56, gap: 24, aspect: 6 / 5 },
  four: { label: 'Grid of four', detail: '4 photos', cols: 2, rows: 2, W: 1600, H: 2400, pad: 80, gap: 28, aspect: 4 / 5 },
  six: { label: 'Grid of six', detail: '6 photos', cols: 2, rows: 3, W: 1600, H: 2400, pad: 80, gap: 28, aspect: 5 / 4 },
  // One moving shot that plays forward and back, saved as a GIF. Photo GIFs
  // of the other layouts use this frame too.
  boom: { label: 'Boomerang', detail: 'Moving GIF', cols: 1, rows: 1, W: 800, H: 1180, pad: 56, gap: 24, aspect: 4 / 5, moving: true },
};
export const LAYOUT_ORDER = ['strip', 'four', 'six', 'boom'];

// Boomerang: frames grabbed in a burst, then played forward and back.
export const BURST_FRAMES = 12;
export const BURST_MS = 80;
export const BOOM_FRAME_MS = 70;
// GIF size as a share of print size. Bigger looks nicer but takes longer to
// build on a phone and to send.
export const GIF_SCALE = 0.6;
// Each photo's time on screen in a photo GIF.
export const FLIP_MS = 650;

export const THEME_ORDER = ['neon', 'comic', 'retro', 'confetti', 'film', 'classic', 'cream', 'sage'];
export const THEME_NAMES = {
  neon: 'Neon Night',
  comic: 'Comic Pop',
  retro: 'Retro 70s',
  confetti: 'Confetti',
  film: 'Film Strip',
  classic: 'Classic White',
  cream: 'Cream & Gold',
  sage: 'Sage Garden',
};

// Filter settings feed the shader in filters.js. Neutral values:
// exposure 0, contrast 1, sat 1, warmth 0, tint 0, fade 0, mono 0, tone white,
// vignette 0, grain 0, glow 0, shadows/highlights [0,0,0].
export const FILTERS = {
  natural: { name: 'Natural', contrast: 1.02 },
  bw: { name: 'Black & White', mono: 1, contrast: 1.18, exposure: 0.04, grain: 0.035, vignette: 0.18 },
  film: {
    name: 'Film', contrast: 1.06, sat: 0.88, warmth: 0.035, fade: 0.035, grain: 0.045, vignette: 0.12,
    shadows: [-0.01, 0.012, 0.02], highlights: [0.025, 0.012, -0.015],
  },
  vintage: {
    name: 'Vintage', contrast: 0.9, sat: 0.7, warmth: 0.07, fade: 0.1, grain: 0.05, vignette: 0.32,
    highlights: [0.03, 0.02, -0.02], shadows: [0.02, 0.0, -0.01],
  },
  warm: { name: 'Golden', exposure: 0.05, warmth: 0.09, sat: 1.05, contrast: 1.03 },
  glow: { name: 'Soft Glow', glow: 0.42, exposure: 0.06, contrast: 0.94, sat: 0.94, warmth: 0.02, fade: 0.02 },
  sepia: { name: 'Sepia', mono: 1, tone: [1.08, 0.95, 0.76], contrast: 1.04, fade: 0.05, grain: 0.03, vignette: 0.26 },
  pop: { name: 'Bright', exposure: 0.04, sat: 1.28, contrast: 1.12 },
};
export const FILTER_ORDER = ['natural', 'bw', 'film', 'vintage', 'warm', 'glow', 'sepia', 'pop'];

// One of these shows before each photo when silly prompts are on.
export const PROMPTS = [
  'Worst model face',
  'Act surprised',
  'Everyone point at someone',
  'Your best villain look',
  'Pretend you just won',
  'Fake laugh, loud',
  'Blue Steel',
  'Squad pose',
  'Look over your shoulder',
  'Most dramatic face',
  'Hug the nearest person',
  'Act like it is 1985',
  'Pretend it is raining',
  'Jazz hands',
  'Sleepy face',
  'Bunny ears on someone',
  'Album cover pose',
  'Look extremely serious',
  'Blow a kiss',
  'Freak out',
  'Thumbs up, big smile',
  'Act like you are famous',
  'Stare at the ceiling',
  'Prom photo pose',
  'Show us your muscles',
  'Awkward family photo',
  'Pretend you are on a roller coaster',
  'Whisper a secret',
];

export const COUNTDOWN = 3;

// Online photo service (worker/ folder) behind the QR codes. Empty hides them.
export const API_URL = 'https://party-booth.photobooth-worker.workers.dev';
