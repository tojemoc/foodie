/**
 * Brevo (Sendinblue) transactional email API.
 */

export interface BrevoEmailPayload {
  apiKey:    string;
  to:        string;
  fromEmail: string;
  fromName:  string;
  subject:   string;
  html:      string;
}

export async function sendBrevoEmail(opts: BrevoEmailPayload): Promise<{ ok: boolean; body: string }> {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method:  'POST',
    headers: {
      'api-key':      opts.apiKey,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
    body: JSON.stringify({
      sender:      { email: opts.fromEmail, name: opts.fromName },
      to:          [{ email: opts.to }],
      subject:     opts.subject,
      htmlContent: opts.html,
    }),
  });
  return { ok: res.ok, body: await res.text() };
}
