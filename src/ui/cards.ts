import type { Card }                    from '../types.js';
import { getCards, addCard, updateCard, removeCard, makeCard, touchCard } from '../cards/store.js';
import { pushToRemote }                from '../cards/sync.js';
import { showToast }                   from './toast.js';
import { isScanCameraSupported, startScan } from '../scanner/scanner.js';
import { lookupBarcode }               from '../services/openfood.js';
import { captureAndReadExpiryDate, isExpiryOcrSupported } from '../scanner/expiry.js';
import { notifyExpiring } from '../notifications/expiry.js';

// ── Constants ─────────────────────────────────────────────────────────────────

export const COLORS = [
  'linear-gradient(135deg,#7c6dfa,#a855f7)',
  'linear-gradient(135deg,#fa6d9a,#f43f5e)',
  'linear-gradient(135deg,#34d399,#059669)',
  'linear-gradient(135deg,#38bdf8,#3b82f6)',
  'linear-gradient(135deg,#fbbf24,#f97316)',
  'linear-gradient(135deg,#6366f1,#4f46e5)',
  'linear-gradient(135deg,#f472b6,#ec4899)',
  'linear-gradient(135deg,#2dd4bf,#14b8a6)',
  'linear-gradient(135deg,#64748b,#475569)',
];

const DEFAULT_PLACEMENTS = ['Fridge', 'Cupboard', 'Freezer', 'Storage room', 'Pantry', 'Fruit bowl', 'Countertop', 'Other'];
const WIZARD_STEPS = 2;

const FRESH_ITEM_TEMPLATES: Record<string, { name: string; brand?: string; placement: string; expiryDays: number }> = {
  banana:         { name: 'Banana', placement: 'Fruit bowl', expiryDays: 4 },
  apple:          { name: 'Apple', placement: 'Fruit bowl', expiryDays: 10 },
  berries:        { name: 'Fresh berries', placement: 'Fridge', expiryDays: 3 },
  'leafy-greens': { name: 'Leafy greens', placement: 'Fridge', expiryDays: 3 },
  tomato:         { name: 'Tomatoes', placement: 'Countertop', expiryDays: 5 },
  bread:          { name: 'Fresh bread', placement: 'Cupboard', expiryDays: 3 },
  pastries:       { name: 'Pastries', placement: 'Cupboard', expiryDays: 2 },
  milk:           { name: 'Milk', placement: 'Fridge', expiryDays: 6 },
  yogurt:         { name: 'Yogurt', placement: 'Fridge', expiryDays: 10 },
  cheese:         { name: 'Soft cheese', placement: 'Fridge', expiryDays: 7 },
  eggs:           { name: 'Eggs', placement: 'Fridge', expiryDays: 21 },
  'fresh-chicken':{ name: 'Fresh chicken', placement: 'Fridge', expiryDays: 2 },
  'fresh-beef':   { name: 'Fresh beef', placement: 'Fridge', expiryDays: 3 },
  'fresh-fish':   { name: 'Fresh fish', placement: 'Fridge', expiryDays: 1 },
  'fresh-herbs':  { name: 'Fresh herbs', placement: 'Fridge', expiryDays: 5 },
};

// ── State ─────────────────────────────────────────────────────────────────────

let currentCardId: string | null = null;
let currentFilter = 'all';
let editMode = false;
let wizardStep = 1;

// ── Card grid ─────────────────────────────────────────────────────────────────

