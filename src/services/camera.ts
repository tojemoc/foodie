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

export function toggleFlashlight(stream: MediaStream, on: boolean) {
  const track = stream.getVideoTracks()[0];
  if (track && 'applyConstraints' in track) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    track.applyConstraints({ advanced: [{ torch: on } as any] }).catch(() => {});
  }
}
