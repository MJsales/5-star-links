// Discord VIP grant — OAuth callback that Discord redirects a buyer to after
// they click "Claim VIP" on success.html. It exchanges the code for the buyer's
// Discord identity, verifies their Stripe payment actually succeeded (the
// PaymentIntent id is passed through as OAuth `state`), then adds them to the
// server with the VIP role. No always-on bot process needed — role assignment
// is a one-shot REST call using the bot token.
//
// Secrets live in Vercel env vars (never in code):
//   DISCORD_CLIENT_SECRET, DISCORD_BOT_TOKEN, STRIPE_SECRET_KEY
// Non-secret ids are hardcoded as defaults but can be overridden by env vars.
const https = require('https');
const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1526466717570830386';
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1525282626271707286';
const VIP_ROLE_ID = process.env.DISCORD_VIP_ROLE_ID || '1526836212181237873';
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'https://www.5starlinks.xyz/api/discord';

module.exports = async (req, res) => {
  // Vercel cron hits /api/discord?task=daily once a day to post the games,
  // and ?task=update in the evening to re-post only if the slate changed.
  if (req.query.task === 'daily') return dailyPost(req, res, false);
  if (req.query.task === 'update') return dailyPost(req, res, true);

  const code = req.query.code;
  const state = req.query.state; // Stripe PaymentIntent id

  if (!code) return page(res, 400, 'Missing authorization. Start from the order confirmation page.');
  if (!process.env.DISCORD_CLIENT_SECRET || !process.env.DISCORD_BOT_TOKEN) {
    return page(res, 500, 'Discord is not configured yet. Please contact support.');
  }

  try {
    // 1) Verify the payment (or an allowed promo code) before granting anything.
    // Promo codes mirror the ones cart.html accepts; override via env var.
    const promoCodes = (process.env.VIP_PROMO_CODES || 'JOHNABBY,DAY1').split(',').map(s => s.trim().toUpperCase());
    if (state && state.startsWith('promo:')) {
      const code = state.slice(6).toUpperCase();
      if (!promoCodes.includes(code)) return page(res, 402, 'That promo code is not valid for VIP.');
    } else {
      if (!state || !/^pi_/.test(state)) return page(res, 402, 'No valid payment found for this claim.');
      const pi = await stripe.paymentIntents.retrieve(state);
      if (!pi || (pi.status !== 'succeeded' && pi.status !== 'processing')) {
        return page(res, 402, 'We could not confirm a completed payment. VIP was not granted.');
      }
    }

    // 2) Exchange the OAuth code for the buyer's Discord access token.
    const token = await discordPost('/api/oauth2/token', new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }).toString(), { 'Content-Type': 'application/x-www-form-urlencoded' });

    if (!token.access_token) return page(res, 400, 'Discord login failed. Please try again.');

    // 3) Identify the user.
    const me = await discordGet('/api/users/@me', { Authorization: 'Bearer ' + token.access_token });
    if (!me.id) return page(res, 400, 'Could not read your Discord account. Please try again.');

    // 4) Add them to the server with the VIP role (works whether or not they've
    // joined yet). If already a member, this is a no-op on roles, so...
    await botRequest('PUT', `/api/guilds/${GUILD_ID}/members/${me.id}`, {
      access_token: token.access_token,
      roles: [VIP_ROLE_ID],
    });
    // 5) ...also explicitly ensure the VIP role for existing members.
    await botRequest('PUT', `/api/guilds/${GUILD_ID}/members/${me.id}/roles/${VIP_ROLE_ID}`, null);

    return page(res, 200,
      `You're in, ${escapeHtml(me.username || 'friend')}! ⭐ VIP unlocked. Open Discord to see your new access.`,
      'https://discord.gg/N8zSTmvZd');
  } catch (e) {
    return page(res, 500, 'Something went wrong granting VIP: ' + escapeHtml(e.message));
  }
};

