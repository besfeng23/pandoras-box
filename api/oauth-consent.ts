import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const config = { maxDuration: 10 };

const assets = Object.freeze({
  html: {
    path: path.join(process.cwd(), 'public', 'oauth', 'consent.html'),
    contentType: 'text/html; charset=utf-8',
  },
  js: {
    path: path.join(process.cwd(), 'public', 'oauth', 'consent.browser.js.txt'),
    contentType: 'text/javascript; charset=utf-8',
  },
});

export default async function oauthConsent(request: any, response: any) {
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.setHeader('CDN-Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://esm.sh; connect-src 'self' https://jcyqixttuebxqqfkjonq.supabase.co https://xyefkykwuppbweabvvmk.supabase.co; img-src 'self' data: https://raw.githubusercontent.com; style-src 'self' 'unsafe-inline'",
  );

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.status(405).json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED' } });
    return;
  }

  const selector = Array.isArray(request.query?.asset)
    ? request.query.asset[0]
    : request.query?.asset;
  const asset = assets[selector === 'js' ? 'js' : 'html'];
  try {
    const body = await readFile(asset.path);
    response.setHeader('Content-Type', asset.contentType);
    response.status(200).send(body);
  } catch {
    response.status(503).json({
      ok: false,
      error: { code: 'OAUTH_CONSENT_UNAVAILABLE', message: 'OAuth consent asset is unavailable.' },
    });
  }
}
