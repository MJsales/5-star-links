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
  try { execSync(cmd + ' --version', { stdio: 'ignore' }); return true; } catch { return false; }
}

function findTools() {
  const home = process.env.USERPROFILE || '';
  const winGetBase = path.join(home, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages');
  let ytDlpPath = null;
  let ffmpegPath = null;

  if (fs.existsSync(winGetBase)) {
    for (const dir of fs.readdirSync(winGetBase)) {
      const dirPath = path.join(winGetBase, dir);
      if (!fs.statSync(dirPath).isDirectory()) continue;

      if (dir.toLowerCase().includes('yt-dlp') && !dir.toLowerCase().includes('ffmpeg')) {
        for (const f of fs.readdirSync(dirPath)) {
          const fp = path.join(dirPath, f);
          if (!fs.statSync(fp).isDirectory()) continue;
          if (f.toLowerCase().includes('yt-dlp') && f.endsWith('.exe')) {
            try { execSync('"' + fp + '" --version', { stdio: 'ignore', timeout: 5000 }); ytDlpPath = fp; process.env.PATH = path.dirname(fp) + ';' + (process.env.PATH || ''); } catch {}
          }
        }
      }
      if (dir.toLowerCase().includes('ffmpeg')) {
        for (const sub of fs.readdirSync(dirPath)) {
          const subPath = path.join(dirPath, sub);
          if (!fs.statSync(subPath).isDirectory()) continue;
          const binDir = fs.existsSync(path.join(subPath, 'bin')) ? path.join(subPath, 'bin') : subPath;
          if (!fs.existsSync(binDir)) continue;
          for (const f of fs.readdirSync(binDir)) {
            if (f.toLowerCase() === 'ffmpeg.exe') {
              const p = path.join(binDir, f);
              try { execSync('"' + p + '" -version', { stdio: 'ignore', timeout: 5000 }); ffmpegPath = p; process.env.PATH = path.dirname(p) + ';' + (process.env.PATH || ''); } catch {}
            }
          }
        }
      }
    }
  }

  // Also check D:\0ne\ffmpeg.exe
  if (!ffmpegPath && fs.existsSync('D:\\0ne\\ffmpeg.exe')) {
    ffmpegPath = 'D:\\0ne\\ffmpeg.exe';
    process.env.PATH = 'D:\\0ne;' + (process.env.PATH || '');
  }

  return { ytDlp: !!ytDlpPath, ffmpeg: !!ffmpegPath, ytDlpPath, ffmpegPath };
}

function installTool(name, wingetIds) {
  const ids = Array.isArray(wingetIds) ? wingetIds : [wingetIds];
  console.log(`  Installing ${name} via winget...`);
  for (const id of ids) {
    try {
      execSync(`winget install --id ${id} --accept-source-agreements --accept-package-agreements`, { stdio: 'pipe', timeout: 300000 });
      console.log(`  ✓ ${name} installed`);
      return true;
    } catch (e) {
      const out = (e.stdout || '') + (e.stderr || '');
      if (out.includes('already installed') || out.includes('No available upgrade')) {
        console.log(`  ✓ ${name} already installed`);
        return true;
      }
    }
  }
  console.log(`  ✗ Failed to install ${name}`);
  return false;
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
    console.log(`  Creating clip ${index}/${total} (${startSec}s)...`);
    const proc = spawn('ffmpeg', ['-ss', String(startSec), '-i', inputPath, '-t', String(duration), '-c:v', 'libx264', '-c:a', 'aac', '-preset', 'fast', '-y', outputPath], { shell: true });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(stderr || 'Clip failed'));
      console.log(`  ✓ Clip ${index} saved`);
      resolve(outputPath);
    });
    proc.on('error', reject);
  });
}

async function main() {
  banner();

  const tools = findTools();
  if (!tools.ytDlp) { installTool('yt-dlp', ['yt-dlp.yt-dlp']); }
  if (!tools.ffmpeg) { installTool('ffmpeg', ['yt-dlp.FFmpeg', 'Gyan.FFmpeg']); }

  const tools2 = findTools();
  if (!tools2.ytDlp) { console.log('  ✗ yt-dlp still missing. Run: winget install yt-dlp.yt-dlp'); return; }
  if (!tools2.ffmpeg) { console.log('  ✗ ffmpeg still missing. Run: winget install Gyan.FFmpeg'); return; }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const url = await new Promise(resolve => {
    rl.question('  YouTube URL: ', ans => { rl.close(); resolve(ans.trim()); });
  });

  if (!url) { console.log('  No URL entered.'); return; }

  const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
  const durationInput = await new Promise(resolve => {
    rl2.question('  Clip duration in seconds [90]: ', ans => { rl2.close(); resolve(ans.trim()); });
  });
  const clipDuration = parseInt(durationInput) || 90;

  console.log('');

  const outputDir = path.join(process.cwd(), '5star_clips');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  try {
    console.log('  Fetching video info...');
    const info = await getVideoInfo(url);
    console.log(`  Title: ${info.title}`);
    console.log(`  Channel: ${info.channel}`);
    console.log(`  Duration: ${Math.floor(info.duration / 60)}m ${info.duration % 60}s`);

    const videoPath = await downloadVideo(url, outputDir);

    const totalClips = Math.ceil(info.duration / clipDuration);
    console.log(`  Creating ${totalClips} clips of ${clipDuration}s each...`);
    console.log('');

    for (let i = 0; i < totalClips; i++) {
      const start = i * clipDuration;
      const dur = Math.min(clipDuration, info.duration - start);
      if (dur <= 0) break;
      await clipVideo(videoPath, outputDir, start, dur, i + 1, totalClips);
    }

    try { fs.unlinkSync(videoPath); } catch {}

    console.log('');
    console.log('  ═══════════════════════════════════════════');
    console.log(`  ✓ Done! ${totalClips} clips saved to ${outputDir}`);
    console.log('  ═══════════════════════════════════════════');
    console.log('');

  } catch (err) {
    console.log('');
    console.log(`  ✗ Error: ${err.message}`);
    console.log('');
  }
}

main();
