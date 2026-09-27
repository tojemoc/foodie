import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Button, SectionTitle } from '../../src/components/Button';
import { addItem, makeItem } from '../../src/items/store';
import { pushToRemote } from '../../src/items/sync';
import { DEFAULT_PLACEMENTS } from '../../src/items/types';
import { datesFromOcrText, recognizeTextFromImageUri } from '../../src/ocr/textRecognition';
import type { DateExtractionResult } from '../../src/ocr/dateExtraction';
import { lookupBarcode, rememberProduct } from '../../src/products/lookup';
import {
  addDaysIso,
  averageColor,
  recognizeProduce,
  rememberProduceCorrection,
  colorFingerprint,
  type ProduceMatch,
  type RgbPixel,
} from '../../src/produce/recognize';
import { colors, spacing } from '../../src/theme/colors';

type Step = 'choose' | 'barcode' | 'produce' | 'product' | 'expiry-cam' | 'expiry' | 'placement' | 'review';

export default function AddItemScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const scanningLock = useRef(false);

  const [step, setStep] = useState<Step>('choose');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const [ean, setEan] = useState('');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [emoji, setEmoji] = useState('🍽️');
  const [category, setCategory] = useState('grocery');
  const [lookupSource, setLookupSource] = useState('');
  const [source, setSource] = useState<'barcode' | 'produce' | 'manual'>('manual');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('pc');
  const [expiryDate, setExpiryDate] = useState('');
  const [dateCandidates, setDateCandidates] = useState<DateExtractionResult[]>([]);
  const [ocrRaw, setOcrRaw] = useState('');
  const [placement, setPlacement] = useState('fridge');
  const [produceMatches, setProduceMatches] = useState<ProduceMatch[]>([]);
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [colorFp, setColorFp] = useState<string | undefined>();
  const [selectedProduceId, setSelectedProduceId] = useState<string | undefined>();

  const reset = useCallback(() => {
    scanningLock.current = false;
    setStep('choose');
    setEan('');
    setName('');
    setBrand('');
    setEmoji('🍽️');
    setCategory('grocery');
    setLookupSource('');
    setSource('manual');
    setQuantity('1');
    setUnit('pc');
    setExpiryDate('');
    setDateCandidates([]);
    setOcrRaw('');
    setPlacement('fridge');
    setProduceMatches([]);
    setPhotoUri(undefined);
    setColorFp(undefined);
    setSelectedProduceId(undefined);
    setStatusMsg('');
  }, []);

  const ensureCamera = useCallback(async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      return res.granted;
    }
    return true;
  }, [permission, requestPermission]);

  const onBarcode = useCallback(
    async (result: BarcodeScanningResult) => {
      if (scanningLock.current || step !== 'barcode') return;
      const code = result.data?.trim();
      if (!code) return;
      scanningLock.current = true;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEan(code);
      setSource('barcode');
      setLoading(true);
      setStatusMsg('Looking up product…');
      try {
        const product = await lookupBarcode(code).catch(() => null);
        if (product) {
          setName(product.name);
          setBrand(product.brand ?? '');
          setCategory(product.category ?? 'grocery');
          setLookupSource(product.source);
          setPhotoUri(product.imageUrl);
        }
      } finally {
        setLoading(false);
        setStatusMsg('');
        setStep('product');
      }
    },
    [step],
  );

  const captureForProduce = useCallback(async () => {
    if (!cameraRef.current) return;
    setLoading(true);
    setStatusMsg('Recognizing produce on-device…');
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        skipProcessing: true,
      });
      if (!photo?.uri) throw new Error('No photo');
      setPhotoUri(photo.uri);

      const tiny = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 32 } }],
        { base64: true, format: ImageManipulator.SaveFormat.JPEG, compress: 0.5 },
      );

      const pixels = decodeJpegPixels(tiny.base64);
      setSource('produce');
      if (pixels) {
        const avg = averageColor(pixels);
        const fp = colorFingerprint(avg);
        setColorFp(fp);
        const matches = await recognizeProduce({ pixels, foregroundRatio: 0.5 });
        setProduceMatches(matches);
        if (matches[0]) applyProduceMatch(matches[0]);
      } else {
        // No reliable RGB decode — skip colour matching / correction fingerprint.
        setColorFp(undefined);
        setProduceMatches([]);
        setStatusMsg('Colour match unavailable — pick or type the produce name.');
      }
      setStep('product');
      if (pixels) setStatusMsg('');
    } catch {
      setStatusMsg('Could not analyze photo — enter details manually.');
      setSource('produce');
      setStep('product');
    } finally {
      setLoading(false);
    }
  }, []);

  function applyProduceMatch(m: ProduceMatch) {
    setSelectedProduceId(m.entry.id);
    setName(m.entry.name);
    setEmoji(m.entry.emoji);
    setCategory('produce');
    setQuantity(String(m.quantity));
    setUnit(m.unit);
    setPlacement(m.entry.defaultPlacement);
    setExpiryDate(addDaysIso(m.entry.shelfLifeDays));
    setLookupSource(`produce:${m.reason}`);
  }

  const captureExpiry = useCallback(async () => {
    if (!cameraRef.current) return;
    setLoading(true);
    setStatusMsg('Reading best-before date…');
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: true,
      });
      if (!photo?.uri) throw new Error('No photo');
      const ocr = await recognizeTextFromImageUri(photo.uri);
      setOcrRaw(ocr.text);
      setDateCandidates(ocr.dates);
      if (ocr.bestDate) {
        setExpiryDate(ocr.bestDate);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setStatusMsg('');
      } else if (!ocr.text) {
        setStatusMsg(
          'On-device OCR not linked in this build. Paste label text or type the date.',
        );
      } else {
        setStatusMsg('No confident date found — pick a candidate or type one.');
      }
      setStep('expiry');
    } catch {
      setStatusMsg('Capture failed — enter the date manually.');
      setStep('expiry');
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(async () => {
    if (!name.trim()) return;
    const qty = Number(quantity) || 1;
    const place = DEFAULT_PLACEMENTS.find((p) => p.id === placement);
    const item = makeItem({
      name: name.trim(),
      productName: name.trim(),
      brand: brand.trim() || undefined,
      number: ean,
      format: ean ? 'EAN' : 'NONE',
      category,
      notes: ocrRaw ? `OCR: ${ocrRaw.slice(0, 200)}` : '',
      expiryDate: expiryDate || undefined,
      placement: place?.name ?? placement,
      color: place?.color ?? colors.accent,
      emoji,
      quantity: qty,
      unit,
      imageUri: photoUri,
      source,
      lookupSource: lookupSource || undefined,
    });
    addItem(item);
    if (ean) {
      await rememberProduct(ean, {
        name: name.trim(),
        brand: brand.trim() || undefined,
        source: lookupSource || 'manual',
      });
    }
    if (colorFp && selectedProduceId) {
      await rememberProduceCorrection(colorFp, selectedProduceId);
    }
    void pushToRemote();
    reset();
    router.replace('/');
  }, [
    name, brand, ean, category, ocrRaw, expiryDate, placement, emoji,
    quantity, unit, photoUri, source, lookupSource, colorFp, selectedProduceId,
    reset, router,
  ]);

  const header = useMemo(() => {
    const map: Record<Step, string> = {
      choose: 'How do you want to add?',
      barcode: 'Scan barcode',
      produce: 'Photograph produce',
      product: 'Confirm product',
      'expiry-cam': 'Scan best-before label',
      expiry: 'Best before',
      placement: 'Where does it live?',
      review: 'Review & save',
    };
    return map[step];
  }, [step]);

  const showCamera = step === 'barcode' || step === 'produce' || step === 'expiry-cam';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{header}</Text>
      {!!statusMsg && <Text style={styles.status}>{statusMsg}</Text>}

      {step === 'choose' && (
        <View style={styles.stack}>
          <Button
            title="Scan barcode"
            onPress={async () => {
              if (await ensureCamera()) setStep('barcode');
            }}
          />
          <Button
            title="Photograph produce"
            variant="secondary"
            onPress={async () => {
              if (await ensureCamera()) setStep('produce');
            }}
          />
          <Button
            title="Enter manually"
            variant="ghost"
            onPress={() => {
              setSource('manual');
              setStep('product');
            }}
          />
        </View>
      )}

      {showCamera && (
        <View style={styles.cameraWrap}>
          {!permission?.granted ? (
            <View style={styles.perm}>
              <Text style={styles.muted}>Camera permission is required for scanning.</Text>
              <Button title="Grant camera access" onPress={() => void requestPermission()} />
            </View>
          ) : (
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={
                step === 'barcode'
                  ? { barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }
                  : undefined
              }
              onBarcodeScanned={step === 'barcode' ? onBarcode : undefined}
            />
          )}
          {step === 'produce' && (
            <Button title="Capture produce" onPress={() => void captureForProduce()} loading={loading} />
          )}
          {step === 'barcode' && (
            <Button
              title="Enter code manually"
              variant="ghost"
              onPress={() => {
                scanningLock.current = true;
                setStep('product');
                setSource('barcode');
              }}
            />
          )}
          {step === 'expiry-cam' && (
            <>
              <Button title="Capture date label" onPress={() => void captureExpiry()} loading={loading} />
              <Button title="Type date instead" variant="ghost" onPress={() => setStep('expiry')} />
            </>
          )}
        </View>
      )}

      {step === 'product' && (
        <View style={styles.stack}>
          {!!photoUri && <Image source={{ uri: photoUri }} style={styles.thumb} />}
          {produceMatches.length > 1 && (
            <>
              <SectionTitle>Suggestions</SectionTitle>
              {produceMatches.slice(0, 4).map((m) => (
                <Button
                  key={m.entry.id}
                  title={`${m.entry.emoji} ${m.entry.name} · qty ${m.quantity} (${Math.round(m.confidence * 100)}%)`}
                  variant={selectedProduceId === m.entry.id ? 'primary' : 'secondary'}
                  onPress={() => applyProduceMatch(m)}
                />
              ))}
            </>
          )}
          <SectionTitle>Details</SectionTitle>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Product name" placeholderTextColor={colors.textMuted} />
          <TextInput style={styles.input} value={brand} onChangeText={setBrand} placeholder="Brand (optional)" placeholderTextColor={colors.textMuted} />
          <TextInput style={styles.input} value={ean} onChangeText={setEan} placeholder="Barcode (optional)" placeholderTextColor={colors.textMuted} keyboardType="number-pad" />
          <View style={styles.row}>
            <TextInput style={[styles.input, styles.flex]} value={quantity} onChangeText={setQuantity} placeholder="Qty" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" />
            <TextInput style={[styles.input, styles.flex]} value={unit} onChangeText={setUnit} placeholder="Unit" placeholderTextColor={colors.textMuted} />
          </View>
          {!!lookupSource && <Text style={styles.muted}>Source: {lookupSource}</Text>}
          <Button
            title="Next: expiry"
            onPress={async () => {
              if (await ensureCamera()) setStep('expiry-cam');
              else setStep('expiry');
            }}
            disabled={!name.trim()}
          />
          <Button title="Back" variant="ghost" onPress={reset} />
        </View>
      )}

      {step === 'expiry' && (
        <View style={styles.stack}>
          {dateCandidates.length > 0 && (
            <>
              <SectionTitle>Detected dates</SectionTitle>
              {dateCandidates.slice(0, 5).map((d) => (
                <Button
                  key={`${d.date}-${d.pattern}`}
                  title={`${d.date} · ${d.pattern} (${Math.round(d.confidence * 100)}%)`}
                  variant={expiryDate === d.date ? 'primary' : 'secondary'}
                  onPress={() => setExpiryDate(d.date)}
                />
              ))}
            </>
          )}
          <SectionTitle>Or type / paste</SectionTitle>
          <TextInput style={styles.input} value={expiryDate} onChangeText={setExpiryDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} />
          <TextInput
            style={[styles.input, styles.multiline]}
            value={ocrRaw}
            onChangeText={(t) => {
              setOcrRaw(t);
              const parsed = datesFromOcrText(t);
              setDateCandidates(parsed.dates);
              if (parsed.bestDate) setExpiryDate(parsed.bestDate);
            }}
            placeholder="Paste OCR / label text to extract dates"
            placeholderTextColor={colors.textMuted}
            multiline
          />
          <Button title="Rescan with camera" variant="secondary" onPress={() => setStep('expiry-cam')} />
          <Button title="Next: placement" onPress={() => setStep('placement')} />
          <Button title="Back" variant="ghost" onPress={() => setStep('product')} />
        </View>
      )}

      {step === 'placement' && (
        <View style={styles.stack}>
          {DEFAULT_PLACEMENTS.map((p) => (
            <Button
              key={p.id}
              title={`${p.emoji} ${p.name}`}
              variant={placement === p.id ? 'primary' : 'secondary'}
              onPress={() => setPlacement(p.id)}
            />
          ))}
          <Button title="Review" onPress={() => setStep('review')} />
          <Button title="Back" variant="ghost" onPress={() => setStep('expiry')} />
        </View>
      )}

      {step === 'review' && (
        <View style={styles.stack}>
          <Text style={styles.reviewLine}>
            {emoji} {name} {brand ? `(${brand})` : ''}
          </Text>
          <Text style={styles.muted}>
            {quantity} {unit} · {placement} · {expiryDate || 'no expiry'}
          </Text>
          {!!ean && <Text style={styles.muted}>Barcode {ean}</Text>}
          <Button title="Save item" onPress={() => void save()} loading={loading} />
          <Button title="Back" variant="ghost" onPress={() => setStep('placement')} />
        </View>
      )}
    </ScrollView>
  );
}

