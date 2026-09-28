/**
 * Normalize pasted magic credentials for /auth/magic/verify.
 * Accepts bare tokens, 6-digit passcodes, foodie:// deep links, and https handoff URLs.
 */
export function normalizeMagicCredential(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  if (/^\d{6}$/.test(trimmed)) return trimmed;

  const foodie = trimmed.match(
    /^foodie:\/\/\/?auth\/verify\/?\?(?:[^#]*\b(?:token|magic|t)=([^&#]+))/i,
  );
  if (foodie?.[1]) {
    try {
      return decodeURIComponent(foodie[1]);
    } catch {
      return foodie[1];
    }
  }

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      const fromQuery =
        url.searchParams.get('token') ??
        url.searchParams.get('magic') ??
        url.searchParams.get('t');
      if (fromQuery?.trim()) return fromQuery.trim();
    }
  } catch {
    // fall through
  }

  const qs = trimmed.match(/(?:^|[?&#])(?:token|magic|t)=([^&#]+)/i);
  if (qs?.[1]) {
    try {
      return decodeURIComponent(qs[1]);
    } catch {
      return qs[1];
    }
  }

  return trimmed;
}

function pathOnly(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

/** Extract a magic credential from an incoming deep link / App Link URL. */
export function credentialFromAuthUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const path = pathOnly(parsed.pathname);

    if (parsed.protocol === 'foodie:') {
      const host = parsed.hostname.toLowerCase();
      if (host === 'auth' && (path === '/verify' || path === '')) {
        return (
          parsed.searchParams.get('token') ||
          parsed.searchParams.get('magic') ||
          parsed.searchParams.get('t') ||
          null
        );
      }
      return null;
    }

    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return (
        parsed.searchParams.get('token') ||
        parsed.searchParams.get('magic') ||
        parsed.searchParams.get('t') ||
        null
      );
    }
  } catch {
    // Non-standard URLs — fall through to regex normalize.
  }

  if (/^foodie:\/\/\/?auth\/verify/i.test(url) || /^https?:\/\//i.test(url)) {
    const normalized = normalizeMagicCredential(url);
    return normalized && normalized !== url.trim() ? normalized : null;
  }

  return null;
}
