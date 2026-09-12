// The security controls this application asserts about itself (hard rule 10).
//
// They were implemented and never tested, which for a security tool is the
// wrong way round: a client's security review will run a header scan against
// this before it reads a word of the proposal, and a CSP that silently stopped
// being applied is not something anyone notices by using the app.
//
// The regression this guards is real rather than theoretical. Next has already
// renamed this convention once, `middleware.ts` became `proxy.ts` in 16, and
// a rename that leaves the file exporting the right function under the wrong
// name disables every header here without failing a build, a lint or a type
// check.

import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import nextConfig from '../next.config';
import { config as proxyConfig, proxy } from '../src/proxy';

function cspFor(url = 'https://stackfit.test/scenarios/abc/results'): string {
  const response = proxy(new NextRequest(new Request(url)));
  return response.headers.get('Content-Security-Policy') ?? '';
}

/** The directive's value, e.g. `directive('script-src')` → "'self' 'nonce-…'". */
function directive(name: string, csp = cspFor()): string {
  const found = csp
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry === name || entry.startsWith(`${name} `));
  return found === undefined ? '' : found.slice(name.length).trim();
}

describe('Content-Security-Policy', () => {
  it('is set on the response at all', () => {
    expect(cspFor()).not.toBe('');
  });

  it('defaults to same-origin and allows no plugins', () => {
    expect(directive('default-src')).toBe("'self'");
    expect(directive('object-src')).toBe("'none'");
  });

  it('refuses to be framed, which is the clickjacking control', () => {
    expect(directive('frame-ancestors')).toBe("'none'");
  });

  it('pins the form target and the base URI', () => {
    // Every mutation in this app is a form posting to a server action. A
    // dangling `form-action` would let injected markup post a client's intake
    // somewhere else, and `base-uri` stops a rewritten <base> doing the same to
    // every relative URL on the page.
    expect(directive('form-action')).toBe("'self'");
    expect(directive('base-uri')).toBe("'self'");
  });

  it('talks to no third party', () => {
    // This tool holds a prospective client's asset inventory. It has no reason
    // to open a connection to anywhere but itself, and a scoping tool quietly
    // posting that somewhere would be a breach rather than a bug.
    const connect = directive('connect-src');
    expect(connect.startsWith("'self'")).toBe(true);
    expect(connect).not.toContain('http://');
    expect(connect).not.toContain('*');
  });

  it('carries a fresh nonce on every request', () => {
    // A reused nonce is no better than 'unsafe-inline': an injected script that
    // learns one from a cached page would execute on the next.
    const first = directive('script-src', cspFor());
    const second = directive('script-src', cspFor());

    expect(first).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(first).not.toBe(second);
  });

  it('never allows inline script', () => {
    // The nonce is what buys this. Losing it would make the whole policy
    // decorative, and the loss would not be visible in the running app.
    expect(directive('script-src')).not.toContain("'unsafe-inline'");
  });

  it('upgrades insecure requests once hosted', () => {
    expect(cspFor()).toContain('upgrade-insecure-requests');
  });

  it('applies to application routes and skips immutable static output', () => {
    const sources = proxyConfig.matcher.map((entry) =>
      typeof entry === 'string' ? entry : entry.source,
    );
    expect(sources.join(' ')).toContain('_next/static');
  });
});

describe('the static security headers', () => {
  async function headerMap(): Promise<Map<string, string>> {
    const rules = (await nextConfig.headers?.()) ?? [];
    const all = rules.flatMap((rule) => rule.headers);
    return new Map(all.map((header) => [header.key, header.value]));
  }

  it('sets every header a security review looks for', async () => {
    const headers = await headerMap();

    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('Strict-Transport-Security')).toContain('max-age=');
  });

  it('denies the device permissions this tool has no use for', async () => {
    const policy = (await headerMap()).get('Permissions-Policy') ?? '';

    // A scoping questionnaire asking for a microphone is exactly the sort of
    // thing worth making impossible rather than merely not doing.
    for (const feature of ['camera', 'microphone', 'geolocation', 'payment']) {
      expect(policy, `${feature} is not denied`).toContain(`${feature}=()`);
    }
  });

  it('applies them to every path', async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    expect(rules.some((rule) => rule.source === '/:path*')).toBe(true);
  });
});
