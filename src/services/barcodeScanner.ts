import {
  BrowserMultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  HTMLCanvasElementLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
} from '@zxing/library';

let reader: BrowserMultiFormatReader | null = null;

function getReader(): BrowserMultiFormatReader {
  if (!reader) {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
    ]);
    reader = new BrowserMultiFormatReader(hints);
  }
  return reader;
}

export function decodeBarcodeFromCanvas(canvas: HTMLCanvasElement): string | null {
  try {
    const luminanceSource = new HTMLCanvasElementLuminanceSource(canvas);
    const bitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));
    const r = getReader();
    const result = r.decodeBitmap(bitmap);
    return result.getText();
  } catch {
    return null;
  }
}

export async function decodeBarcodeFromVideo(videoEl: HTMLVideoElement): Promise<string | null> {
  const canvas = document.createElement('canvas');
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(videoEl, 0, 0);
  return decodeBarcodeFromCanvas(canvas);
}
