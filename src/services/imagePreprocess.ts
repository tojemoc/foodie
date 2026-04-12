export function preprocessForOCR(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const contrast = ((gray - 128) * 1.5 + 128);
    const val = contrast > 128 ? 255 : 0;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
  }

  ctx.putImageData(imageData, 0, 0);

  if (canvas.width < 600) {
    const scale = 600 / canvas.width;
    const upscaled = document.createElement('canvas');
    upscaled.width = canvas.width * scale;
    upscaled.height = canvas.height * scale;
    const uctx = upscaled.getContext('2d')!;
    uctx.imageSmoothingEnabled = false;
    uctx.drawImage(canvas, 0, 0, upscaled.width, upscaled.height);
    return upscaled;
  }

  return canvas;
}