// --- Daily game posts --------------------------------------------------------
// Posts today's schedule: every game into the VIP channel, one featured game
// into the free channel. Channels are found by name so no channel IDs are
// needed: VIP = first text channel whose name contains "vip", free = first
// whose name contains "game-of-the-day", "daily" or "free".
async function dailyPost(req, res, isUpdate) {
  // Vercel sends "Authorization: Bearer <CRON_SECRET>" on cron invocations
  // when the CRON_SECRET env var is set; enforce it so randoms can't spam.
  if (process.env.CRON_SECRET && req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!process.env.DISCORD_BOT_TOKEN) return res.status(500).json({ error: 'DISCORD_BOT_TOKEN not set' });

  try {
    // Today's date in ET (matches how the site shows the daily slate).
    const etDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const sched = await fetchOwnJSON('https://www.5starlinks.xyz/api/schedule?date=' + etDate);
    const games = (sched && sched.games) || [];

    const channels = await botRequest('GET', `/api/guilds/${GUILD_ID}/channels`, null);
    if (!Array.isArray(channels)) return res.status(500).json({ error: 'Could not list channels', detail: channels });
    const text = channels.filter(c => c.type === 0);
    const vipCh = text.find(c => c.name.includes(process.env.DISCORD_VIP_CHANNEL || 'vip'));
    const freeCh = text.find(c => !c.name.includes('vip') && ['ai', 'game-of-the-day', 'daily', 'free'].some(n => c.name.includes(process.env.DISCORD_FREE_CHANNEL || n)));

    const posted = {
      games: games.length,
      vipChannel: vipCh ? vipCh.name : 'NOT FOUND',
      freeChannel: freeCh ? freeCh.name : 'NOT FOUND',
      channelsSeen: text.map(c => c.name),
    };

    // Evening update: compare today's slate against what was already posted;
    // stay quiet unless a game was added, removed, or rescheduled away.
    if (isUpdate && vipCh) {
      const msgs = await botRequest('GET', `/api/channels/${vipCh.id}/messages?limit=30`, null);
      const alreadyPosted = new Set();
      if (Array.isArray(msgs)) {
        msgs.filter(m => m.content && m.content.includes(etDate)).forEach(m => {
          m.content.split('\n').forEach(l => {
            const mm = l.match(/^• (.+?) — /);
            if (mm) alreadyPosted.add(mm[1]);
          });
        });
      }
      const current = new Set(games.map(g => g.awayFull + ' @ ' + g.homeFull));
      const unchanged = alreadyPosted.size === current.size && [...current].every(x => alreadyPosted.has(x));
      if (unchanged) return res.status(200).json({ updated: false, reason: 'slate unchanged' });
      posted.updated = true;
    }

    const preds = await getPredictions(games);
    posted.predictions = Object.keys(preds).length;

    if (vipCh) {
      const header = isUpdate ? '🔄 Schedule Update' : '🤖 AI Predictions';
      const chunks = games.length ? buildVipMessages(etDate, games, preds, header) : [`📅 **${etDate}** — no games on the slate today. Rest day!`];
      for (const chunk of chunks) {
        const r = await postMessage(vipCh.id, chunk);
        posted.vip = r && r.id ? 'posted' : (r && r.message) || 'failed';
      }
    }
    if (freeCh && games.length && !isUpdate) {
      const idx = Math.floor(Math.random() * games.length);
      const pick = games[idx];
      const p = preds[idx];
      const predLine = p ? `\n🤖 **AI Prediction: ${p.pick}** (${p.conf}% confidence)${p.note ? ' — ' + p.note : ''}\n` : '\n';
      const r = await postMessage(freeCh.id,
        `🎯 **Free AI Prediction of the Day — ${etDate}**\n` +
        `${sportEmoji(pick.sport)} **${pick.awayFull} @ ${pick.homeFull}** — ${gameTime(pick)}\n` +
        predLine +
        `\nWant the AI's prediction for EVERY game today? ⭐ VIP members get the full slate → https://www.5starlinks.xyz`);
      posted.free = r && r.id ? 'posted' : (r && r.message) || 'failed';
    }

    res.status(200).json(posted);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

function buildVipMessages(etDate, games, preds, header) {
  preds = preds || {};
  const bySport = {};
  games.forEach((g, i) => { g._idx = i; (bySport[g.sport] = bySport[g.sport] || []).push(g); });

  let lines = [`**${header || '🤖 AI Predictions'} — ${etDate}** (${games.length} games)`];
  Object.keys(bySport).forEach(sport => {
    lines.push('', `${sportEmoji(sport)} **${sport.toUpperCase()}**`);
    bySport[sport].forEach(g => {
      const p = preds[g._idx];
      lines.push(`• ${g.awayFull} @ ${g.homeFull} — ${gameTime(g)}`);
      if (p) lines.push(`   🤖 **${p.pick}** (${p.conf}%)${p.note ? ' — ' + p.note : ''}`);
    });
  });

  // Discord caps messages at 2000 chars; split on line boundaries.
  const chunks = [];
  let cur = '';
  lines.forEach(l => {
    if ((cur + '\n' + l).length > 1900) { chunks.push(cur); cur = l; }
    else cur = cur ? cur + '\n' + l : l;
  });
  if (cur) chunks.push(cur);
  return chunks;
}

// Ask Gemini (same brain as ai.html) for a winner + confidence per game.
// Returns { gameIndex: {pick, conf, note} }; empty object on any failure so
// the schedule still posts without predictions.
async function getPredictions(games) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !games.length) return {};
  try {
    const list = games.map((g, i) => `${i}: [${g.sport}] ${g.awayFull} @ ${g.homeFull}`).join('\n');
    const prompt = 'You are an expert sports analyst. For each game below pick the winner with a confidence percent (51-85) and a very short reason (under 10 words). '
      + 'Respond with ONLY a JSON array, one object per game, no markdown: '
      + '[{"i":0,"pick":"Team Name","conf":64,"note":"short reason"}]\n\nToday\'s games:\n' + list;
    const resp = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
        }),
      }
    );
    if (!resp.ok) return {};
    const data = await resp.json();
    const text = (data.candidates && data.candidates[0] && data.candidates[0].content
      && data.candidates[0].content.parts && data.candidates[0].content.parts[0].text) || '';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return {};
    const map = {};
    JSON.parse(match[0]).forEach(p => { if (p && p.pick != null) map[p.i] = p; });
    return map;
  } catch (e) {
    return {};
  }
}

