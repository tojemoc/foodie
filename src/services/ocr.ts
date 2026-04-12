import { createWorker, type Worker } from 'tesseract.js';

let worker: Worker | null = null;

async function getWorker(): Promise<Worker> {
  if (!worker) {
    worker = await createWorker('eng');
  }
  return worker;
}

export async function recognizeText(canvas: HTMLCanvasElement): Promise<string> {
  const w = await getWorker();
  const dataUrl = canvas.toDataURL('image/png');
  const { data } = await w.recognize(dataUrl);
  return data.text;
}

export async function terminateOCR() {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}
