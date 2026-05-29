const asyncHandler = require('express-async-handler');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// ── In-memory session store (sessionId → { cookies, rid, expiresAt }) ──
const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes
const sessions = new Map();

function purgeExpired() {
  const now = Date.now();
  for (const [id, sess] of sessions) {
    if (sess.expiresAt < now) sessions.delete(id);
  }
}
setInterval(purgeExpired, 60_000);

// ── Axios instance pointed at GST portal ──
const gst = axios.create({
  baseURL: 'https://services.gst.gov.in',
  timeout: 15_000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    Accept: '*/*',
  },
});

// Merge Set-Cookie array into a single Cookie header string
function mergeCookies(existing, incoming) {
  if (!incoming) return existing;
  const arr = Array.isArray(incoming) ? incoming : [incoming];
  const map = new Map();

  // Parse existing
  existing.split(';').map(s => s.trim()).filter(Boolean).forEach(pair => {
    const [k, v] = pair.split('=');
    if (k) map.set(k.trim(), v ? v.trim() : '');
  });

  // Overwrite / add from incoming Set-Cookie values
  arr.forEach(header => {
    // Each Set-Cookie header: "name=value; Path=/; HttpOnly; ..."
    const [nameVal] = header.split(';');
    const [k, v = ''] = nameVal.split('=');
    map.set(k.trim(), v.trim());
  });

  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

// ── GET /api/gst/captcha ──────────────────────────────────────────────────────
const getCaptcha = asyncHandler(async (req, res) => {
  // Step 1: init session → get rid + cookies
  let cookies = '';
  let rid;

  try {
    const guidRes = await gst.get('/services/api/search/guid');
    console.log('[GST] guid status:', guidRes.status, '| data:', JSON.stringify(guidRes.data), '| cookies:', guidRes.headers['set-cookie']);
    rid = guidRes.data?.rid || guidRes.data;
    cookies = mergeCookies(cookies, guidRes.headers['set-cookie']);
    console.log('[GST] rid:', rid, '| merged cookies:', cookies);
  } catch (err) {
    console.error('[GST] guid error:', err?.response?.status, err?.message);
    return res.status(502).json({ error: 'GST portal unreachable (step 1)' });
  }

  // Step 2: fetch captcha image
  let imageBase64;
  try {
    const captchaRes = await gst.get(`/services/captcha?rid=${rid}`, {
      responseType: 'arraybuffer',
      headers: { Cookie: cookies },
    });
    console.log('[GST] captcha status:', captchaRes.status, '| content-type:', captchaRes.headers['content-type'], '| bytes:', captchaRes.data?.byteLength);
    cookies = mergeCookies(cookies, captchaRes.headers['set-cookie']);
    const buf = Buffer.from(captchaRes.data);
    imageBase64 = `data:image/png;base64,${buf.toString('base64')}`;
  } catch (err) {
    console.error('[GST] captcha error:', err?.response?.status, err?.message);
    return res.status(502).json({ error: 'GST portal unreachable (captcha)' });
  }

  const sessionId = uuidv4();
  sessions.set(sessionId, { cookies, rid, expiresAt: Date.now() + SESSION_TTL_MS });

  res.json({ sessionId, image: imageBase64 });
});

// ── POST /api/gst/verify ──────────────────────────────────────────────────────
const verifyGstin = asyncHandler(async (req, res) => {
  const { gstin, sessionId, captcha } = req.body;

  if (!gstin || !sessionId || !captcha) {
    return res.status(400).json({ error: 'gstin, sessionId and captcha are required' });
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(410).json({ error: 'Session expired — please refresh the captcha', captchaError: true });
  }
  sessions.delete(sessionId); // one-shot

  const { cookies, rid } = session;

  let data;
  try {
    const detailsRes = await gst.get(`/services/api/search/taxpayerDetails?gstin=${gstin}`, {
      headers: {
        Cookie: cookies,
        captcha: captcha,
        rid: rid,
        Referer: 'https://services.gst.gov.in/services/searchtp',
      },
    });
    data = detailsRes.data;
  } catch (err) {
    const status = err?.response?.status;
    const body = err?.response?.data;

    // GST portal returns 4xx with errorCode on captcha mismatch
    const isCaptchaErr =
      status === 401 ||
      status === 400 ||
      (body && (body.errorCode === 'SWEB_9000' || /captcha/i.test(body.message || '')));

    if (isCaptchaErr) {
      return res.status(422).json({ captchaError: true, error: 'Wrong captcha — please try again' });
    }

    return res.status(502).json({ error: 'GST portal unreachable' });
  }

  // Handle portal-level error inside a 200 response
  if (data?.errorCode || data?.message?.toLowerCase?.().includes('captcha')) {
    return res.status(422).json({ captchaError: true, error: 'Wrong captcha — please try again' });
  }

  const legalName = data?.lgnm || data?.legalName || '';
  const tradeName = data?.tradeNam || data?.tradeName || '';
  const status = data?.sts || data?.status || '';

  if (!legalName && !tradeName) {
    return res.status(404).json({ error: 'Taxpayer not found for this GSTIN' });
  }

  res.json({ legalName, tradeName, status });
});

module.exports = { getCaptcha, verifyGstin };
