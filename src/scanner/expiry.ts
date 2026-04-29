export interface ExpiryCaptureResult {
  expiryDate?: string;
  rawText?: string;
}

interface TextDetectorResult {
  rawValue: string;
}

declare class TextDetector {
  detect(image: ImageBitmapSource): Promise<TextDetectorResult[]>;
}

export function isExpiryOcrSupported(): boolean {
  return 'TextDetector' in window;
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

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return {};
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (!isExpiryOcrSupported()) return {};
    const detector = new TextDetector();
    const detections = await detector.detect(canvas);
    const text = detections.map(d => d.rawValue).join(' ');
    return { expiryDate: extractExpiryDate(text), rawText: text };
  } finally {
    stream.getTracks().forEach(t => t.stop());
  }
}

function extractExpiryDate(input: string): string | undefined {
  const compact = input
    .replace(/\s+/g, ' ')
    .replace(/best before|use by|exp|expiry|expires/gi, ' ')
    .trim();

  const ymd = compact.match(/\b(20\d{2})[\/\-\.](0?[1-9]|1[0-2])[\/\-\.](0?[1-9]|[12]\d|3[01])\b/);
  if (ymd) return `${ymd[1] ?? ''}-${pad(ymd[2] ?? '')}-${pad(ymd[3] ?? '')}`;

  const dmy = compact.match(/\b(0?[1-9]|[12]\d|3[01])[\/\-\.](0?[1-9]|1[0-2])[\/\-\.](20\d{2})\b/);
  if (dmy) return `${dmy[3] ?? ''}-${pad(dmy[2] ?? '')}-${pad(dmy[1] ?? '')}`;

  const mmyy = compact.match(/\b(0?[1-9]|1[0-2])[\/\-](\d{2})\b/);
  if (mmyy) return `20${mmyy[2] ?? ''}-${pad(mmyy[1] ?? '')}-01`;

  return undefined;
}

function pad(value: string): string {
  return value.padStart(2, '0');
}
