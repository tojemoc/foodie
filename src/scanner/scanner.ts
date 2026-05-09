/**
 * Camera barcode scanner: native BarcodeDetector when available (Chrome),
 * ZXing-based fallback for Safari / iOS where BarcodeDetector is missing or unreliable.
 */

export interface ScanResult {
  value:  string;
  format: string;
}

interface BarcodeDetectorOptions {
  formats?: string[];
}
interface DetectedBarcode {
  rawValue:        string;
  format:          string;
  boundingBox:     DOMRectReadOnly;
  cornerPoints:    { x: number; y: number }[];
}
declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorOptions);
  detect(image: ImageBitmapSource): Promise<DetectedBarcode[]>;
  static getSupportedFormats(): Promise<string[]>;
}

/** True when the device can request a camera stream (barcode scan button should appear). */
export function isScanCameraSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/** @deprecated Use isScanCameraSupported — kept for callers that still await a Promise. */
export async function isSupported(): Promise<boolean> {
  return isScanCameraSupported();
}

/**
 * Open the camera overlay and scan.
 * Camera permission is requested before the overlay is shown.
 */
export async function startScan(): Promise<ScanResult> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 } },
      audio: false,
    });
  } catch (err) {
    throw err;
  }

  return new Promise((resolve, reject) => {
    const overlay = buildOverlay();
    document.body.appendChild(overlay);

    let animFrame: number | null          = null;
    let detector:  BarcodeDetector | null = null;
    let zxingStopped = false;
    let done = false;

    function cleanup() {
      done = true;
      if (animFrame !== null) cancelAnimationFrame(animFrame);
      stream.getTracks().forEach(t => t.stop());
      overlay.remove();
    }

    overlay.querySelector<HTMLButtonElement>('#scanner-cancel')!.addEventListener('click', () => {
      zxingStopped = true;
      cleanup();
      reject(new DOMException('Scan cancelled by user', 'AbortError'));
    });

    async function init() {
      const video = overlay.querySelector<HTMLVideoElement>('#scanner-video')!;
      video.srcObject = stream;
      await video.play();

      const tryNative = typeof BarcodeDetector !== 'undefined';
      if (tryNative) {
        try {
          const formats = await BarcodeDetector.getSupportedFormats();
          detector = new BarcodeDetector({ formats });
          scanLoopNative(video, resolve, () => done);
          return;
        } catch {
          detector = null;
        }
      }

      try {
        const result = await scanWithZxing(stream, video, () => done || zxingStopped);
        if (done) return;
        cleanup();
        resolve(result);
      } catch (err) {
        if (done) return;
        cleanup();
        reject(err);
      }
    }

    function scanLoopNative(
      video: HTMLVideoElement,
      onHit: (r: ScanResult) => void,
      isDone: () => boolean,
    ) {
      if (isDone() || !detector) return;

      animFrame = requestAnimationFrame(async () => {
        if (isDone() || !detector) return;

        try {
          const results = await detector.detect(video);
          if (results.length > 0) {
            const hit = results[0]!;
            cleanup();
            onHit({
              value:  hit.rawValue,
              format: normaliseDetectorFormat(hit.format),
            });
            return;
          }
        } catch {
          // Frame decode errors are normal — keep looping
        }

        scanLoopNative(video, onHit, isDone);
      });
    }

    init().catch(err => {
      cleanup();
      reject(err);
    });
  });
}

async function scanWithZxing(
  stream: MediaStream,
  video: HTMLVideoElement,
  isDone: () => boolean,
): Promise<ScanResult> {
  const { BrowserMultiFormatReader, BarcodeFormat } = await import('@zxing/browser');
  const { DecodeHintType } = await import('@zxing/library');

  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.ITF,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.DATA_MATRIX,
  ]);

  const reader = new BrowserMultiFormatReader(hints);

  const mapZxingFormat = (fmt: number): string => {
    switch (fmt) {
      case BarcodeFormat.EAN_13:
        return 'EAN13';
      case BarcodeFormat.EAN_8:
        return 'EAN8';
      case BarcodeFormat.UPC_A:
      case BarcodeFormat.UPC_E:
        return 'UPC';
      case BarcodeFormat.CODE_128:
        return 'CODE128';
      case BarcodeFormat.CODE_39:
        return 'CODE39';
      case BarcodeFormat.ITF:
        return 'ITF14';
      case BarcodeFormat.QR_CODE:
      case BarcodeFormat.DATA_MATRIX:
        return 'QR';
      default:
        return 'CODE128';
    }
  };

  return new Promise((resolve, reject) => {
    reader
      .decodeFromStream(stream, video, (result, _err, controls) => {
        if (isDone()) {
          try {
            controls.stop();
          } catch {
            /* ignore */
          }
          return;
        }
        if (result) {
          try {
            controls.stop();
          } catch {
            /* ignore */
          }
          resolve({
            value:  result.getText(),
            format: mapZxingFormat(result.getBarcodeFormat()),
          });
        }
      })
      .catch(reject);
  });
}