export function renderCards(): void {
  const grid  = document.getElementById('card-grid');
  const count = document.getElementById('cards-count');
  if (!grid) return;
  buildPlacementChips();

  const query = ((document.getElementById('search-input') as HTMLInputElement)?.value ?? '').toLowerCase();
  let filtered = getCards();
  if (currentFilter !== 'all') filtered = filtered.filter(c => getPlacement(c).toLowerCase() === currentFilter);
  if (query) filtered = filtered.filter(c =>
    c.name.toLowerCase().includes(query) || c.number.toLowerCase().includes(query)
  );

  if (count) count.textContent = `${filtered.length} item${filtered.length !== 1 ? 's' : ''}`;

  if (!filtered.length) {
    const allEmpty = getCards().length === 0;
    grid.innerHTML = `
      <div style="grid-column:1/-1">
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="5" width="20" height="14" rx="3"/><line x1="2" y1="10" x2="22" y2="10"/>
          </svg>
          <h3>${allEmpty ? 'No items yet' : 'No matches'}</h3>
          <p>${allEmpty ? 'Tap + to add your first food or grocery item.' : 'Try a different search or category.'}</p>
        </div>
      </div>`;
    return;
  }

  // Clear grid and build cards using DOM construction to prevent XSS
  grid.innerHTML = '';

  for (const c of filtered) {
    const tile = document.createElement('div');
    tile.className = 'card-tile';
    tile.style.background = c.color;
    tile.dataset.cardId = String(c.id);

    const contentDiv = document.createElement('div');

    const iconDiv = document.createElement('div');
    iconDiv.className = 'card-tile-icon';
    iconDiv.textContent = placementEmoji(getPlacement(c));
    contentDiv.appendChild(iconDiv);

    const nameDiv = document.createElement('div');
    nameDiv.className = 'card-tile-name';
    nameDiv.textContent = displayName(c);
    contentDiv.appendChild(nameDiv);

    const expiryDiv = document.createElement('div');
    expiryDiv.className = 'card-tile-meta';
    expiryDiv.textContent = formatTileExpiry(c);
    contentDiv.appendChild(expiryDiv);

    tile.appendChild(contentDiv);

    const pointsDiv = document.createElement('div');
    pointsDiv.className = 'card-tile-points';
    pointsDiv.textContent = getPlacement(c);
    tile.appendChild(pointsDiv);

    tile.addEventListener('click', () => {
      const id = tile.dataset['cardId'];
      if (id) openDetail(id);
    });

    grid.appendChild(tile);
  }
}

export function filterByCategory(el: HTMLElement, cat: string): void {
  currentFilter = cat;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderCards();
}

// ── Detail sheet ──────────────────────────────────────────────────────────────

export function openDetail(id: string): void {
  const card = getCards().find(c => c.id === id);
  if (!card) return;
  currentCardId = id;

  setText('detail-icon',   placementEmoji(getPlacement(card)));
  setText('detail-name',   displayName(card));
  setText('detail-sub',    getPlacement(card));
  setText('detail-points', card.brand ?? '');
  setText('detail-expiry', formatDetailExpiry(card));

  const hdr = document.getElementById('detail-card-header');
  if (hdr) hdr.style.background = card.color;

  openSheet('detail-overlay');

  if ('wakeLock' in navigator) {
    (navigator as Navigator & { wakeLock: { request: (t: string) => Promise<unknown> } })
      .wakeLock.request('screen').catch(() => {});
  }
}

// ── Add / Edit form ───────────────────────────────────────────────────────────

export function openAddSheet(prefill?: Card): void {
  editMode = !!prefill;
  setText('add-sheet-title', editMode ? 'Edit Item' : 'Add Item');
  wizardStep = 1;
  updateWizardUi();

  setValue('f-name',         prefill?.name        ?? prefill?.productName ?? '');
  setValue('f-brand',        prefill?.brand       ?? '');
  setValue('f-number',       prefill?.number      ?? '');
  setValue('f-format',       prefill?.format      ?? 'EAN13');
  setValue('f-expiry',       prefill?.expiryDate  ?? '');

  // Handle placement: preserve custom placements from prefill
  const prefillPlacement = prefill?.placement ?? cap(prefill?.category ?? 'Cupboard');
  const isKnownPlacement = DEFAULT_PLACEMENTS.includes(prefillPlacement);

  if (isKnownPlacement) {
    setValue('f-placement', prefillPlacement);
    setValue('f-placement-custom', '');
  } else {
    // Custom placement: set to a default select value and populate custom field
    setValue('f-placement', 'Other');
    setValue('f-placement-custom', prefillPlacement);
  }

  setValue('f-template', '');

  // Inject scan button next to the number field (only if not already there)
  injectScanButton();
  injectExpiryOcrButton();

  openSheet('add-overlay');
}

