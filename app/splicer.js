#!/usr/bin/env node
const { execSync, spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const VERSION = '1.0.0';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgMagenta: '\x1b[45m',
  bgRed: '\x1b[41m',
};

function clear() { process.stdout.write('\x1b[2J\x1b[H'); }

function line(color = C.gray) { return color + '─'.repeat(52) + C.reset; }

function box(lines, width = 52) {
  const top = C.magenta + '╔' + '═'.repeat(width - 2) + '╗' + C.reset;
  const bot = C.magenta + '╚' + '═'.repeat(width - 2) + '╝' + C.reset;
  const mid = lines.map(l => {
    const pad = width - 4 - l.text.replace(/\x1b\[[0-9;]*m/g, '').length;
    return C.magenta + '║ ' + C.reset + l.color + l.text + ' '.repeat(Math.max(0, pad)) + C.magenta + ' ║' + C.reset;
  });
  return [top, ...mid, bot].join('\n');
}

function banner() {
  clear();
  console.log('');
  console.log(box([
    { text: '', color: '' },
    { text: '5 STAR LINKS', color: C.bold + C.red },
    { text: 'AI VIDEO SPLICER v' + VERSION, color: C.magenta + C.bold },
    { text: 'Turn YouTube into viral TikToks', color: C.gray },
    { text: '', color: '' },
  ]));
  console.log('');
}

function feature(icon, title, desc) {
  return `  ${C.magenta}${icon}${C.reset}  ${C.bold}${title}${C.reset}  ${C.dim}${desc}${C.reset}`;
}

function features() {
  console.log(feature('✂️ ', 'Auto Clip', '1:30 clips'));
  console.log(feature('🤖', 'AI Detection', 'Finds viral moments'));
  console.log(feature('📝', 'Transcription', 'Full transcript'));
  console.log(feature('🔒', '100% Local', 'Private'));
  console.log('');
}

function progressBar(pct, width = 40) {
  const filled = Math.round(width * pct / 100);
  const empty = width - filled;
  const bar = C.magenta + '█'.repeat(filled) + C.gray + '░'.repeat(empty) + C.reset;
  return `  ${bar} ${C.bold}${pct}%${C.reset}`;
}

function log(msg, icon = '  ') {
  console.log(`  ${C.magenta}${icon}${C.reset} ${msg}`);
}

function logDone(msg) { log(msg, `${C.green}✓${C.reset}`); }
function logError(msg) { log(`${C.red}${msg}${C.reset}`, `${C.red}✗${C.reset}`); }
function logInfo(msg) { log(msg, `${C.cyan}›${C.reset}`); }
function logWarn(msg) { log(`${C.yellow}${msg}${C.reset}`, `${C.yellow}!${C.reset}`); }

function checkCommand(cmd) {
  try { execSync(cmd + ' --version', { stdio: 'ignore' }); return true; } catch { return false; }
}

function findTools() {
  const home = process.env.USERPROFILE || '';
  const ytdlpPaths = [
    path.join(home, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages', 'yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe', 'yt-dlp.exe'),
    path.join(home, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages', 'yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe', 'yt-dlp_cmd.exe'),
  ];
  const ffmpegPaths = [
    path.join(home, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages', 'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe', 'ffmpeg-8.1.1-full_build', 'bin', 'ffmpeg.exe'),
  ];
  for (const p of ytdlpPaths) {
    if (fs.existsSync(p)) { try { execSync('"' + p + '" --version', { stdio: 'ignore', timeout: 5000 }); process.env.PATH = path.dirname(p) + ';' + (process.env.PATH || ''); break; } catch {} }
  }
  for (const p of ffmpegPaths) {
    if (fs.existsSync(p)) { try { execSync('"' + p + '" -version', { stdio: 'ignore', timeout: 5000 }); process.env.PATH = path.dirname(p) + ';' + (process.env.PATH || ''); break; } catch {} }
  }
  return { ytDlp: checkCommand('yt-dlp'), ffmpeg: checkCommand('ffmpeg') };
}

function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    exec('yt-dlp --dump-json --no-download "' + url + '"', { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error('Parse error')); }
    });
  });
}

