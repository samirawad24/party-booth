// Turns a list of same-size canvases into an animated, looping GIF.

import { GIFEncoder, quantize, applyPalette } from './vendor/gifenc.js';

const nextFrame = () => new Promise((r) => setTimeout(r, 0));

// delays: one number for every frame, or one per frame (milliseconds).
export async function makeGif(frames, delays, onProgress) {
  const enc = GIFEncoder();
  const w = frames[0].width, h = frames[0].height;
  for (let i = 0; i < frames.length; i++) {
    const { data } = frames[i].getContext('2d').getImageData(0, 0, w, h);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    enc.writeFrame(index, w, h, { palette, delay: Array.isArray(delays) ? delays[i] : delays });
    onProgress?.((i + 1) / frames.length);
    // Let the page breathe so the button text can update on slow phones.
    await nextFrame();
  }
  enc.finish();
  return new Blob([enc.bytes()], { type: 'image/gif' });
}
