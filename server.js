require('dotenv').config();

const wingetPkgs = 'C:\\Users\\abby\\AppData\\Local\\Microsoft\\WinGet\\Packages';
process.env.PATH = [
  wingetPkgs + '\\yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe',
  wingetPkgs + '\\yt-dlp.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-N-124716-g054dffd133-win64-gpl\\bin',
  process.env.PATH
].join(';');

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

const PORT = 4242;
const DOWNLOADS_DIR = path.join(os.tmpdir(), '5star-videos');
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
    const paymentIntent = await stripe.paymentIntents.create({ amount: totalAmount, currency: 'usd', automatic_payment_methods: { enabled: true } });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

function formatSeconds(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

const YTDLP_PATH = 'C:\\Users\\abby\\AppData\\Local\\Microsoft\\WinGet\\Packages\\yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe\\yt-dlp.exe';

const YTDLP = 'C:\\Users\\abby\\AppData\\Local\\Microsoft\\WinGet\\Packages\\yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe\\yt-dlp.exe';

function runYtdlp(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; reject(new Error('yt-dlp timed out')); } }, timeoutMs);
    execFile(YTDLP, args, { maxBuffer: 50*1024*1024, timeout: timeoutMs }, (err, stdout, stderr) => {
      clearTimeout(timer);
      if (done) return;
      done = true;
      if (err) reject(new Error(err.message.slice(0, 500)));
      else resolve({ stdout, stderr });
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
    const outputPath = path.join(DOWNLOADS_DIR, filename);

    const startTime = typeof start === 'number' ? formatSeconds(start) : start;
    const endTime = typeof end === 'number' ? formatSeconds(end) : end;

    console.log(`[DL] ${startTime}-${endTime} => ${filename}`);

    await runYtdlp([
      '--extractor-args', 'youtube:player_client=android',
      '--download-sections', `*${startTime}-${endTime}`,
      '-f', 'best[ext=mp4]',
      '--force-keyframes-at-cuts',
      '--no-playlist', '--no-warnings',
      '-o', outputPath,
      url
    ], 120000);

    if (!fs.existsSync(outputPath)) {
      const partFile = outputPath + '.part';
      if (fs.existsSync(partFile)) fs.renameSync(partFile, outputPath);
      else return res.status(500).json({ error: 'Download failed' });
    }

    const stat = fs.statSync(outputPath);
    console.log(`[DL] OK: ${stat.size} bytes`);
    res.json({ success: true, filename, size: stat.size, downloadUrl: `/api/serve-clip/${encodeURIComponent(filename)}` });
  } catch (error) {
    console.error('[DL] Error:', error.message);
    res.status(500).json({ error: error.message });
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
      const outputPath = path.join(DOWNLOADS_DIR, filename);
      const startTime = typeof clip.start === 'number' ? formatSeconds(clip.start) : clip.start;
      const endTime = typeof clip.end === 'number' ? formatSeconds(clip.end) : clip.end;

      try {
        await runYtdlp([
          '--extractor-args', 'youtube:player_client=android',
          '--download-sections', `*${startTime}-${endTime}`,
          '-f', 'best[ext=mp4]',
          '--force-keyframes-at-cuts',
          '--no-playlist', '--no-warnings',
          '-o', outputPath,
          url
        ], 120000);

        if (fs.existsSync(outputPath)) {
          const stat = fs.statSync(outputPath);
          results.push({ part: i + 1, filename, size: stat.size, downloadUrl: `/api/serve-clip/${encodeURIComponent(filename)}` });
        } else {
          results.push({ part: i + 1, error: 'File not created' });
        }
      } catch (e) {
        results.push({ part: i + 1, error: e.message });
      }
    }
    res.json({ success: true, clips: results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));
process.on('uncaughtException', e => console.error('[FATAL]', e.message));
process.on('unhandledRejection', e => console.error('[UNHANDLED]', e));
