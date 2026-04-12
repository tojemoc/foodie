import { createWorker, type Worker } from 'tesseract.js';

let worker: Worker | null = null;
let workerInitPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (worker) return worker;
  if (!workerInitPromise) {
    workerInitPromise = createWorker('eng').then(
      (w) => { worker = w; workerInitPromise = null; return w; },
      (err) => { workerInitPromise = null; throw err; },
    );
  }
  return workerInitPromise;
}

export async function recognizeText(canvas: HTMLCanvasElement): Promise<string> {
  const w = await getWorker();
  const dataUrl = canvas.toDataURL('image/png');
  const { data } = await w.recognize(dataUrl);
  return data.text;
}

export async function terminateOCR() {
  if (workerInitPromise) {
    try {
      await workerInitPromise;
    } catch {
      // init failed — nothing to terminate
    }
  }
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}
