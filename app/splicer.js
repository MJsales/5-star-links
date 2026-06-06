#!/usr/bin/env node
/**
 * 5 Star Links - AI Video Splicer
 * Turn YouTube videos into viral TikTok clips.
 * Standalone executable - no Python needed.
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

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
  try {
    const flag = cmd === 'ffmpeg' ? '-version' : '--version';
    execSync(cmd + ' ' + flag, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function findYtDlp() {
  if (checkCommand('yt-dlp')) return true;

  const home = process.env.USERPROFILE || 'C:\\Users\\abby';
  const ytdlpPath = path.join(home, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages', 'yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe', 'yt-dlp.exe');
  try {
    execSync('"' + ytdlpPath + '" --version', { stdio: 'ignore', timeout: 5000 });
    process.env.PATH = path.dirname(ytdlpPath) + ';' + (process.env.PATH || '');
    return true;
  } catch {}

  return false;
}

function findFfmpeg() {
  if (checkCommand('ffmpeg')) return true;

  const home = process.env.USERPROFILE || 'C:\\Users\\abby';
  const knownPaths = [
    path.join(home, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages', 'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe', 'ffmpeg-8.1.1-full_build', 'bin', 'ffmpeg.exe'),
    path.join(__dirname, 'ffmpeg.exe'),
  ];

  for (const p of knownPaths) {
    try {
      execSync('"' + p + '" -version', { stdio: 'ignore', timeout: 5000 });
      process.env.PATH = path.dirname(p) + ';' + (process.env.PATH || '');
      return true;
    } catch {}
  }

  return false;
}

function checkDeps() {
  const missing = [];
  if (!findYtDlp()) missing.push('yt-dlp');
  if (!findFfmpeg()) missing.push('ffmpeg');
  return missing;
}

function installYtDlp() {
  console.log('[*] Installing yt-dlp...');
  try {
    execSync('pip install -U yt-dlp', { stdio: 'inherit' });
  } catch {
    try {
      execSync('pip3 install -U yt-dlp', { stdio: 'inherit' });
    } catch {
      console.log('[!] Could not install yt-dlp automatically.');
      console.log('    Install manually: https://github.com/yt-dlp/yt-dlp');
      console.log('    Or: winget install yt-dlp');
      process.exit(1);
    }
  }
}

function getVideoInfo(url) {
  console.log('[*] Getting video info...');
  const cmd = `yt-dlp --dump-json --no-download --no-warnings --no-check-certificates "${url}"`;
  const output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(output);
}

function downloadVideo(url, outputPath) {
  console.log('[*] Downloading video (this may take a while)...');
  const cmd = `yt-dlp -f "bestvideo[height<=720]+bestaudio/best[height<=720]/best" --merge-output-format mp4 -o "${outputPath}" --no-warnings --no-check-certificates "${url}"`;
  execSync(cmd, { stdio: 'inherit' });
  return outputPath;
}

function downloadWhisperModel() {
  const modelDir = path.join(getWhisperDir(), 'models');
  if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });

  const modelFile = path.join(modelDir, 'ggml-base.en.bin');
  if (fs.existsSync(modelFile)) return;

  console.log('[*] Downloading Whisper AI model (~150MB, one-time)...');
  const url = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin';
  downloadFileSync(url, modelFile);
  console.log('[+] Whisper model downloaded.');
}

function getWhisperDir() {
  const home = process.env.USERPROFILE || process.env.HOME || '.';
  return path.join(home, '.5starlinks');
}

function downloadFileSync(url, dest) {
  const file = fs.createWriteStream(dest);
  return new Promise((resolve, reject) => {
    const follow = (u) => {
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, { headers: { 'User-Agent': '5starlinks/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          follow(res.headers.location);
          return;
        }
        const total = parseInt(res.headers['content-length'], 10);
        let downloaded = 0;
        res.on('data', (chunk) => {
          downloaded += chunk.length;
          if (total) {
            const pct = ((downloaded / total) * 100).toFixed(0);
            process.stdout.write(`\r    Downloading... ${pct}%`);
          }
        });
        res.pipe(file);
        file.on('finish', () => { file.close(); console.log(''); resolve(); });
      }).on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
    };
    follow(url);
  });
}

function transcribeWithWhisper(videoPath) {
  console.log('[*] Transcribing with Whisper AI...');

  const modelDir = path.join(getWhisperDir(), 'models');
  const modelFile = path.join(modelDir, 'ggml-base.en.bin');

  const outDir = path.dirname(videoPath);
  const srtPath = path.join(outDir, 'transcript.srt');
  const txtPath = path.join(outDir, 'transcript.txt');

  // Try whisper.cpp first, fall back to python whisper
  try {
    const cmd = `whisper -m "${modelFile}" -f "${videoPath}" --output-dir "${outDir}" --output-format srt --language en`;
    execSync(cmd, { stdio: 'pipe' });
  } catch {
    // If whisper.cpp not available, use python whisper
    try {
      const cmd = `python -c "import whisper; m=whisper.load_model('base'); r=m.transcribe('${videoPath.replace(/\\/g, '\\\\')}'); [print(f'[{int(s[\"start\"]//60)}:{int(s[\"start\"]%60):02d} -> {int(s[\"end\"]//60)}:{int(s[\"end\"]%60):02d}] {s[\"text\"]}') for s in r['segments']]" > "${txtPath}"`;
      execSync(cmd, { stdio: 'pipe' });
    } catch {
      console.log('[!] Transcription failed. Install whisper:');
      console.log('    pip install openai-whisper');
      console.log('    Or download whisper.cpp: https://github.com/ggerganov/whisper.cpp');
      return null;
    }
  }

  // Parse transcript
  const segments = [];
  if (fs.existsSync(srtPath)) {
    const srt = fs.readFileSync(srtPath, 'utf-8');
    const blocks = srt.split('\n\n');
    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length >= 3) {
        const timeMatch = lines[1].match(/(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})/);
        if (timeMatch) {
          const start = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000;
          const end = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8]) / 1000;
          const text = lines.slice(2).join(' ').trim();
          segments.push({ start, end, text });
        }
      }
    }
  } else if (fs.existsSync(txtPath)) {
    const lines = fs.readFileSync(txtPath, 'utf-8').split('\n');
    for (const line of lines) {
      const m = line.match(/\[(\d+):(\d+) -> (\d+):(\d+)\]\s*(.*)/);
      if (m) {
        segments.push({
          start: parseInt(m[1]) * 60 + parseInt(m[2]),
          end: parseInt(m[3]) * 60 + parseInt(m[4]),
          text: m[5]
        });
      }
    }
  }

  return { segments };
}

function scoreSegment(text) {
  let score = 50;
  const lower = text.toLowerCase();

  const emotional = ['insane','crazy','unbelievable','shocking','secret','hidden',
    'truth','exposed','never','always','wrong','right','proof','mind','blow',
    'wow','omg','damn','wild','legend','fail','win','destroy','beat',
    'nightmare','scary','hilarious','funny','best','worst','first','last','only'];
  for (const w of emotional) {
    if (lower.includes(w)) score += 8;
  }

  if (text.includes('?')) score += 10;
  if (text.includes('!')) score += 5;

  const controversy = ['controversy','debate','argument','fight','disagree','lie','fake','real','truth','fact','actually'];
  for (const w of controversy) {
    if (lower.includes(w)) score += 6;
  }

  return Math.min(score, 99);
}

function findViralMoments(transcript, duration, numClips) {
  const segments = transcript?.segments || [];
  if (segments.length === 0) return [];

  const clipLen = 35;
  const numParts = Math.max(2, Math.min(numClips, Math.ceil(duration / clipLen)));
  const partDuration = duration / numParts;
  const clips = [];

  for (let p = 0; p < numParts; p++) {
    const partStart = p * partDuration;
    const partEnd = Math.min((p + 1) * partDuration, duration);

    let bestScore = 0;
    let bestText = '';
    for (const seg of segments) {
      if (seg.start >= partStart - 5 && seg.start <= partEnd + 5) {
        const s = scoreSegment(seg.text);
        if (s > bestScore) {
          bestScore = s;
          bestText = seg.text;
        }
      }
    }

    const peak = p === 0 ? 'hook' : p === numParts - 1 ? 'cliffhanger' : p === Math.floor(numParts / 2) ? 'climax' : 'buildup';

    clips.push({
      part: p + 1,
      start: partStart,
      end: partEnd,
      score: bestScore,
      peak,
      text: bestText.substring(0, 200)
    });
  }

  return clips;
}

function clipVideo(videoPath, start, end, outputPath) {
  const duration = end - start;
  try {
    const cmd = `ffmpeg -y -ss ${start} -i "${videoPath}" -t ${duration} -c:v libx264 -preset fast -c:a aac -movflags +faststart "${outputPath}"`;
    execSync(cmd, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

async function main() {
  banner();

  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(r => rl.question(q, r));

  // Check dependencies first
  const missing = checkDeps();
  if (missing.includes('yt-dlp')) {
    console.log('[*] yt-dlp not found. Installing...');
    installYtDlp();
  }
  if (missing.includes('ffmpeg')) {
    console.log('[*] FFmpeg not found. Trying to install...');
    try {
      if (process.platform === 'win32') {
        execSync('winget install ffmpeg --accept-package-agreements --accept-source-agreements', { stdio: 'inherit' });
      } else if (process.platform === 'darwin') {
        execSync('brew install ffmpeg', { stdio: 'inherit' });
      } else {
        execSync('sudo apt install -y ffmpeg', { stdio: 'inherit' });
      }
      console.log('[+] FFmpeg installed!');
    } catch {
      console.log('');
      console.log('[!] Could not install FFmpeg automatically.');
      console.log('    Install it manually, then run this tool again:');
      console.log('    Windows: winget install ffmpeg');
      console.log('    Mac:     brew install ffmpeg');
      console.log('    Linux:   sudo apt install ffmpeg');
      console.log('');
      await ask('Press Enter to exit...');
      process.exit(1);
    }
  }

  // Get URL from args or prompt
  let url = process.argv[2];
  let numClips = parseInt(process.argv[3]) || 5;

  if (!url) {
    console.log('  Paste a YouTube URL below:');
    console.log('');
    url = await ask('  YouTube URL: ');
    url = url.trim();
    if (!url) {
      console.log('  No URL entered.');
      await ask('  Press Enter to exit...');
      process.exit(0);
    }
    const clipsInput = await ask('  How many clips? (default 5): ');
    numClips = parseInt(clipsInput) || 5;
  }

  console.log('');

  // Get video info
  let info;
  try {
    info = getVideoInfo(url);
  } catch (e) {
    console.log('[!] Failed to get video info. Check the URL.');
    await ask('Press Enter to exit...');
    process.exit(1);
  }

  const title = info.title || 'video';
  const duration = info.duration || 0;
  const videoId = info.id || 'unknown';

  console.log(`[+] Title: ${title}`);
  console.log(`[+] Duration: ${formatTime(duration)}`);
  console.log(`[+] Creator: ${info.uploader || 'Unknown'}`);

  // Create work directory
  const safeTitle = title.replace(/[^\w\-]/g, '_').substring(0, 50);
  const workDir = path.join(process.cwd(), '5star_clips', safeTitle);
  if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });

  // Download video
  const videoPath = path.join(workDir, `${safeTitle}.mp4`);
  try {
    downloadVideo(url, videoPath);
  } catch (e) {
    console.log('[!] Download failed. Check the URL and try again.');
    process.exit(1);
  }

  // Transcribe
  let transcript = null;
  try {
    transcript = transcribeWithWhisper(videoPath);
  } catch (e) {
    console.log('[!] Transcription failed. Continuing without transcript...');
  }

  // Find viral moments
  let clips = findViralMoments(transcript, duration, numClips);

  // Fallback: if no transcript, split into equal segments
  if (clips.length === 0) {
    console.log('[*] No transcript available. Splitting into equal segments...');
    const clipDuration = Math.min(35, duration / numClips);
    for (let i = 0; i < numClips; i++) {
      const start = Math.floor((duration / numClips) * i);
      const end = Math.min(Math.floor(start + clipDuration), duration);
      clips.push({
        part: i + 1,
        start,
        end,
        score: 50,
        text: `Segment ${i + 1}`,
        peak: 'cliffhanger'
      });
    }
  }

  console.log('');
  console.log(`[+] Found ${clips.length} viral moments:`);
  console.log('');

  const results = [];
  for (const clip of clips) {
    const peakIcon = { hook: '🪝', climax: '🔥', cliffhanger: '🪢', buildup: '📈' }[clip.peak] || '📹';
    console.log(`  Part ${clip.part} | ${peakIcon} ${clip.peak.toUpperCase()} | Score: ${clip.score}%`);
    console.log(`  ⏱ ${formatTime(clip.start)} → ${formatTime(clip.end)}`);
    console.log(`  📝 "${clip.text.substring(0, 80)}..."`);
    console.log('');

    const clipName = `clip_part${clip.part}_${clip.peak}.mp4`;
    const clipPath = path.join(workDir, clipName);

    if (clipVideo(videoPath, clip.start, clip.end, clipPath)) {
      const size = formatSize(fs.statSync(clipPath).size);
      console.log(`  ✅ Saved: ${clipName} (${size})`);
      results.push({
        part: clip.part,
        file: clipName,
        start: formatTime(clip.start),
        end: formatTime(clip.end),
        score: clip.score,
        peak: clip.peak
      });
    } else {
      console.log(`  ❌ Failed to create ${clipName}`);
    }
    console.log('');
  }

  // Save summary
  const summary = {
    title,
    url,
    duration: formatTime(duration),
    clips: results
  };
  fs.writeFileSync(path.join(workDir, 'summary.json'), JSON.stringify(summary, null, 2));

  console.log('═'.repeat(50));
  console.log(`  DONE! ${results.length} clips created in:`);
  console.log(`  📁 ${workDir}`);
  console.log(`  📋 Summary: summary.json`);
  console.log('═'.repeat(50));
  console.log('');
  console.log('Press Enter to exit...');
  await new Promise(r => process.stdin.once('data', r));
}

main().catch(e => {
  console.error('[!] Error:', e.message);
  console.log('');
  console.log('Press Enter to exit...');
  process.stdin.once('data', () => process.exit(1));
});
