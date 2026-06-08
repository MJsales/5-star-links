#!/usr/bin/env node
const { execSync, spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const VERSION = '1.0.0';
let FFMPEG = 'ffmpeg';
let YTDLP = 'yt-dlp';

function banner() {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║   5 STAR LINKS - AI VIDEO SPLICER v' + VERSION + '  ║');
  console.log('  ║   Turn YouTube into viral TikToks        ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
}

function checkCmd(cmd) {
  try { execSync(cmd + ' --version', { stdio: 'ignore', timeout: 5000 }); return true; } catch { return false; }
}

function findExe(name) {
  // Check system PATH
  if (checkCmd(name)) return name;

  const home = process.env.USERPROFILE || '';

  // Check D:\0ne
  const localPath = 'D:\\0ne\\' + name + '.exe';
  if (fs.existsSync(localPath)) {
    try { execSync('"' + localPath + '" --version', { stdio: 'ignore', timeout: 5000 }); return localPath; } catch {}
  }

  // Scan WinGet packages
  const winGetDir = path.join(home, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages');
  if (fs.existsSync(winGetDir)) {
    try {
      for (const d of fs.readdirSync(winGetDir)) {
        const dp = path.join(winGetDir, d);
        try { if (!fs.statSync(dp).isDirectory()) continue; } catch { continue; }

        // For yt-dlp: exe is directly in package folder
        if (name === 'yt-dlp' && d.toLowerCase().includes('yt-dlp') && !d.toLowerCase().includes('ffmpeg')) {
          const exe = path.join(dp, 'yt-dlp.exe');
          if (fs.existsSync(exe)) {
            try { execSync('"' + exe + '" --version', { stdio: 'ignore', timeout: 5000 }); return exe; } catch {}
          }
        }

        // For ffmpeg: check bin subdirectories
        if (name === 'ffmpeg' && d.toLowerCase().includes('ffmpeg')) {
          try {
            for (const s of fs.readdirSync(dp)) {
              const sp = path.join(dp, s);
              try { if (!fs.statSync(sp).isDirectory()) continue; } catch { continue; }
              const bin = path.join(sp, 'bin');
              try {
                if (fs.existsSync(bin)) {
                  for (const f of fs.readdirSync(bin)) {
                    if (f.toLowerCase() === 'ffmpeg.exe') {
                      const p = path.join(bin, f);
                      try { execSync('"' + p + '" -version', { stdio: 'ignore', timeout: 5000 }); return p; } catch {}
                    }
                  }
                }
              } catch {}
            }
          } catch {}
        }
      }
    } catch {}
  }

  return null;
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

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const full = '"' + cmd + '" ' + args.join(' ');
    exec(full, { timeout: 300000, maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });
}

function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    const cmd = '"' + YTDLP + '" --dump-json --no-download "' + url + '"';
    exec(cmd, { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error('Parse error')); }
    });
  });
}

function downloadVideo(url, outputDir) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(outputDir, 'video.mp4');
    console.log('  Downloading video...');
    const cmd = '"' + YTDLP + '" -f "best[height<=720]" -o "' + outputPath + '" --no-playlist "' + url + '"';
    exec(cmd, { timeout: 300000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || 'Download failed'));
      if (!fs.existsSync(outputPath)) return reject(new Error('File not created'));
      console.log('  ✓ Download complete');
      resolve(outputPath);
    });
  });
}

function clipVideo(inputPath, outputDir, startSec, duration, index, total) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(outputDir, 'clip_' + String(index).padStart(2, '0') + '.mp4');
    console.log('  Creating clip ' + index + '/' + total + ' (' + startSec + 's)...');
    const cmd = '"' + FFMPEG + '" -ss ' + startSec + ' -i "' + inputPath + '" -t ' + duration + ' -c:v libx264 -c:a aac -preset fast -y "' + outputPath + '"';
    exec(cmd, { timeout: 300000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || 'Clip failed'));
      console.log('  ✓ Clip ' + index + ' saved');
      resolve(outputPath);
    });
  });
}

async function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(q, a => { rl.close(); r(a.trim()); }));
}

async function main() {
  banner();

  // Find tools
  let ytDlpPath = findExe('yt-dlp');
  let ffmpegPath = findExe('ffmpeg');

  if (!ytDlpPath) { installTool('yt-dlp', 'yt-dlp.yt-dlp'); ytDlpPath = findExe('yt-dlp'); }
  if (!ffmpegPath) { installTool('ffmpeg', 'yt-dlp.FFmpeg'); ffmpegPath = findExe('ffmpeg'); }

  if (!ytDlpPath) { console.log('  ✗ yt-dlp not found. Run: winget install yt-dlp.yt-dlp'); return; }
  if (!ffmpegPath) { console.log('  ✗ ffmpeg not found. Run: winget install yt-dlp.FFmpeg'); return; }

  YTDLP = ytDlpPath;
  FFMPEG = ffmpegPath;

  const url = await ask('  YouTube URL: ');
  if (!url) { console.log('  No URL entered.'); return; }

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
