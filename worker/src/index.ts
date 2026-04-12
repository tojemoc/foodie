export interface Env {
  /** Set per deploy via `wrangler deploy --var VERSION=...` */
  VERSION?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';

    if (path === '/health') {
      return Response.json({ ok: true, service: 'foodie-api' });
    }

    if (path === '/version') {
      return Response.json({
        version: env.VERSION ?? 'unknown',
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};