// ── Overlay DOM ────────────────────────────────────────────────────────────────

function buildOverlay(): HTMLElement {
  const el = document.createElement('div');
  el.id = 'scanner-overlay';
  el.innerHTML = `
    <div id="scanner-backdrop"></div>
    <div id="scanner-inner">
      <div id="scanner-header">
        <span>Scan barcode</span>
        <button id="scanner-cancel" aria-label="Cancel">✕</button>
      </div>
      <div id="scanner-viewport">
        <video id="scanner-video" autoplay playsinline muted></video>
        <div id="scanner-guide">
          <div class="corner tl"></div>
          <div class="corner tr"></div>
          <div class="corner bl"></div>
          <div class="corner br"></div>
          <div id="scanner-laser"></div>
        </div>
      </div>
      <p id="scanner-hint">Point the camera at a barcode</p>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #scanner-overlay {
      position: fixed; inset: 0; z-index: 9000;
      display: flex; align-items: flex-end;
      animation: scannerFadeIn 0.2s ease;
    }
    @keyframes scannerFadeIn { from { opacity: 0; } to { opacity: 1; } }

    #scanner-backdrop {
      position: absolute; inset: 0;
      background: rgba(0,0,0,0.85);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
    }

    #scanner-inner {
      position: relative; z-index: 1;
      width: 100%; max-width: 480px; margin: 0 auto;
      background: #13131a;
      border-radius: 20px 20px 0 0;
      padding-bottom: calc(28px + env(safe-area-inset-bottom));
      overflow: hidden;
    }

    #scanner-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 20px 12px;
      font-size: 17px; font-weight: 600; color: #f0f0f5;
    }

    #scanner-cancel {
      width: 32px; height: 32px; border-radius: 50%;
      border: none; background: #1c1c27; color: #7070a0;
      font-size: 15px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      -webkit-tap-highlight-color: transparent;
    }

    #scanner-viewport {
      position: relative; width: 100%;
      aspect-ratio: 1 / 1;
      background: #000; overflow: hidden;
    }

    #scanner-video {
      width: 100%; height: 100%;
      object-fit: cover;
    }

    #scanner-guide {
      position: absolute;
      inset: 15%;
      pointer-events: none;
    }

    .corner {
      position: absolute;
      width: 22px; height: 22px;
      border-color: #7c6dfa;
      border-style: solid;
    }
    .corner.tl { top: 0; left: 0;  border-width: 3px 0 0 3px; border-radius: 4px 0 0 0; }
    .corner.tr { top: 0; right: 0; border-width: 3px 3px 0 0; border-radius: 0 4px 0 0; }
    .corner.bl { bottom: 0; left: 0;  border-width: 0 0 3px 3px; border-radius: 0 0 0 4px; }
    .corner.br { bottom: 0; right: 0; border-width: 0 3px 3px 0; border-radius: 0 0 4px 0; }

    #scanner-laser {
      position: absolute; left: 0; right: 0; top: 50%;
      height: 2px;
      background: linear-gradient(90deg, transparent, #7c6dfa, #fa6d9a, #7c6dfa, transparent);
      animation: laserScan 2s ease-in-out infinite;
      opacity: 0.85;
    }
    @keyframes laserScan {
      0%   { top: 10%; opacity: 0.4; }
      50%  { top: 90%; opacity: 1;   }
      100% { top: 10%; opacity: 0.4; }
    }

    #scanner-hint {
      text-align: center;
      font-size: 13px; color: #7070a0;
      padding: 14px 20px 0;
      margin: 0;
    }
  `;
  el.appendChild(style);
  return el;
}

function normaliseDetectorFormat(raw: string): string {
  const map: Record<string, string> = {
    'ean_13':      'EAN13',
    'ean_8':       'EAN8',
    'upc_a':       'UPC',
    'upc_e':       'UPC',
    'code_128':    'CODE128',
    'code_39':     'CODE39',
    'itf':         'ITF14',
    'qr_code':     'QR',
    'data_matrix': 'QR',
  };
  return map[raw.toLowerCase()] ?? 'CODE128';
}
