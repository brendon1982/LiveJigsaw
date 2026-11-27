import Phaser from 'phaser';
import type { Bounds } from '../domain/geometry';

const { BatchHandlerQuad, RenderNode } = Phaser.Renderer.WebGL.RenderNodes;
type DrawingContext = Phaser.Renderer.WebGL.DrawingContext;
type NodeManager = Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager;
type TexturerImage = Phaser.Renderer.WebGL.RenderNodes.TexturerImage;
type TransformerImage = Phaser.Renderer.WebGL.RenderNodes.TransformerImage;

const shaderPrecision = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

const vertexSource = `${shaderPrecision}
uniform mat4 uProjectionMatrix;
attribute vec2 inPosition;
attribute vec2 inArtworkUV;
attribute vec2 inMaskUV;
attribute vec4 inColor;
attribute float inMode;
varying vec2 artworkUV;
varying vec2 maskUV;
varying vec4 color;
varying float mode;
void main() {
  gl_Position = uProjectionMatrix * vec4(inPosition, 1.0, 1.0);
  artworkUV = inArtworkUV;
  maskUV = inMaskUV;
  color = inColor;
  mode = inMode;
}
`;

const fragmentSource = `${shaderPrecision}
uniform sampler2D uPieceArtwork;
uniform sampler2D uPieceMaskAtlas;
varying vec2 artworkUV;
varying vec2 maskUV;
varying vec4 color;
varying float mode;
void main() {
  vec2 coverage = texture2D(uPieceMaskAtlas, maskUV).rg;
  if (mode > 1.5) {
    gl_FragColor = vec4(color.rgb, 1.0) * (coverage.g * color.a);
  } else {
    vec4 artwork = texture2D(uPieceArtwork, artworkUV);
    if (mode > 0.5) artwork.rgb = vec3((artwork.r + artwork.g + artwork.b) / 3.0);
    gl_FragColor = artwork * (coverage.r * color.a);
  }
}
`;

// Phaser's quad strip visits bottom left, top left, bottom right, top right.
const stripCorners = [
  { position: 2, right: false, bottom: true, alpha: 'alphaBottomLeft' },
  { position: 0, right: false, bottom: false, alpha: 'alphaTopLeft' },
  { position: 4, right: true, bottom: true, alpha: 'alphaBottomRight' },
  { position: 6, right: true, bottom: false, alpha: 'alphaTopRight' },
] as const;

class PieceBatch extends BatchHandlerQuad {
  constructor(manager: NodeManager) {
    super(manager, {
      name: 'LivePuzzlePieceBatch',
      shaderName: 'LIVE_PUZZLE_PIECES',
      vertexSource,
      fragmentSource,
      shaderAdditions: [],
      vertexBufferLayout: {
        usage: 'DYNAMIC_DRAW',
        layout: [
          { name: 'inPosition', size: 2 },
          { name: 'inArtworkUV', size: 2 },
          { name: 'inMaskUV', size: 2 },
          { name: 'inColor', size: 4 },
          { name: 'inMode', size: 1 },
        ],
      },
    });
    this.programManager.setUniform('uPieceArtwork', 0);
    this.programManager.setUniform('uPieceMaskAtlas', 1);
  }

  submit(context: DrawingContext, image: BatchedPieceImage, quad: Float32Array) {
    const artwork = image.artwork.source[0].glTexture;
    const mask = image.frame.source.glTexture;
    if (!artwork || !mask) return;
    if (this.manager.currentBatchNode === this && this.manager.currentBatchDrawingContext !== context) {
      this.manager.finishBatch();
    }
    this.manager.setCurrentBatchNode(this, context);

    let entry = this.currentBatchEntry;
    if (entry.texture[0] !== artwork || entry.texture[1] !== mask) {
      this.pushCurrentBatchEntry();
      entry = this.currentBatchEntry;
      entry.texture[0] = artwork;
      entry.texture[1] = mask;
      entry.unit = 2;
    }

    this.writeQuad(image, quad);
    entry.count++;
    this.instanceCount++;
    if (this.instanceCount === this.instancesPerBatch) this.run(context);
  }

  private writeQuad(image: BatchedPieceImage, quad: Float32Array) {
    const buffer = this.vertexBufferLayout.buffer.viewF32!;
    const { u0, v0, u1, v1 } = image.frame;
    const [left, top, right, bottom] = image.artworkUV;
    const tint = image.tint;
    const red = ((tint >> 16) & 0xff) / 255;
    const green = ((tint >> 8) & 0xff) / 255;
    const blue = (tint & 0xff) / 255;
    const mode = image.outlineOnly ? 2 : Number(image.grayscale);
    let offset = this.instanceCount * this.floatsPerInstance;

    for (const { position, right: rightSide, bottom: bottomSide, alpha } of stripCorners) {
      buffer[offset++] = quad[position];
      buffer[offset++] = quad[position + 1];
      buffer[offset++] = rightSide ? right : left;
      buffer[offset++] = bottomSide ? bottom : top;
      buffer[offset++] = rightSide ? u1 : u0;
      buffer[offset++] = bottomSide ? v1 : v0;
      buffer[offset++] = red;
      buffer[offset++] = green;
      buffer[offset++] = blue;
      buffer[offset++] = image[alpha];
      buffer[offset++] = mode;
    }
  }
}

class PieceSubmitter extends RenderNode {
  static readonly nodeName = 'LivePuzzlePieceSubmitter';
  private readonly batch: PieceBatch;

  constructor(manager: NodeManager) {
    super(PieceSubmitter.nodeName, manager);
    this.batch = new PieceBatch(manager);
    manager.addNode(this.batch.name, this.batch);
  }

  run(context: DrawingContext, image: BatchedPieceImage,
    parent: Phaser.GameObjects.Components.TransformMatrix | undefined, _element: number,
    texturer: TexturerImage, transformer: TransformerImage,
  ) {
    this.onRunBegin(context);
    texturer.run(context, image);
    transformer.run(context, image, texturer, parent);
    this.batch.submit(context, image, transformer.quad);
    this.onRunEnd(context);
  }
}

export class BatchedPieceImage extends Phaser.GameObjects.Image {
  readonly artworkUV: readonly [number, number, number, number];
  grayscale = false;

  constructor(scene: Phaser.Scene, mask: Phaser.Textures.Texture, frame: string,
    readonly artwork: Phaser.Textures.DynamicTexture, source: Bounds, readonly outlineOnly = false,
  ) {
    super(scene, 0, 0, mask, frame);
    // The framebuffer artwork has a bottom-left origin; the canvas atlas has a top-left origin.
    this.artworkUV = [source.x / artwork.width, 1 - source.y / artwork.height,
      (source.x + source.width) / artwork.width, 1 - (source.y + source.height) / artwork.height];
    const { renderNodes } = scene.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    const nodeName = PieceSubmitter.nodeName;
    if (!renderNodes.hasNode(nodeName)) renderNodes.addNodeConstructor(nodeName, PieceSubmitter);
    this.setRenderNodeRole('Submitter', nodeName);
    scene.add.existing(this);
  }
}