function injectScanButton(): void {
  if (document.getElementById('scan-btn')) return; // already present

  if (!isScanCameraSupported()) return;

  const input = document.getElementById('f-number') as HTMLInputElement | null;
  if (!input) return;

  // Wrap input + button in a flex row
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex;gap:8px;align-items:center';

  input.parentNode!.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  const btn = document.createElement('button');
  btn.id = 'scan-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Scan barcode with camera');
  btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/>
    <path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
    <line x1="7" y1="12" x2="7" y2="12.01"/><line x1="12" y1="7" x2="12" y2="17"/>
    <line x1="17" y1="12" x2="17" y2="12.01"/>
  </svg>`;
  btn.style.cssText = [
    'flex-shrink:0',
    'width:46px', 'height:46px',
    'border-radius:10px',
    'border:1px solid rgba(255,255,255,0.07)',
    'background:#1c1c27',
    'color:#7070a0',
    'cursor:pointer',
    'display:flex', 'align-items:center', 'justify-content:center',
    'transition:background 0.15s,color 0.15s',
    '-webkit-tap-highlight-color:transparent',
  ].join(';');

  btn.addEventListener('click', handleScan);
  wrapper.appendChild(btn);
}

async function handleScan(): Promise<void> {
  const btn = document.getElementById('scan-btn') as HTMLButtonElement | null;
  if (btn) { btn.style.color = '#7c6dfa'; btn.disabled = true; }

  try {
    const result = await startScan();

    setValue('f-number', result.value);

    const formatEl = document.getElementById('f-format') as HTMLInputElement | null;
    if (formatEl) formatEl.value = result.format || detectBarcodeFormat(result.value);

    await prefillFromOpenFood(result.value);
    showToast('Barcode scanned ✓');
  } catch (err) {
    if (err instanceof DOMException) {
      if (err.name === 'AbortError') return; // user tapped cancel — silent
      if (err.name === 'NotAllowedError') {
        showToast('Camera permission denied — enable it in browser settings');
        return;
      }
      if (err.name === 'NotFoundError') {
        showToast('No camera found on this device');
        return;
      }
    }
    showToast('Camera unavailable');
  } finally {
    if (btn) { btn.style.color = ''; btn.disabled = false; }
  }
}

async function prefillFromOpenFood(barcode: string): Promise<void> {
  const lookup = await lookupBarcode(barcode);
  if (!lookup) {
    showToast('Scanned. No product match found.');
    return;
  }
  const existingName = getVal('f-name');
  if (!existingName && lookup.productName) {
    setValue('f-name', lookup.productName);
  }
  const existingBrand = getVal('f-brand');
  if (!existingBrand && lookup.brand) {
    setValue('f-brand', lookup.brand);
  }
  showToast('Product details found ✓');
}

async function injectExpiryOcrButton(): Promise<void> {
  if (document.getElementById('scan-expiry-btn')) return;
  if (!isExpiryOcrSupported()) return;
  const input = document.getElementById('f-expiry') as HTMLInputElement | null;
  if (!input) return;
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex;gap:8px;align-items:center';
  input.parentNode!.insertBefore(wrapper, input);
  wrapper.appendChild(input);
  const btn = document.createElement('button');
  btn.id = 'scan-expiry-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Scan expiry date');
  btn.textContent = 'OCR';
  btn.style.cssText = [
    'flex-shrink:0',
    'height:46px',
    'padding:0 14px',
    'border-radius:10px',
    'border:1px solid rgba(255,255,255,0.07)',
    'background:#1c1c27',
    'color:#7070a0',
    'cursor:pointer',
    'font-weight:600',
  ].join(';');
  btn.addEventListener('click', handleExpiryScan);
  wrapper.appendChild(btn);
}

async function handleExpiryScan(): Promise<void> {
  const btn = document.getElementById('scan-expiry-btn') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  try {
    const result = await captureAndReadExpiryDate();
    if (!result.expiryDate) {
      showToast('No date found in image');
      return;
    }
    setValue('f-expiry', result.expiryDate);
    showToast('Expiry date detected ✓');
  } catch {
    showToast('Could not read expiry date');
  } finally {
    if (btn) btn.disabled = false;
  }
}

export function openEditSheet(): void {
  const card = getCards().find(c => c.id === currentCardId);
  if (!card) return;
  closeSheet('detail-overlay');
  setTimeout(() => openAddSheet(card), 200);
}

export async function saveCard(): Promise<void> {
  const name        = getVal('f-name');
  const brand       = getVal('f-brand') || undefined;
  const number      = getVal('f-number');
  const format      = getVal('f-format') || detectBarcodeFormat(number);
  const category    = 'grocery';
  const placement   = getPlacementInput();
  const notes       = '';
  const expiryDate  = getVal('f-expiry');

  if (!name)   { showToast('Please enter a product name'); return; }
  if (!number && !isFreshTemplatePlacement(placement)) { showToast('Please enter an item number'); return; }

  if (editMode && currentCardId) {
    const existing = getCards().find(c => c.id === currentCardId);
    if (existing) {
      updateCard(touchCard({ ...existing, name, productName: name, brand, number, format, category, placement, notes, expiryDate, color: existing.color || COLORS[0]!, emoji: placementEmoji(placement) }));
      showToast('Item updated!');
    }
  } else {
    addCard(makeCard({ name, productName: name, brand, number, format, category, placement, notes, expiryDate, color: COLORS[0]!, emoji: placementEmoji(placement) }));
    showToast('Item added! 🎉');
  }

  closeSheet('add-overlay');
  renderCards();
  notifyExpiring(getCards());
  await pushToRemote();
}

export async function deleteCurrentCard(): Promise<void> {
  if (!currentCardId || !confirm('Delete this item?')) return;
  removeCard(currentCardId);
  closeSheet('detail-overlay');
  renderCards();
  showToast('Item deleted');
  await pushToRemote();
}

// ── Add wizard ────────────────────────────────────────────────────────────────

export function nextWizardStep(): void {
  if (wizardStep < WIZARD_STEPS) {
    wizardStep += 1;
    updateWizardUi();
  }
}

export function prevWizardStep(): void {
  if (wizardStep > 1) {
    wizardStep -= 1;
    updateWizardUi();
  }
}

export function applyFreshTemplate(): void {
  const templateKey = getVal('f-template');
  if (!templateKey) return;
  const template = FRESH_ITEM_TEMPLATES[templateKey];
  if (!template) return;
  if (!getVal('f-name')) setValue('f-name', template.name);
  if (template.brand && !getVal('f-brand')) setValue('f-brand', template.brand);
  setValue('f-placement', template.placement);
  if (!getVal('f-expiry')) setValue('f-expiry', addDays(template.expiryDays));
}

export function handleNumberInput(): void {
  const number = getVal('f-number');
  if (!number) return;
  setValue('f-format', detectBarcodeFormat(number));
}

function updateWizardUi(): void {
  const step1 = document.getElementById('wizard-step-1');
  const step2 = document.getElementById('wizard-step-2');
  step1?.classList.toggle('active', wizardStep === 1);
  step2?.classList.toggle('active', wizardStep === 2);
  document.getElementById('wizard-dot-1')?.classList.toggle('active', wizardStep >= 1);
  document.getElementById('wizard-dot-2')?.classList.toggle('active', wizardStep >= 2);

  const backBtn = document.getElementById('wizard-back-btn');
  const nextBtn = document.getElementById('wizard-next-btn');
  const saveBtn = document.getElementById('save-card-btn');
  if (backBtn) backBtn.style.display = wizardStep === 1 ? 'none' : '';
  if (nextBtn) nextBtn.style.display = wizardStep === WIZARD_STEPS ? 'none' : '';
  if (saveBtn) saveBtn.style.display = wizardStep === WIZARD_STEPS ? '' : 'none';
}

// ── Pickers ───────────────────────────────────────────────────────────────────

export function buildPlacementChips(): void {
  const el = document.getElementById('placement-chips');
  if (!el) return;
  const dynamicPlacements = new Set(DEFAULT_PLACEMENTS);
  for (const card of getCards()) dynamicPlacements.add(getPlacement(card));
  const placements = ['All', ...Array.from(dynamicPlacements)];

  // Validate currentFilter: if not in placements, reset to 'all'
  const validFilters = placements.map(p => p.toLowerCase());
  if (!validFilters.includes(currentFilter)) {
    currentFilter = 'all';
  }

  // Clear existing chips
  el.innerHTML = '';

  // Build chips using DOM methods to prevent XSS
  for (const placement of placements) {
    const filterKey = placement.toLowerCase();
    const chip = document.createElement('div');
    chip.className = 'chip';
    if (currentFilter === filterKey) {
      chip.classList.add('active');
    }
    chip.setAttribute('data-cat', filterKey);
    chip.textContent = `${placementEmoji(placement)} ${placement}`;
    chip.addEventListener('click', () => filterByCategory(chip, chip.dataset['cat'] ?? 'all'));
    el.appendChild(chip);
  }
}

// ── Sheet helpers ─────────────────────────────────────────────────────────────

export function openSheet(id: string): void {
  document.getElementById(id)?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeSheet(id: string): void {
  document.getElementById(id)?.classList.remove('open');
  document.body.style.overflow = '';
}

export function closeOnBackdrop(e: MouseEvent, id: string): void {
  if ((e.target as HTMLElement).id === id) closeSheet(id);
}

// ── Nav ───────────────────────────────────────────────────────────────────────

export function showPage(page: string): void {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');

  // Highlight the settings button when on the settings page
  const settingsBtn = document.getElementById('settings-btn');
  if (settingsBtn) {
    settingsBtn.style.color  = page === 'settings' ? 'var(--accent)' : '';
    settingsBtn.style.background = page === 'settings' ? 'var(--surface)' : '';
  }

  // FAB only makes sense on the home/cards page
  const fab = document.querySelector<HTMLElement>('.fab');
  if (fab) fab.style.display = page === 'home' ? 'flex' : 'none';
}

export function toggleSearch(): void {
  const bar = document.getElementById('search-bar');
  if (!bar) return;
  const vis = bar.style.display !== 'none';
  bar.style.display = vis ? 'none' : 'block';
  if (!vis) document.getElementById('search-input')?.focus();
  else {
    (document.getElementById('search-input') as HTMLInputElement).value = '';
    renderCards();
  }
}

// ── Export / Import ───────────────────────────────────────────────────────────

export function exportCards(): void {
  const blob = new Blob([JSON.stringify(getCards(), null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'foodie-backup.json';
  a.click();
  showToast('Items exported!');
}

export async function importCards(e: Event): Promise<void> {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const text = await file.text();
  try {
    const imported = JSON.parse(text) as Card[];
    if (!Array.isArray(imported)) throw new Error('Not an array');
    const existing = new Set(getCards().map(c => c.id));
    let added = 0;
    for (const c of imported) {
      // Allow cards without barcode number if they are fresh template items
      const hasValidNumber = c.number || isFreshTemplatePlacement(c.placement || '');
      if (c.id && c.name && hasValidNumber && !existing.has(c.id)) {
        addCard(c);
        added++;
      }
    }
    renderCards();
    showToast(`Imported ${added} item(s)`);
    await pushToRemote();
  } catch {
    showToast('Import failed: invalid file');
  }
  (e.target as HTMLInputElement).value = '';
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function setText(id: string, val: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setValue(id: string, val: string): void {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  if (el) el.value = val;
}

function getVal(id: string): string {
  return ((document.getElementById(id) as HTMLInputElement | null)?.value ?? '').trim();
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatTileExpiry(c: Card): string {
  const parts = formatExpiryDisplayParts(c.expiryDate);
  if (!parts) return 'No expiry';
  return `Expires ${parts.nice} (${parts.rel})`;
}

function formatDetailExpiry(card: Card): string {
  const parts = formatExpiryDisplayParts(card.expiryDate);
  if (!parts) return 'No expiry date set';
  return `Expiry: ${parts.nice} — ${parts.rel}`;
}

/** Local calendar date from YYYY-MM-DD; null if invalid. */
function parseIsoLocalMidnight(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole-day offset from local today to expiry (DST-safe vs ms floor). */
function calendarDaysUntilExpiry(iso: string): number | null {
  const exp = parseIsoLocalMidnight(iso);
  if (!exp) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const expDay = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate());
  return Math.round((expDay.getTime() - today.getTime()) / 86_400_000);
}

function formatExpiryDisplayParts(iso: string | undefined): { nice: string; rel: string } | null {
  if (!iso) return null;
  const d = parseIsoLocalMidnight(iso);
  if (!d) return null;
  const nice = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const days = calendarDaysUntilExpiry(iso);
  if (days === null) return null;
  let rel: string;
  if (days === 0) rel = 'today';
  else if (days === 1) rel = 'tomorrow';
  else if (days === -1) rel = 'yesterday';
  else if (days > 1) rel = `in ${days} days`;
  else rel = `expired ${-days} day(s) ago`;
  return { nice, rel };
}

function displayName(card: Card): string {
  return card.productName || card.name;
}

function getPlacement(card: Card): string {
  if (card.placement) return card.placement;
  return cap(card.category || 'other');
}

function getPlacementInput(): string {
  const custom = getVal('f-placement-custom');
  if (custom) return custom;
  return getVal('f-placement') || 'Cupboard';
}

function isFreshTemplatePlacement(placement: string): boolean {
  // Check if the placement matches any fresh-template placement
  const templatePlacements = new Set(Object.values(FRESH_ITEM_TEMPLATES).map(t => t.placement));
  return templatePlacements.has(placement);
}

function placementEmoji(placement: string): string {
  const p = placement.toLowerCase();
  if (p.includes('fridge')) return '🧊';
  if (p.includes('freezer')) return '❄️';
  if (p.includes('cupboard') || p.includes('pantry')) return '🗄️';
  if (p.includes('storage')) return '📦';
  if (p.includes('fruit')) return '🍎';
  if (p.includes('counter')) return '🏠';
  return '🛒';
}

function detectBarcodeFormat(number: string): string {
  const digitsOnly = /^\d+$/.test(number);
  if (!digitsOnly) return 'CODE128';
  if (number.length === 13) return 'EAN13';
  if (number.length === 8) return 'EAN8';
  if (number.length === 12) return 'UPC';
  return 'EAN13';
}

function addDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
