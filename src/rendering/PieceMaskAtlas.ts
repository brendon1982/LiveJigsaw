import Phaser from 'phaser';
import { Bounds } from '../domain/geometry';
import type { PuzzlePiece } from '../domain/Puzzle';

const borderPadding = 2;
const gutter = 1;
const inset = borderPadding + gutter;

type MaskSlot = { piece: PuzzlePiece; frame: Bounds; x: number; y: number };
type MaskPage = { slots: MaskSlot[]; width: number; height: number };

export type PieceMask = { texture: Phaser.Textures.CanvasTexture; frame: Bounds };

export function borderFrameName(pieceId: string): string {
  return `border-${pieceId}`;
}

function packMasks(pieces: readonly PuzzlePiece[], limit: number): MaskPage[] {
  const masks = pieces.map((piece) => {
    const bounds = piece.outline.frame;
    const x = Math.floor(bounds.x);
    const y = Math.floor(bounds.y);
    const right = Math.ceil(bounds.x + bounds.width);
    const bottom = Math.ceil(bounds.y + bounds.height);
    const frame = new Bounds(x, y, right - x, bottom - y);
    return { piece, frame, width: frame.width + 2 * inset, height: frame.height + 2 * inset };
  }).sort((a, b) => b.height - a.height);
  const area = masks.reduce((total, { width, height }) => total + width * height, 0);
  const shelfWidth = Math.min(limit, Math.max(Math.ceil(Math.sqrt(area) * 1.15), ...masks.map(({ width }) => width)));
  const pages: MaskPage[] = [];
  let page: MaskPage | undefined;
  let x = 0;
  let y = 0;
  let shelfHeight = 0;
  for (const { piece, frame, width, height } of masks) {
    if (width > limit || height > limit) throw new RangeError('A piece exceeds the mask atlas page size');
    if (x + width > shelfWidth) {
      y += shelfHeight;
      x = shelfHeight = 0;
    }
    if (!page || y + height > limit) {
      page = { slots: [], width: 0, height: 0 };
      pages.push(page);
      x = y = shelfHeight = 0;
    }
    page.slots.push({ piece, frame, x: x + inset, y: y + inset });
    shelfHeight = Math.max(shelfHeight, height);
    x += width;
    page.width = Math.max(page.width, x);
    page.height = y + shelfHeight;
  }
  return pages;
}

function drawMask(context: CanvasRenderingContext2D, { piece, frame, x, y }: MaskSlot) {
  const path = new Path2D();
  const [first, ...rest] = piece.outline.points;
  const dx = x - frame.x;
  const dy = y - frame.y;
  path.moveTo(first.x + dx, first.y + dy);
  for (const point of rest) path.lineTo(point.x + dx, point.y + dy);
  path.closePath();

  // Add into independent coverage channels over opaque black: red for fill, green for stroke.
  context.fill(path);
  context.stroke(path);
}

export class PieceMaskAtlas {
  readonly masks = new Map<string, PieceMask>();
  private readonly textures: Phaser.Textures.CanvasTexture[] = [];

  constructor(scene: Phaser.Scene, pieces: readonly PuzzlePiece[]) {
    const { gl } = scene.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    const pages = packMasks(pieces, Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE)));
    for (const [index, page] of pages.entries()) {
      const texture = scene.textures.createCanvas(`live-puzzle-piece-atlas-${index}`, page.width, page.height);
      if (!texture) throw new Error('Could not create the piece mask atlas');
      this.textures.push(texture);
      const { context } = texture;
      context.fillStyle = '#000';
      context.fillRect(0, 0, page.width, page.height);
      context.globalCompositeOperation = 'lighter';
      context.fillStyle = '#f00';
      context.strokeStyle = '#0f0';
      context.lineJoin = 'round';
      context.lineWidth = 1;
      for (const slot of page.slots) {
        const { piece, frame, x, y } = slot;
        drawMask(context, slot);
        texture.add(piece.id, 0, x, y, frame.width, frame.height);
        texture.add(borderFrameName(piece.id), 0, x - borderPadding, y - borderPadding,
          frame.width + 2 * borderPadding, frame.height + 2 * borderPadding);
        this.masks.set(piece.id, { texture, frame });
      }
      texture.refresh();
      texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      texture.setWrap(Phaser.Textures.WrapMode.CLAMP_TO_EDGE);
    }
  }

  destroy() {
    for (const texture of this.textures) texture.manager.remove(texture);
    this.textures.length = 0;
    this.masks.clear();
  }
}