#!/usr/bin/env node
const { execSync, spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const VERSION = '1.0.0';

function banner() {
  console.title('5 Star Links - AI Video Splicer');
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
  if (!tools.ytDlp) { console.log('  ✗ yt-dlp not found. Run: winget install yt-dlp'); return; }
  if (!tools.ffmpeg) { console.log('  ✗ ffmpeg not found. Run: winget install ffmpeg'); return; }

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
