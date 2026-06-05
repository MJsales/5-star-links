require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { execSync, spawn } = require('child_process');
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

// Clean old files every 30 minutes
setInterval(() => {
  const now = Date.now();
  fs.readdirSync(DOWNLOADS_DIR).forEach(f => {
    const fp = path.join(DOWNLOADS_DIR, f);
    if (now - fs.statSync(fp).mtimeMs > 30 * 60 * 1000) {
      try { fs.unlinkSync(fp); } catch(e) {}
    }
  });
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
    items.forEach(item => {
      const product = products[item.id];
      if (product) totalAmount += product.price * (item.quantity || 1);
    });
    if (totalAmount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/confirm-payment', async (req, res) => {
  res.json({ success: true });
});

// Get video info using yt-dlp
app.post('/api/video-info', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'No URL' });

    const result = execSync(
      `yt-dlp --dump-json --no-download "${url}"`,
      { timeout: 30000, maxBuffer: 10 * 1024 * 1024, encoding: 'utf-8' }
    );
    const info = JSON.parse(result);

    res.json({
      id: info.id,
      title: info.title,
      duration: info.duration,
      uploader: info.uploader,
      view_count: info.view_count,
      upload_date: info.upload_date,
      thumbnail: info.thumbnail,
      description: (info.description || '').substring(0, 1000),
      chapters: (info.chapters || []).map(c => ({
        title: c.title,
        start: c.start_time,
        end: c.end_time
      })),
      formats: (info.formats || [])
        .filter(f => f.ext === 'mp4' && f.vcodec !== 'none')
        .map(f => ({
          format_id: f.format_id,
          ext: f.ext,
          resolution: f.resolution,
          fps: f.fps,
          filesize: f.filesize
        }))
        .slice(0, 5)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Download a clip from YouTube video
app.post('/api/download-clip', async (req, res) => {
  try {
    const { url, start, end, title } = req.body;
    if (!url || start === undefined || end === undefined) {
      return res.status(400).json({ error: 'Missing url, start, or end' });
    }

    const videoId = url.match(/(?:watch\?v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/)?.[1];
    if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL' });

    const safeTitle = (title || 'clip').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
    const filename = `${safeTitle}_${videoId}_${start}-${end}.mp4`;
    const outputPath = path.join(DOWNLOADS_DIR, filename);

    // Use yt-dlp to download just the section
    const startTime = typeof start === 'number' ? formatSeconds(start) : start;
    const endTime = typeof end === 'number' ? formatSeconds(end) : end;

    const cmd = `yt-dlp --download-sections "*${startTime}-${endTime}" -f "best[ext=mp4]" --force-keyframes-at-cuts --no-playlist -o "${outputPath}" "${url}"`;

    execSync(cmd, { timeout: 120000, maxBuffer: 50 * 1024 * 1024 });

    if (!fs.existsSync(outputPath)) {
      return res.status(500).json({ error: 'Download failed' });
    }

    const stat = fs.statSync(outputPath);
    res.json({
      success: true,
      filename,
      size: stat.size,
      downloadUrl: `/api/serve-clip/${encodeURIComponent(filename)}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve the clipped video file
app.get('/api/serve-clip/:filename', (req, res) => {
  const filename = decodeURIComponent(req.params.filename);
  const filePath = path.join(DOWNLOADS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found or expired' });
  }

  const stat = fs.statSync(filePath);
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  fs.createReadStream(filePath).pipe(res);
});

// Download all clips as a zip
app.post('/api/download-all', async (req, res) => {
  try {
    const { url, clips, title } = req.body;
    if (!url || !clips || clips.length === 0) {
      return res.status(400).json({ error: 'Missing url or clips' });
    }

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

      const cmd = `yt-dlp --download-sections "*${startTime}-${endTime}" -f "best[ext=mp4]" --force-keyframes-at-cuts --no-playlist -o "${outputPath}" "${url}"`;

      try {
        execSync(cmd, { timeout: 120000, maxBuffer: 50 * 1024 * 1024 });
        const stat = fs.statSync(outputPath);
        results.push({
          part: i + 1,
          filename,
          size: stat.size,
          downloadUrl: `/api/serve-clip/${encodeURIComponent(filename)}`
        });
      } catch (e) {
        results.push({ part: i + 1, error: e.message });
      }
    }

    res.json({ success: true, clips: results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function formatSeconds(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
