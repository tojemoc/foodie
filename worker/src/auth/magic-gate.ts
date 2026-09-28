import type { Env, MagicLinkData } from '../types.js';
import { magicCodeKey } from '../lib/kv.js';

/**
 * Per-credential Durable Object: serializes single-use magic-link / passcode
 * consumption so concurrent verifies cannot both issue a JWT.
 * One DO instance per primary KV key (idFromName(primaryKey)).
 */
export class MagicLinkGate {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    let primaryKey = '';
    try {
      const body = await request.json<{ primaryKey?: string }>();
      primaryKey = body.primaryKey?.trim() ?? '';
    } catch {
      return Response.json({ data: null }, { status: 400 });
    }
    if (!primaryKey) return Response.json({ data: null }, { status: 400 });

    const data = await this.state.blockConcurrencyWhile(async () => {
      if (await this.state.storage.get<boolean>('consumed')) return null;

      const record = await this.env.FOODIE_KV.get<MagicLinkData>(primaryKey, 'json');
      if (!record) return null;

      await this.state.storage.put('consumed', true);

      const token = record.token || '';
      const code = record.code || '';
      const email = record.email || '';
      await Promise.all([
        token ? this.env.FOODIE_KV.delete(`magiclink:${token}`) : Promise.resolve(),
        code && email ? this.env.FOODIE_KV.delete(magicCodeKey(email, code)) : Promise.resolve(),
        this.env.FOODIE_KV.delete(primaryKey),
      ]);

      // Drop the consumed marker after the magic TTL window.
      await this.state.storage.setAlarm(Date.now() + 900_000);
      return record;
    });

    return Response.json({ data });
  }

  async alarm(): Promise<void> {
    await this.state.storage.deleteAll();
  }
}
