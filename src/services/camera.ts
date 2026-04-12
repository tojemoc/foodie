export async function startCamera(
  videoEl: HTMLVideoElement,
  facingMode: 'user' | 'environment' = 'environment',
): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode,
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });
  videoEl.srcObject = stream;
  await videoEl.play();
  return stream;
}

export function stopCamera(stream: MediaStream | null) {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
  }
}

export function captureFrame(
  videoEl: HTMLVideoElement,
  roi?: { x: number; y: number; w: number; h: number },
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  if (roi) {
    canvas.width = roi.w;
    canvas.height = roi.h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(videoEl, roi.x, roi.y, roi.w, roi.h, 0, 0, roi.w, roi.h);
  } else {
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(videoEl, 0, 0);
  }
  return canvas;
}

export async function toggleFlashlight(stream: MediaStream, on: boolean): Promise<boolean> {
  const track = stream.getVideoTracks()[0];
  if (!track) return false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const capabilities = track.getCapabilities?.() as any;
  if (!capabilities?.torch) return false;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await track.applyConstraints({ advanced: [{ torch: on } as any] });
    return true;
  } catch {
    return false;
  }
}
