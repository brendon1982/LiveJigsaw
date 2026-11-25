import { readFileSync, writeFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { constants as compression } from 'node:zlib';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { PNG } from 'pngjs';

const padding = 2;
const bytesPerPixel = 4;

function frameRectangle(element, image) {
  const name = element.getAttribute('name');
  const read = (key) => {
    const value = element.getAttribute(key);
    if (!/^\d+$/.test(value ?? '')) throw new Error(`Invalid ${key} for atlas frame ${name}`);
    return Number(value);
  };
  const x = read('x');
  const y = read('y');
  const width = read('width');
  const height = read('height');
  if (!width || !height || x + width > image.width || y + height > image.height) {
    throw new Error(`Atlas frame ${name} is outside the image or has no area`);
  }
  return { element, x, y, width, height };
}

function packFrames(frames) {
  const area = frames.reduce((sum, { width, height }) => sum + (width + 2 * padding) * (height + 2 * padding), 0);
  const rowWidth = Math.max(Math.ceil(Math.sqrt(area)), ...frames.map(({ width }) => width + 2 * padding));
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  let width = 0;
  for (const frame of [...frames].sort((a, b) => b.height - a.height)) {
    const paddedWidth = frame.width + 2 * padding;
    if (x + paddedWidth > rowWidth) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    frame.outputX = x + padding;
    frame.outputY = y + padding;
    x += paddedWidth;
    rowHeight = Math.max(rowHeight, frame.height + 2 * padding);
    width = Math.max(width, x);
  }
  return new PNG({ width, height: y + rowHeight });
}

function copyFrame(source, output, { x, y, width, height, outputX, outputY }) {
  for (let row = -padding; row < height + padding; row += 1) {
    const sourceY = y + Math.min(Math.max(row, 0), height - 1);
    for (let column = -padding; column < width + padding; column += 1) {
      const sourceX = x + Math.min(Math.max(column, 0), width - 1);
      const from = (sourceY * source.width + sourceX) * bytesPerPixel;
      const to = ((outputY + row) * output.width + outputX + column) * bytesPerPixel;
      source.data.copy(output.data, to, from, from + bytesPerPixel);
    }
  }
}

export function prepareAtlas(png, xml, outputImageName) {
  const source = PNG.sync.read(png);
  const document = new DOMParser({
    onError(level, message) {
      throw new Error(`Invalid atlas XML (${level}). ${message}`);
    },
  }).parseFromString(xml, 'application/xml');
  const atlas = document.documentElement;
  if (atlas?.tagName !== 'TextureAtlas') throw new Error('Expected a TextureAtlas XML document');
  const frames = Array.from(atlas.getElementsByTagName('SubTexture'), (element) => frameRectangle(element, source));
  if (!frames.length) throw new Error('The atlas has no SubTexture frames');

  const output = packFrames(frames);
  output.gamma = source.gamma;
  for (const frame of frames) {
    copyFrame(source, output, frame);
    frame.element.setAttribute('x', String(frame.outputX));
    frame.element.setAttribute('y', String(frame.outputY));
  }
  atlas.setAttribute('imagePath', outputImageName);
  return {
    png: PNG.sync.write(output, { deflateStrategy: compression.Z_DEFAULT_STRATEGY }),
    xml: new XMLSerializer().serializeToString(document),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [inputPng, inputXml, outputXml, extra] = process.argv.slice(2);
    if (!inputPng || !inputXml || !outputXml || extname(outputXml).toLowerCase() !== '.xml' || extra) {
      throw new Error('Usage: pnpm atlas:prepare <input.png> <input.xml> <output.xml>');
    }
    const outputPng = outputXml.slice(0, -4) + '.png';
    const atlas = prepareAtlas(readFileSync(inputPng), readFileSync(inputXml, 'utf8'), basename(outputPng));
    writeFileSync(outputPng, atlas.png);
    writeFileSync(outputXml, atlas.xml);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