function sportEmoji(sport) {
  return { mlb: '⚾', nfl: '🏈', nba: '🏀', nhl: '🏒', soccer: '⚽' }[sport] || '🎮';
}

function gameTime(g) {
  try {
    return new Date(g.timestamp).toLocaleTimeString('en-US', {
      timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit',
    }) + ' ET';
  } catch (e) { return 'TBD'; }
}

function postMessage(channelId, content) {
  return botRequest('POST', `/api/channels/${channelId}/messages`, { content });
}

function fetchOwnJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (resp) => {
      let data = '';
      resp.on('data', (c) => (data += c));
      resp.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Bad schedule response')); }
      });
    }).on('error', reject);
  });
}

// --- Discord REST helpers ---------------------------------------------------
function botRequest(method, path, body) {
  return discordRequest(method, path, body ? JSON.stringify(body) : null, {
    Authorization: 'Bot ' + process.env.DISCORD_BOT_TOKEN,
    'Content-Type': 'application/json',
  });
}
function discordGet(path, headers) {
  return discordRequest('GET', path, null, headers);
}
function discordPost(path, body, headers) {
  return discordRequest('POST', path, body, headers);
}
function discordRequest(method, path, body, headers) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'discord.com',
      path,
      method,
      headers: Object.assign({ 'User-Agent': '5StarLinks (https://5starlinks.xyz, 1.0)' }, headers || {}),
    };
    if (body) opts.headers['Content-Length'] = Buffer.byteLength(body);
    const r = https.request(opts, (resp) => {
      let data = '';
      resp.on('data', (c) => (data += c));
      resp.on('end', () => {
        if (resp.statusCode === 204 || !data) return resolve({});
        try { resolve(JSON.parse(data)); } catch (e) { resolve({ raw: data }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function page(res, status, message, discordUrl) {
  const btn = discordUrl
    ? `<a href="${discordUrl}" style="display:inline-block;margin-top:20px;padding:14px 28px;background:#5865F2;color:#fff;text-decoration:none;border-radius:12px;font-weight:700;">Open Discord</a>`
    : `<a href="/index.html" style="display:inline-block;margin-top:20px;padding:14px 28px;background:#a855f7;color:#fff;text-decoration:none;border-radius:12px;font-weight:700;">Back to site</a>`;
  res.setHeader('Content-Type', 'text/html');
  res.status(status).send(`<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>5 Star VIP</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#050208;font-family:Inter,system-ui,sans-serif;color:#fff;text-align:center;padding:24px;">
<div style="max-width:420px;">
<div style="font-size:48px;margin-bottom:12px;">${status === 200 ? '⭐' : '⚠️'}</div>
<p style="font-size:1.15rem;line-height:1.5;">${message}</p>
${btn}
</div></body></html>`);
}
