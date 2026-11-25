import type Phaser from 'phaser';
import { gameSave } from '../persistence';

const forest = {
  background: 0x263a36,
  text: '#edf3e9',
  mutedText: '#bacdc1',
  surface: 0x30453f,
  surfacePressed: 0x3c514a,
  border: 0x71897e,
  button: 0x3a514b,
  buttonHover: 0x4b655b,
  buttonPressed: 0x293e38,
  primaryButton: 0xc7e1d1,
  primaryButtonHover: 0xdff1e7,
  primaryButtonPressed: 0xadcdbb,
  primaryButtonText: '#192e28',
  scrollbarTrack: 0x35534b,
  scrollbarThumb: 0x9cb5a7,
  tray: 0x34423e,
  board: 0x202e2a,
  guideOpacity: 0.22,
  filteredGuideOpacity: 0.42,
  dividerLine: 0x52675e,
  dividerGrip: 0x4e665c,
  dividerDots: 0xa8bdb1,
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
    surfacePressed: 0x405269,
    border: 0x829ab6,
    button: 0x405774,
    buttonHover: 0x516b8c,
    buttonPressed: 0x31445f,
    primaryButton: 0xc8def8,
    primaryButtonHover: 0xe2efff,
    primaryButtonPressed: 0xb0cae9,
    primaryButtonText: '#192a3d',
    scrollbarTrack: 0x41556f,
    scrollbarThumb: 0xa8bed8,
    tray: 0x354254,
    board: 0x212c3b,
    guideOpacity: 0.22,
    filteredGuideOpacity: 0.42,
    dividerLine: 0x586c84,
    dividerGrip: 0x576b84,
    dividerDots: 0xaebed1,
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
    surfacePressed: 0x3b3b3b,
    border: 0x737373,
    button: 0x3b3b3b,
    buttonHover: 0x505050,
    buttonPressed: 0x303030,
    primaryButton: 0xd6d6d6,
    primaryButtonHover: 0xebebeb,
    primaryButtonPressed: 0xbfbfbf,
    primaryButtonText: '#212121',
    scrollbarTrack: 0x363636,
    scrollbarThumb: 0xa3a3a3,
    tray: 0x303235,
    board: 0x1b1c1e,
    guideOpacity: 0.24,
    filteredGuideOpacity: 0.44,
    dividerLine: 0x55585d,
    dividerGrip: 0x505358,
    dividerDots: 0xb2b5b9,
    modalBackdrop: 0x101010,
    optionBorder: 0x737373,
    selectedOption: 0x484848,
    optionIcon: 0x858585,
    optionIconOutline: 0xe0e0e0,
  },
} satisfies Record<string, Palette>;

type Theme = keyof typeof themes;
const listeners = new Set<(colors: Palette) => void>();

function readTheme(): Theme {
  const stored = gameSave.settings.theme;
  if (stored && Object.hasOwn(themes, stored)) return stored as Theme;
  return 'Forest';
}

export let activeTheme = readTheme();
export let palette = themes[activeTheme];

export function selectTheme(theme: Theme) {
  if (theme === activeTheme) return;
  activeTheme = theme;
  palette = themes[theme];
  for (const listener of listeners) listener(palette);
  gameSave.updateSettings({ theme });
}

export function onThemeChange(listener: (colors: Palette) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function styleWithTheme(owner: Phaser.GameObjects.GameObject, style: (colors: Palette) => void) {
  style(palette);
  owner.once('destroy', onThemeChange(style));
}
