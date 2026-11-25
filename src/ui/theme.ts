import type Phaser from 'phaser';

const forest = {
  background: 0x263a36,
  text: '#edf3e9',
  mutedText: '#bacdc1',
  surface: 0x30453f,
  border: 0x71897e,
  button: 0x3a514b,
  buttonHover: 0x4b655b,
  primaryButton: 0xc7e1d1,
  primaryButtonHover: 0xdff1e7,
  primaryButtonText: '#192e28',
  scrollbarTrack: 0x35534b,
  scrollbarThumb: 0x9cb5a7,
  tray: 0x304841,
  board: 0x192e28,
  dividerGrip: 0x607b70,
  dividerDots: 0xdce9e0,
  modalBackdrop: 0x142521,
  optionBorder: 0x69847a,
  selectedOption: 0x4b6c5e,
  optionIcon: 0x65877a,
  optionIconOutline: 0xdfede3,
};

type Palette = typeof forest;

export const themes = {
  Forest: forest,
  Slate: {
    background: 0x273344,
    text: '#eff4fb',
    mutedText: '#c3d1e2',
    surface: 0x34455b,
    border: 0x829ab6,
    button: 0x405774,
    buttonHover: 0x516b8c,
    primaryButton: 0xc8def8,
    primaryButtonHover: 0xe2efff,
    primaryButtonText: '#192a3d',
    scrollbarTrack: 0x41556f,
    scrollbarThumb: 0xa8bed8,
    tray: 0x354963,
    board: 0x1f2d40,
    dividerGrip: 0x6b86a7,
    dividerDots: 0xe1edfb,
    modalBackdrop: 0x141c29,
    optionBorder: 0x7992ae,
    selectedOption: 0x4c6687,
    optionIcon: 0x7893b2,
    optionIconOutline: 0xe3eefc,
  },
  Dark: {
    background: 0x212121,
    text: '#f2f2f2',
    mutedText: '#bdbdbd',
    surface: 0x2d2d2d,
    border: 0x737373,
    button: 0x3b3b3b,
    buttonHover: 0x505050,
    primaryButton: 0xd6d6d6,
    primaryButtonHover: 0xebebeb,
    primaryButtonText: '#212121',
    scrollbarTrack: 0x363636,
    scrollbarThumb: 0xa3a3a3,
    tray: 0x303030,
    board: 0x181818,
    dividerGrip: 0x626262,
    dividerDots: 0xe0e0e0,
    modalBackdrop: 0x101010,
    optionBorder: 0x737373,
    selectedOption: 0x484848,
    optionIcon: 0x858585,
    optionIconOutline: 0xe0e0e0,
  },
} satisfies Record<string, Palette>;

type Theme = keyof typeof themes;
const storageKey = 'live-jigsaw.theme';
const listeners = new Set<(colors: Palette) => void>();

function readTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored && Object.hasOwn(themes, stored)) return stored as Theme;
  } catch {
    // Storage can be unavailable in a restricted browser context.
  }
  return 'Forest';
}

export let activeTheme = readTheme();
export let palette = themes[activeTheme];

export function selectTheme(theme: Theme) {
  if (theme === activeTheme) return;
  activeTheme = theme;
  palette = themes[theme];
  for (const listener of listeners) listener(palette);
  try {
    window.localStorage.setItem(storageKey, theme);
  } catch {
    // The selected theme still applies for this session.
  }
}

export function onThemeChange(listener: (colors: Palette) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function styleWithTheme(owner: Phaser.GameObjects.GameObject, style: (colors: Palette) => void) {
  style(palette);
  owner.once('destroy', onThemeChange(style));
}
