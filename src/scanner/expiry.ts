export interface ExpiryCaptureResult {
  expiryDate?: string;
  rawText?: string;
}

/** Camera + Tesseract OCR — works in Chromium, Safari, and Firefox. */
export function isExpiryOcrSupported(): boolean {
  return !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
}

export async function captureAndReadExpiryDate(): Promise<ExpiryCaptureResult> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 } },
    audio: false,
  });

  try {
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    await video.play();

    // Brief settle so autofocus / exposure can stabilize before the OCR frame.
    await new Promise<void>(r => setTimeout(r, 400));

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return {};
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const text = await recognizeWithTesseract(canvas);
    return { expiryDate: extractExpiryDate(text), rawText: text };
  } finally {
    stream.getTracks().forEach(t => t.stop());
  }
}

async function recognizeWithTesseract(canvas: HTMLCanvasElement): Promise<string> {
  // Lazy-load — Tesseract + wasm + traineddata are heavy; only pull on scan.
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  try {
    const { data } = await worker.recognize(canvas);
    return data.text || '';
  } finally {
    await worker.terminate();
  }
}

function extractExpiryDate(input: string): string | undefined {
  const compact = input
    .replace(/\s+/g, ' ')
    .replace(/best before|use by|exp(?:iry|ires)?|bb|mhd/gi, ' ')
    .trim();

  const ymd = compact.match(/\b(20\d{2})[\/\-\.](0?[1-9]|1[0-2])[\/\-\.](0?[1-9]|[12]\d|3[01])\b/);
  if (ymd) return `${ymd[1] ?? ''}-${pad(ymd[2] ?? '')}-${pad(ymd[3] ?? '')}`;

  const dmy = compact.match(/\b(0?[1-9]|[12]\d|3[01])[\/\-\.](0?[1-9]|1[0-2])[\/\-\.](20\d{2})\b/);
  if (dmy) return `${dmy[3] ?? ''}-${pad(dmy[2] ?? '')}-${pad(dmy[1] ?? '')}`;

  // Compact YYYYMMDD
  const ymdCompact = compact.match(/\b(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/);
  if (ymdCompact) {
    return `${ymdCompact[1]}-${ymdCompact[2]}-${ymdCompact[3]}`;
  }

  // Compact DDMMYYYY
  const dmyCompact = compact.match(/\b(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(20\d{2})\b/);
  if (dmyCompact) {
    return `${dmyCompact[3]}-${dmyCompact[2]}-${dmyCompact[1]}`;
  }

  const mmyy = compact.match(/\b(0?[1-9]|1[0-2])[\/\-](\d{2})\b/);
  if (mmyy) return `20${mmyy[2] ?? ''}-${pad(mmyy[1] ?? '')}-01`;

  return undefined;
}

function pad(value: string): string {
  return value.padStart(2, '0');
}
