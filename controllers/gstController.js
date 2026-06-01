const { randomUUID } = require('crypto');

const GST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
};

// ── In-memory session store (mirrors god-ui's gstSessions.ts) ─────────────────
const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes
const sessions = new Map();

function purge() {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, s] of sessions) {
    if (s.ts < cutoff) sessions.delete(id);
  }
}

function store(id, cookies) {
  sessions.set(id, { cookies, ts: Date.now() });
}

function pop(id) {
  const entry = sessions.get(id);
  sessions.delete(id);
  if (!entry) return null;
  if (Date.now() - entry.ts > SESSION_TTL_MS) return null;
  return entry.cookies;
}

// ── Cookie helpers ─────────────────────────────────────────────────────────────
function extractCookies(res) {
  const raw = res.headers.get('set-cookie') ?? '';
  const map = new Map();
  for (const c of raw.split(/,\s*(?=[A-Za-z_][A-Za-z0-9_-]*\s*=)/)) {
    const pair = c.split(';')[0].trim();
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const name = eq === -1 ? pair : pair.slice(0, eq);
    map.set(name, pair);
  }
  return map;
}

function mergeCookies(base, extra) {
  return Array.from(new Map([...base, ...extra]).values()).join('; ');
}

// ── GSTIN validation ───────────────────────────────────────────────────────────
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function isChecksumValid(gstin) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(gstin[i]);
    if (v === -1) return false;
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36] === gstin[14];
}

// ── GET /api/gst/captcha ───────────────────────────────────────────────────────
const getGstCaptcha = async (req, res) => {
  purge();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 10_000);

  try {
    const initRes = await fetch('https://services.gst.gov.in/services/searchtp', {
      signal: ac.signal,
      headers: GST_HEADERS,
    });
    const cookies1 = extractCookies(initRes);

    const captchaRes = await fetch('https://services.gst.gov.in/services/captcha', {
      signal: ac.signal,
      headers: {
        ...GST_HEADERS,
        Accept: 'image/webp,image/png,image/*,*/*',
        Cookie: mergeCookies(new Map(), cookies1),
        Referer: 'https://services.gst.gov.in/services/searchtp',
      },
    });
    clearTimeout(timer);

    if (!captchaRes.ok) {
      return res.status(502).json({ error: 'GST portal did not return a captcha' });
    }

    const cookies2 = extractCookies(captchaRes);
    const allCookies = mergeCookies(cookies1, cookies2);
    const buf = await captchaRes.arrayBuffer();
    const sessionId = randomUUID();
    store(sessionId, allCookies);

    return res.json({
      sessionId,
      image: `data:image/png;base64,${Buffer.from(buf).toString('base64')}`,
    });
  } catch {
    clearTimeout(timer);
    return res.status(502).json({ error: 'GST portal is unreachable' });
  }
};

// ── GET /api/gst/verify?gstin=XXX  (format + checksum only, no network) ───────
const verifyGstinFormat = (req, res) => {
  const gstin = (req.query.gstin ?? '').toUpperCase();

  if (!GSTIN_REGEX.test(gstin)) {
    return res.status(400).json({ error: 'Invalid GSTIN format' });
  }
  if (!isChecksumValid(gstin)) {
    return res.status(400).json({
      error: 'Invalid GSTIN — checksum verification failed. Please double-check the number.',
    });
  }
  return res.json({ checksumValid: true, gstin });
};

// ── POST /api/gst/verify  (full portal verification via captcha session) ───────
const verifyGstinPortal = async (req, res) => {
  const gstin = (req.body.gstin ?? '').toUpperCase().trim();
  const sessionId = (req.body.sessionId ?? '').trim();
  const captcha = (req.body.captcha ?? '').trim();

  if (!gstin || !sessionId || !captcha) {
    return res.status(400).json({ error: 'gstin, sessionId and captcha are required' });
  }
  if (!GSTIN_REGEX.test(gstin)) {
    return res.status(400).json({ error: 'Invalid GSTIN format' });
  }
  if (!isChecksumValid(gstin)) {
    return res.status(400).json({ error: 'Invalid GSTIN — checksum verification failed' });
  }

  // One-time use: pop removes the session so the captcha cannot be replayed
  const cookies = pop(sessionId);
  if (!cookies) {
    return res.status(400).json({ error: 'Session expired or invalid — fetch a new captcha' });
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 10_000);

  try {
    const portalRes = await fetch(
      'https://services.gst.gov.in/services/api/search/taxpayerDetails',
      {
        method: 'POST',
        signal: ac.signal,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': GST_HEADERS['User-Agent'],
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: 'https://services.gst.gov.in/services/searchtp',
          Origin: 'https://services.gst.gov.in',
          Cookie: cookies,
        },
        body: JSON.stringify({ gstin, captcha }),
      }
    );
    clearTimeout(timer);

    const text = await portalRes.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: 'GST portal returned an unexpected response — try again' });
    }

    if (data.errorCode || data.error) {
      const msg = data.errorDesc || data.error || 'GST portal returned an error';
      const isCaptchaError =
        /captcha/i.test(msg) ||
        data.errorCode === 'SWEB_9035' ||
        data.errorCode === 'CAPTCHA_INVALID';
      return res
        .status(isCaptchaError ? 422 : 404)
        .json({ error: msg, captchaError: isCaptchaError });
    }

    if (!data.lgnm && !data.tradeNam) {
      return res.status(404).json({
        error: 'GST portal returned no company data — the GSTIN may be inactive',
      });
    }

    return res.json({
      legalName: data.lgnm ?? '',
      tradeName: data.tradeNam ?? '',
      status: data.sts ?? '',
      gstin: data.gstin ?? gstin,
    });
  } catch {
    clearTimeout(timer);
    return res.status(502).json({ error: 'GST portal is unreachable' });
  }
};

module.exports = { getGstCaptcha, verifyGstinFormat, verifyGstinPortal };
