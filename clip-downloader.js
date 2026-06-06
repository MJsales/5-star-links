const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DOWNLOADS = path.join(os.tmpdir(), '5star-videos');
if (!fs.existsSync(DOWNLOADS)) fs.mkdirSync(DOWNLOADS, { recursive: true });

function formatSeconds(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

const args = process.argv.slice(2);
if (args.length < 4) {
  console.error('Usage: node clip-downloader.js <url> <startSec> <endSec> <outputFilename>');
  process.exit(1);
}

const [url, startStr, endStr, filename] = args;
const startSec = parseFloat(startStr);
const endSec = parseFloat(endStr);
const outputPath = path.join(DOWNLOADS, filename);

const startTime = formatSeconds(startSec);
const endTime = formatSeconds(endSec);

try {
  execFileSync('yt-dlp', [
    '--extractor-args', 'youtube:player_client=android',
    '--download-sections', `*${startTime}-${endTime}`,
    '-f', 'best[ext=mp4]',
    '--force-keyframes-at-cuts',
    '--no-playlist', '--no-warnings',
    '-o', outputPath,
    url
  ], { timeout: 120000, maxBuffer: 50 * 1024 * 1024 });

  if (!fs.existsSync(outputPath)) {
    const partFile = outputPath + '.part';
    if (fs.existsSync(partFile)) fs.renameSync(partFile, outputPath);
  }

  if (fs.existsSync(outputPath)) {
    const stat = fs.statSync(outputPath);
    console.log(JSON.stringify({ success: true, path: outputPath, size: stat.size }));
  } else {
    console.error(JSON.stringify({ error: 'File not created' }));
    process.exit(1);
  }
} catch (e) {
  console.error(JSON.stringify({ error: e.message }));
  process.exit(1);
}
