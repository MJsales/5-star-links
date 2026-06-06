require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('.'));

const PORT = process.env.PORT || 4242;
const DOWNLOADS_DIR = path.join(os.tmpdir(), '5star-videos');
const DOWNLOADER = path.join(__dirname, 'clip-downloader.js');

if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

setInterval(() => {
  try {
    const now = Date.now();
    fs.readdirSync(DOWNLOADS_DIR).forEach(f => {
      const fp = path.join(DOWNLOADS_DIR, f);
      if (now - fs.statSync(fp).mtimeMs > 30 * 60 * 1000) try { fs.unlinkSync(fp); } catch(e) {}
    });
  } catch(e) {}
}, 30 * 60 * 1000);

const products = {
  'ski-mask': { name: 'Ski Mask', price: 500 },
  'spider-hoodie': { name: 'Spider Hoodie', price: 500 },
  'bape-hoodie': { name: 'Bape Hoodie', price: 500 },
  'ai-picks': { name: 'AI Sports Picks', price: 500 },
  'ai-stocks': { name: 'AI Stock Picks', price: 500 },
  'ai-video': { name: 'AI Video Splicer', price: 500 },
};

app.post('/create-payment-intent', async (req, res) => {
  try {
    const { items } = req.body;
    let totalAmount = 0;
    items.forEach(item => { const p = products[item.id]; if (p) totalAmount += p.price * (item.quantity || 1); });
    if (totalAmount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const pi = await stripe.paymentIntents.create({ amount: totalAmount, currency: 'usd', automatic_payment_methods: { enabled: true } });
    res.json({ clientSecret: pi.client_secret });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

function formatSeconds(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function runDownloader(url, startSec, endSec, filename) {
  return new Promise((resolve, reject) => {
    execFile('node', [DOWNLOADER, url, String(startSec), String(endSec), filename], {
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024
    }, (err, stdout, stderr) => {
      if (err) {
        try { return reject(JSON.parse(stderr.trim())); } catch(e) {}
        return reject({ error: err.message });
      }
      try { resolve(JSON.parse(stdout.trim())); }
      catch(e) { reject({ error: 'Bad response from downloader' }); }
    });
  });
}

app.post('/api/download-clip', async (req, res) => {
  try {
    const { url, start, end, title } = req.body;
    if (!url || start === undefined || end === undefined) return res.status(400).json({ error: 'Missing url, start, or end' });

    const videoId = url.match(/(?:watch\?v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/)?.[1];
    if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL' });

    const safeTitle = (title || 'clip').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
    const filename = `${safeTitle}_${videoId}_${Math.floor(start)}-${Math.floor(end)}.mp4`;

    console.log(`[DL] ${formatSeconds(start)}-${formatSeconds(end)} => ${filename}`);
    const result = await runDownloader(url, start, end, filename);
    console.log(`[DL] OK: ${result.size} bytes`);

    res.json({ success: true, filename, size: result.size, downloadUrl: `/api/serve-clip/${encodeURIComponent(filename)}` });
  } catch (error) {
    console.error('[DL] Error:', error.error || error.message || error);
    res.status(500).json({ error: error.error || error.message || 'Download failed' });
  }
});

app.get('/api/serve-clip/:filename', (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(DOWNLOADS_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
});

app.post('/api/download-all', async (req, res) => {
  try {
    const { url, clips, title } = req.body;
    if (!url || !clips || clips.length === 0) return res.status(400).json({ error: 'Missing url or clips' });
    const videoId = url.match(/(?:watch\?v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/)?.[1];
    if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL' });

    const safeTitle = (title || 'video').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
    const results = [];

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const filename = `${safeTitle}_part${i + 1}_${videoId}.mp4`;
      try {
        const result = await runDownloader(url, clip.start, clip.end, filename);
        results.push({ part: i + 1, filename, size: result.size, downloadUrl: `/api/serve-clip/${encodeURIComponent(filename)}` });
      } catch (e) {
        results.push({ part: i + 1, error: e.error || e.message || 'Failed' });
      }
    }
    res.json({ success: true, clips: results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));
process.on('uncaughtException', e => console.error('[FATAL]', e.message));
process.on('unhandledRejection', e => console.error('[UNHANDLED]', e));
