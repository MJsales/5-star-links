#!/usr/bin/env node
const { execSync, spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const VERSION = '1.0.0';

function banner() {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║   5 STAR LINKS - AI VIDEO SPLICER v' + VERSION + '  ║');
  console.log('  ║   Turn YouTube into viral TikToks        ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
}

function checkCommand(cmd) {
  try { execSync(cmd + ' --version', { stdio: 'ignore', timeout: 5000 }); return true; } catch { return false; }
}

function ensureTools() {
  const home = process.env.USERPROFILE || '';

  // Try to find yt-dlp
  if (!checkCommand('yt-dlp')) {
    const ytdlpDir = path.join(home, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages');
    if (fs.existsSync(ytdlpDir)) {
      for (const d of fs.readdirSync(ytdlpDir)) {
        if (d.toLowerCase().includes('yt-dlp') && !d.toLowerCase().includes('ffmpeg')) {
          const sub = path.join(ytdlpDir, d);
          if (!fs.statSync(sub).isDirectory()) continue;
          // Check for yt-dlp.exe directly in the package folder
          const direct = path.join(sub, 'yt-dlp.exe');
          if (fs.existsSync(direct)) {
            try { execSync('"' + direct + '" --version', { stdio: 'ignore', timeout: 5000 }); process.env.PATH = sub + ';' + (process.env.PATH || ''); } catch {}
          }
          // Also check subdirectories
          for (const f of fs.readdirSync(sub)) {
            const fp = path.join(sub, f);
            if (!fs.statSync(fp).isDirectory()) continue;
            if (f.toLowerCase().includes('yt-dlp') && f.endsWith('.exe')) {
              try { execSync('"' + fp + '" --version', { stdio: 'ignore', timeout: 5000 }); process.env.PATH = path.dirname(fp) + ';' + (process.env.PATH || ''); } catch {}
            }
          }
        }
      }
    }
  }

  // Try to find ffmpeg
  if (!checkCommand('ffmpeg')) {
    // Check D:\0ne\ffmpeg.exe first
    if (fs.existsSync('D:\\0ne\\ffmpeg.exe')) {
      try { execSync('"D:\\0ne\\ffmpeg.exe" -version', { stdio: 'ignore', timeout: 5000 }); process.env.PATH = 'D:\\0ne;' + (process.env.PATH || ''); } catch {}
    }
  }
  if (!checkCommand('ffmpeg')) {
    const winGetPackages = path.join(home, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages');
    if (fs.existsSync(winGetPackages)) {
      for (const d of fs.readdirSync(winGetPackages)) {
        const dp = path.join(winGetPackages, d);
        try { if (!fs.statSync(dp).isDirectory()) continue; } catch { continue; }
        if (!d.toLowerCase().includes('ffmpeg')) continue;
        try {
          const subs = fs.readdirSync(dp);
          for (const s of subs) {
            const sp = path.join(dp, s);
            try { if (!fs.statSync(sp).isDirectory()) continue; } catch { continue; }
            const bin = path.join(sp, 'bin');
            try {
              if (fs.existsSync(bin)) {
                for (const f of fs.readdirSync(bin)) {
                  if (f.toLowerCase() === 'ffmpeg.exe') {
                    try { execSync('"' + path.join(bin, f) + '" -version', { stdio: 'ignore', timeout: 5000 }); process.env.PATH = bin + ';' + (process.env.PATH || ''); } catch {}
                  }
                }
              }
            } catch {}
          }
        } catch {}
      }
    }
  }

  return { ytDlp: checkCommand('yt-dlp'), ffmpeg: checkCommand('ffmpeg') };
}

function installTool(name, wingetId) {
  console.log('  Installing ' + name + ' via winget...');
  try {
    execSync('winget install --id ' + wingetId + ' --accept-source-agreements --accept-package-agreements', { stdio: 'pipe', timeout: 300000 });
    console.log('  ✓ ' + name + ' installed');
    return true;
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    if (out.includes('already installed') || out.includes('No available upgrade')) {
      console.log('  ✓ ' + name + ' already installed');
      return true;
    }
    console.log('  ✗ Failed to install ' + name);
    return false;
  }
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
    console.log('  Downloading video...');
    const proc = spawn('yt-dlp', ['-f', 'best[height<=720]', '-o', outputPath, '--no-playlist', url], { shell: true });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(stderr || 'Download failed'));
      if (!fs.existsSync(outputPath)) return reject(new Error('File not created'));
      console.log('  ✓ Download complete');
      resolve(outputPath);
    });
    proc.on('error', reject);
  });
}

