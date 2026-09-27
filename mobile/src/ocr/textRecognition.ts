import * as ImageManipulator from 'expo-image-manipulator';
import { bestExpiryDate, extractDates, type DateExtractionResult } from './dateExtraction';

export interface OcrResult {
  text: string;
  dates: DateExtractionResult[];
  bestDate?: string;
  engine: string;
}

type Recognizer = (uri: string) => Promise<string>;

/**
 * On-device text recognition adapter.
 * Prefers ML Kit when the native module is present (dev / SideStore builds).
 * Falls back so the UI can accept pasted label text / manual entry —
 * never calls a cloud LLM for date OCR.
 */
export async function recognizeTextFromImageUri(uri: string): Promise<OcrResult> {
  const prepared = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1280 } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
  );

  const recognize = await resolveRecognizer();
  const text = recognize ? await recognize(prepared.uri) : '';
  const dates = extractDates(text);
  return {
    text,
    dates,
    bestDate: bestExpiryDate(text),
    engine: text ? 'on-device' : 'none',
  };
}

async function resolveRecognizer(): Promise<Recognizer | null> {
  try {
    // Optional native module — absent in Expo Go / until prebuild + pod install.
    const req = new Function('m', 'return require(m)') as (m: string) => {
      default?: { recognize: (uri: string) => Promise<{ text?: string }> };
      recognize?: (uri: string) => Promise<{ text?: string }>;
    };
    const mlkit = req('@react-native-ml-kit/text-recognition');
    const api = mlkit.default ?? mlkit;
    if (!api?.recognize) return null;
    return async (uri: string) => {
      const result = await api.recognize!(uri);
      return result?.text ?? '';
    };
  } catch {
    return null;
  }
}

/** Pure helper for tests / manual paste of OCR text. */
export function datesFromOcrText(text: string): OcrResult {
  return {
    text,
    dates: extractDates(text),
    bestDate: bestExpiryDate(text),
    engine: 'text-only',
  };
}