/** Decode a tiny JPEG (base64) into RGB samples. Returns null when decode fails. */
function decodeJpegPixels(b64: string | undefined): RgbPixel[] | null {
  if (!b64) return null;
  try {
    // jpeg-js is a pure-JS decoder — works offline without canvas.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const jpeg = require('jpeg-js') as {
      decode: (
        data: Uint8Array,
        opts?: { useTArray?: boolean; formatAsRGBA?: boolean },
      ) => { data: Uint8Array; width: number; height: number };
    };
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
    const { data, width, height } = decoded;
    if (!width || !height || data.length < 4) return null;

    const pixels: RgbPixel[] = [];
    // Sample a centre-weighted grid (skip near-black / near-white as background).
    const step = Math.max(1, Math.floor(Math.min(width, height) / 8));
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const i = (y * width + x) * 4;
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max < 40 || min > 230) continue;
        pixels.push({ r, g, b });
      }
    }
    return pixels.length ? pixels : null;
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 48, gap: spacing.sm },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: spacing.sm },
  status: { color: colors.warning, marginBottom: spacing.sm },
  stack: { gap: spacing.sm },
  cameraWrap: { gap: spacing.sm, marginBottom: spacing.md },
  camera: {
    width: '100%',
    height: 320,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  perm: { gap: spacing.md, padding: spacing.lg },
  input: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  thumb: { width: '100%', height: 160, borderRadius: 12, backgroundColor: colors.bgSoft },
  muted: { color: colors.textMuted, fontSize: 13 },
  reviewLine: { color: colors.text, fontSize: 20, fontWeight: '700' },
});