function clipVideo(inputPath, outputDir, startSec, duration, index, total) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(outputDir, 'clip_' + String(index).padStart(2, '0') + '.mp4');
    console.log('  Creating clip ' + index + '/' + total + ' (' + startSec + 's)...');
    const proc = spawn('ffmpeg', ['-ss', String(startSec), '-i', inputPath, '-t', String(duration), '-c:v', 'libx264', '-c:a', 'aac', '-preset', 'fast', '-y', outputPath], { shell: true });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(stderr || 'Clip failed'));
      console.log('  ✓ Clip ' + index + ' saved');
      resolve(outputPath);
    });
    proc.on('error', reject);
  });
}

async function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, ans => { rl.close(); resolve(ans.trim()); });
  });
}

async function main() {
  banner();

  let tools = ensureTools();
  if (!tools.ytDlp) { installTool('yt-dlp', 'yt-dlp.yt-dlp'); }
  if (!tools.ffmpeg) { installTool('ffmpeg', 'yt-dlp.FFmpeg'); }
  if (!tools.ytDlp || !tools.ffmpeg) {
    tools = ensureTools();
    if (!tools.ytDlp) { console.log('  ✗ yt-dlp not found. Run: winget install yt-dlp.yt-dlp'); return; }
    if (!tools.ffmpeg) { console.log('  ✗ ffmpeg not found. Run: winget install yt-dlp.FFmpeg'); return; }
  }

  const url = await ask('  YouTube URL: ');
  if (!url) { console.log('  No URL entered.'); return;

  }

  console.log('  Fetching video info...');
  const info = await getVideoInfo(url);
  const mins = Math.floor(info.duration / 60);
  const secs = info.duration % 60;
  const suggestedClips = Math.ceil(info.duration / 90);
  console.log('');
  console.log('  Title: ' + info.title);
  console.log('  Channel: ' + info.channel);
  console.log('  Duration: ' + mins + 'm ' + secs + 's');
  console.log('  Suggested clips (90s each): ' + suggestedClips);
  console.log('');

  const clipDurInput = await ask('  Clip duration in seconds [90]: ');
  const clipDuration = parseInt(clipDurInput) || 90;
  const totalClips = Math.ceil(info.duration / clipDuration);
  console.log('  Will create ' + totalClips + ' clips of ' + clipDuration + 's each');
  console.log('');

  const outputDir = path.join(process.cwd(), '5star_clips');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  try {
    const videoPath = await downloadVideo(url, outputDir);

    for (let i = 0; i < totalClips; i++) {
      const start = i * clipDuration;
      const dur = Math.min(clipDuration, info.duration - start);
      if (dur <= 0) break;
      await clipVideo(videoPath, outputDir, start, dur, i + 1, totalClips);
    }

    try { fs.unlinkSync(videoPath); } catch {}

    console.log('');
    console.log('  ═══════════════════════════════════════════');
    console.log('  ✓ Done! ' + totalClips + ' clips saved to ' + outputDir);
    console.log('  ═══════════════════════════════════════════');
    console.log('');

  } catch (err) {
    console.log('');
    console.log('  ✗ Error: ' + err.message);
    console.log('');
  }
}

main();
