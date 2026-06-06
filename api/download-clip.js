const ytdl = require('@distube/ytdl-core');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const TMP = '/tmp';
if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

function formatSeconds(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

const CLIENTS = [
  { name: 'tv_embedded', client: ['tv_embedded'] },
  { name: 'android', client: ['android'] },
  { name: 'web', client: ['web'] },
  { name: 'ios', client: ['ios'] },
  { name: 'mweb', client: ['mweb'] },
];

async function getInfoWithFallbacks(url) {
  for (const { name, client } of CLIENTS) {
    try {
      console.log(`[DL] Trying client: ${name}`);
      const info = await ytdl.getInfo(url, { playerClient: client });
      const format = ytdl.chooseFormat(info.formats, { quality: 'highest', filter: 'audioandvideo' });
      if (format.url) {
        console.log(`[DL] Client ${name} worked: ${format.qualityLabel}`);
        return { info, format };
      }
      console.log(`[DL] Client ${name}: no direct URL, trying next...`);
    } catch (e) {
      console.log(`[DL] Client ${name} failed: ${e.message.substring(0, 100)}`);
    }
  }
  throw new Error('YouTube is blocking downloads from this server. Try again later or use a different video.');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let tempFile = null;
  let outputFile = null;

  try {
    const { url, start, end, title } = req.body;
    if (!url || start === undefined || end === undefined) {
      return res.status(400).json({ error: 'Missing url, start, or end' });
    }

    const videoId = url.match(/(?:watch\?v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/)?.[1];
    if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL' });

    const safeTitle = (title || 'clip').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
    const filename = `${safeTitle}_${videoId}_${Math.floor(start)}-${Math.floor(end)}.mp4`;
    tempFile = path.join(TMP, `full_${videoId}_${Date.now()}.mp4`);
    outputFile = path.join(TMP, filename);

    const { info, format } = await getInfoWithFallbacks(url);

    console.log(`[DL] Downloading full video (${format.qualityLabel})...`);

    const stream = ytdl.downloadFromInfo(info, { format });
    const writeStream = fs.createWriteStream(tempFile);
    await new Promise((resolve, reject) => {
      stream.pipe(writeStream);
      stream.on('end', resolve);
      stream.on('error', reject);
      writeStream.on('error', reject);
    });

    const fullSize = fs.statSync(tempFile).size;
    console.log(`[DL] Full video: ${fullSize} bytes`);

    const startTime = formatSeconds(start);
    const duration = end - start;
    console.log(`[DL] Clipping: ${startTime} +${duration}s`);

    await new Promise((resolve, reject) => {
      execFile(ffmpegPath, [
        '-i', tempFile,
        '-ss', startTime,
        '-t', String(duration),
        '-c', 'copy',
        '-avoid_negative_ts', 'make_zero',
        '-y', outputFile
      ], { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    try { fs.unlinkSync(tempFile); } catch(e) {}
    tempFile = null;

    if (!fs.existsSync(outputFile)) {
      return res.status(500).json({ error: 'Clip creation failed' });
    }

    const clipSize = fs.statSync(outputFile).size;
    console.log(`[DL] Clip: ${filename} (${clipSize} bytes)`);

    const fileData = fs.readFileSync(outputFile);
    try { fs.unlinkSync(outputFile); } catch(e) {}
    outputFile = null;

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', fileData.length);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(fileData);

  } catch (error) {
    console.error('[DL] Error:', error.message || error);
    if (tempFile) try { fs.unlinkSync(tempFile); } catch(e) {}
    if (outputFile) try { fs.unlinkSync(outputFile); } catch(e) {}
    res.status(500).json({ error: error.message || 'Download failed' });
  }
};
