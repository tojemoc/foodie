import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../services/db';
import { startCamera, stopCamera, captureFrame, toggleFlashlight } from '../services/camera';
import { preprocessForOCR } from '../services/imagePreprocess';
import { recognizeText } from '../services/ocr';
import { extractDates } from '../services/dateExtraction';
import { decodeBarcodeFromVideo } from '../services/barcodeScanner';
import { lookupProduct } from '../services/productLookup';
import type { Location, DateExtractionResult } from '../types';

type Step = 'barcode' | 'product' | 'expiry-scan' | 'expiry-confirm' | 'location' | 'review';

export default function AddItemPage() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [step, setStep] = useState<Step>('barcode');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [flashOn, setFlashOn] = useState(false);

  const [ean, setEan] = useState('');
  const [productName, setProductName] = useState('');
  const [productImage, setProductImage] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [dateResults, setDateResults] = useState<DateExtractionResult[]>([]);
  const [ocrRaw, setOcrRaw] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<number>(0);
  const [cameraError, setCameraError] = useState('');

  useEffect(() => {
    db.locations.toArray().then((locs) => {
      setLocations(locs);
      if (locs.length > 0) setSelectedLocation(locs[0].id!);
    });
    return () => {
      cleanup();
    };
  }, []);

  function cleanup() {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    stopCamera(streamRef.current);
    streamRef.current = null;
  }

  async function initCamera() {
    setCameraError('');
    if (!videoRef.current) return;
    try {
      cleanup();
      const stream = await startCamera(videoRef.current);
      streamRef.current = stream;
    } catch {
      setCameraError('Could not access camera. Please allow camera permission or enter data manually.');
    }
  }

  // Step: Barcode scanning
  useEffect(() => {
    if (step === 'barcode') {
      initCamera().then(() => {
        if (!videoRef.current) return;
        scanIntervalRef.current = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          const code = await decodeBarcodeFromVideo(videoRef.current);
          if (code) {
            if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
            setEan(code);
            handleBarcodeFound(code);
          }
        }, 500);
      });
    }
    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function handleBarcodeFound(code: string) {
    setLoading(true);
    setLoadingMsg('Looking up product...');
    cleanup();
    const product = await lookupProduct(code);
    setLoading(false);
    if (product) {
      setProductName(product.name);
      if (product.imageUrl) setProductImage(product.imageUrl);
    }
    setStep('product');
  }

  function handleSkipBarcode() {
    cleanup();
    setStep('product');
  }

  function handleProductConfirm() {
    if (!productName.trim()) return;
    setStep('expiry-scan');
  }

  // Step: OCR expiry scan
  useEffect(() => {
    if (step === 'expiry-scan') {
      initCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function handleCaptureExpiry() {
    if (!videoRef.current || videoRef.current.readyState < 2) return;

    setLoading(true);
    setLoadingMsg('Reading expiry date...');

    const vw = videoRef.current.videoWidth;
    const vh = videoRef.current.videoHeight;
    const roi = { x: vw * 0.1, y: vh * 0.35, w: vw * 0.8, h: vh * 0.3 };

    const frame = captureFrame(videoRef.current, roi);
    const processed = preprocessForOCR(frame);
    const text = await recognizeText(processed);

    setOcrRaw(text);
    const dates = extractDates(text);
    setDateResults(dates);

    if (dates.length > 0) {
      const best = dates[0];
      setExpiryDate(formatDateForInput(best.date));
    }

    setLoading(false);
    cleanup();
    setStep('expiry-confirm');
  }

  function handleSkipExpiry() {
    cleanup();
    setStep('expiry-confirm');
  }

  function handleExpiryConfirm() {
    if (!expiryDate) return;
    setStep('location');
  }

  function handleLocationConfirm() {
    if (!selectedLocation) return;
    setStep('review');
  }

  async function handleSave() {
    await db.items.add({
      name: productName,
      ean: ean || undefined,
      expiryDate: new Date(expiryDate),
      locationId: selectedLocation,
      imageUrl: productImage || undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    navigate('/');
  }

  function handleFlash() {
    if (streamRef.current) {
      setFlashOn(!flashOn);
      toggleFlashlight(streamRef.current, !flashOn);
    }
  }

  function formatDateForInput(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  return (
    <div className="page">
      <div className="page-header">
        <button className="back-btn" onClick={() => { cleanup(); navigate('/'); }}>←</button>
        <h1>Add Item</h1>
      </div>

      {loading && (
        <div className="loading-overlay">
          <div className="spinner" />
          <span>{loadingMsg}</span>
        </div>
      )}

      {/* STEP 1: Barcode */}
      {step === 'barcode' && (
        <>
          <p className="section-title">Scan Barcode</p>
          <div className="camera-container">
            <video ref={videoRef} playsInline muted />
            <div className="roi-overlay barcode" />
          </div>
          {cameraError && <div className="status-banner warning">{cameraError}</div>}
          <div className="camera-controls">
            <button className="btn btn-secondary" onClick={handleFlash}>
              {flashOn ? '🔦 Off' : '🔦 Flash'}
            </button>
          </div>
          <button className="btn btn-secondary" onClick={handleSkipBarcode}>
            Skip — Enter manually
          </button>
        </>
      )}

      {/* STEP 2: Product Confirm */}
      {step === 'product' && (
        <>
          <p className="section-title">Product Details</p>
          {productImage && (
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <img src={productImage} alt="product" style={{ width: 100, borderRadius: 8 }} />
            </div>
          )}
          <div className="form-group">
            <label>Product Name</label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g. Greek Yogurt"
            />
          </div>
          {ean && (
            <div className="form-group">
              <label>EAN</label>
              <input type="text" value={ean} readOnly />
            </div>
          )}
          <button className="btn btn-primary" onClick={handleProductConfirm} disabled={!productName.trim()}>
            Next — Scan Expiry Date
          </button>
        </>
      )}

      {/* STEP 3: OCR Expiry Scan */}
      {step === 'expiry-scan' && (
        <>
          <p className="section-title">Scan Expiry Date</p>
          <div className="status-banner info">
            Frame the date inside the box, then tap Capture
          </div>
          <div className="camera-container">
            <video ref={videoRef} playsInline muted />
            <div className="roi-overlay" />
          </div>
          {cameraError && <div className="status-banner warning">{cameraError}</div>}
          <div className="camera-controls">
            <button className="btn btn-primary" onClick={handleCaptureExpiry}>
              📸 Capture
            </button>
            <button className="btn btn-secondary" onClick={handleFlash}>
              {flashOn ? '🔦 Off' : '🔦 Flash'}
            </button>
          </div>
          <button className="btn btn-secondary" onClick={handleSkipExpiry}>
            Skip — Enter manually
          </button>
        </>
      )}

      {/* STEP 4: Confirm Expiry */}
      {step === 'expiry-confirm' && (
        <>
          <p className="section-title">Confirm Expiry Date</p>
          {dateResults.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {dateResults.map((d, i) => (
                <div
                  key={i}
                  className="card"
                  style={{ marginBottom: 8, cursor: 'pointer', border: formatDateForInput(d.date) === expiryDate ? '2px solid var(--primary)' : undefined }}
                  onClick={() => setExpiryDate(formatDateForInput(d.date))}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>{d.date.toLocaleDateString()}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{d.pattern}</span>
                  </div>
                  <div className="confidence-bar">
                    <div
                      className={`fill ${d.confidence >= 0.7 ? 'high' : d.confidence >= 0.4 ? 'medium' : 'low'}`}
                      style={{ width: `${d.confidence * 100}%` }}
                    />
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Matched: "{d.rawText}"
                  </div>
                </div>
              ))}
            </div>
          )}
          {ocrRaw && dateResults.length === 0 && (
            <div className="status-banner warning">
              No dates found in: "{ocrRaw.substring(0, 100)}"
            </div>
          )}
          <div className="form-group">
            <label>Expiry Date</label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={handleExpiryConfirm} disabled={!expiryDate}>
            Next — Choose Location
          </button>
        </>
      )}

      {/* STEP 5: Location */}
      {step === 'location' && (
        <>
          <p className="section-title">Where is it stored?</p>
          <div className="location-grid">
            {locations.map((loc) => (
              <button
                key={loc.id}
                className={`location-option ${selectedLocation === loc.id ? 'selected' : ''}`}
                onClick={() => setSelectedLocation(loc.id!)}
              >
                <span className="loc-icon">{loc.icon}</span>
                {loc.name}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={handleLocationConfirm}>
              Next — Review
            </button>
          </div>
        </>
      )}

      {/* STEP 6: Review */}
      {step === 'review' && (
        <>
          <p className="section-title">Review & Save</p>
          <div className="card" style={{ marginBottom: 16 }}>
            {productImage && (
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <img src={productImage} alt="product" style={{ width: 80, borderRadius: 8 }} />
              </div>
            )}
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Name</span>
              <div style={{ fontWeight: 600 }}>{productName}</div>
            </div>
            {ean && (
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>EAN</span>
                <div>{ean}</div>
              </div>
            )}
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Expiry</span>
              <div>{new Date(expiryDate).toLocaleDateString()}</div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Location</span>
              <div>{locations.find((l) => l.id === selectedLocation)?.icon} {locations.find((l) => l.id === selectedLocation)?.name}</div>
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleSave}>
            ✓ Save Item
          </button>
        </>
      )}
    </div>
  );
}