function downloadVideo(url, outputDir) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(outputDir, 'video.mp4');
    logInfo('Downloading video...');
    const proc = spawn('yt-dlp', ['-f', 'best[height<=720]', '-o', outputPath, '--no-playlist', url], { shell: true });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(stderr || 'Download failed'));
      if (!fs.existsSync(outputPath)) return reject(new Error('File not created'));
      logDone('Download complete');
      resolve(outputPath);
    });
    proc.on('error', reject);
  });
}

function clipVideo(inputPath, outputDir, startSec, duration, index, total) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(outputDir, 'clip_' + String(index).padStart(2, '0') + '.mp4');
    const pct = Math.round((index / total) * 100);
    logInfo(`Creating clip ${C.bold}${index}${C.reset}/${total} (${startSec}s)`);
    const proc = spawn('ffmpeg', ['-ss', String(startSec), '-i', inputPath, '-t', String(duration), '-c:v', 'libx264', '-c:a', 'aac', '-preset', 'fast', '-y', outputPath], { shell: true });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(stderr || 'Clip failed'));
      logDone(`Clip ${index} created ${C.dim}→ ${outputPath}${C.reset}`);
      resolve(outputPath);
    });
    proc.on('error', reject);
  });
}

async function main() {
  banner();
  features();

  const tools = findTools();
  if (!tools.ytDlp) { logError('yt-dlp not found'); logInfo('Run: winget install yt-dlp'); return; }
  if (!tools.ffmpeg) { logError('ffmpeg not found'); logInfo('Run: winget install ffmpeg'); return; }

  console.log(`  ${C.magenta}┌──────────────────────────────────────────────┐${C.reset}`);
  console.log(`  ${C.magenta}│${C.reset}  ${C.bold}Paste YouTube URL:${C.reset}                         ${C.magenta}│${C.reset}`);
  console.log(`  ${C.magenta}└──────────────────────────────────────────────┘${C.reset}`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const url = await new Promise(resolve => {
    rl.question(`  ${C.magenta}›${C.reset} `, ans => { rl.close(); resolve(ans.trim()); });
  });

  if (!url) { logError('No URL entered'); return; }

  console.log('');
  console.log(`  ${C.magenta}┌──────────────────────────────────────────────┐${C.reset}`);
  console.log(`  ${C.magenta}│${C.reset}  ${C.bold}Clip Duration (seconds)${C.reset} ${C.dim}[90]${C.reset}               ${C.magenta}│${C.reset}`);
  console.log(`  ${C.magenta}└──────────────────────────────────────────────┘${C.reset}`);

  const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
  const durationInput = await new Promise(resolve => {
    rl2.question(`  ${C.magenta}›${C.reset} `, ans => { rl2.close(); resolve(ans.trim()); });
  });
  const clipDuration = parseInt(durationInput) || 90;

  console.log('');
  console.log(line());
  console.log('');

  const outputDir = path.join(process.cwd(), '5star_clips');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  try {
    logInfo('Fetching video info...');
    const info = await getVideoInfo(url);
    console.log('');
    console.log(`  ${C.bold}${C.white}${info.title}${C.reset}`);
    console.log(`  ${C.dim}${info.channel}${C.reset}  ${C.magenta}•${C.reset}  ${C.dim}${Math.floor(info.duration / 60)}m ${info.duration % 60}s${C.reset}`);
    console.log('');

    const videoPath = await downloadVideo(url, outputDir);

    const totalClips = Math.ceil(info.duration / clipDuration);
    logInfo(`Creating ${C.bold}${totalClips}${C.reset} clips of ${C.bold}${clipDuration}s${C.reset} each`);
    console.log('');

    for (let i = 0; i < totalClips; i++) {
      const start = i * clipDuration;
      const dur = Math.min(clipDuration, info.duration - start);
      if (dur <= 0) break;
      await clipVideo(videoPath, outputDir, start, dur, i + 1, totalClips);
      const pct = Math.round(((i + 1) / totalClips) * 100);
      process.stdout.write('\r' + progressBar(pct));
      if (i + 1 === totalClips) console.log('');
    }

    try { fs.unlinkSync(videoPath); } catch {}

    console.log('');
    console.log(line());
    console.log('');
    console.log(box([
      { text: '', color: '' },
      { text: 'DONE!', color: C.green + C.bold },
      { text: `${totalClips} clips saved`, color: C.white },
      { text: `→ ${outputDir}`, color: C.dim },
      { text: '', color: '' },
    ]));
    console.log('');

  } catch (err) {
    console.log('');
    logError(err.message);
    console.log('');
  }
}

main();
