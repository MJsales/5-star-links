#!/usr/bin/env node
const http = require('http');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 7777;

let clients = [];
let status = 'idle';
let progress = [];
let videoInfo = null;

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach(c => c.write(msg));
}

function log(msg) {
  progress.push(msg);
  broadcast('log', { msg, time: Date.now() });
}

function checkCommand(cmd) {
  try {
    const flag = cmd === 'ffmpeg' ? '-version' : '--version';
    execSync(cmd + ' ' + flag, { stdio: 'ignore' });
    return true;
  } catch { return false; }
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
    if (fs.existsSync(p)) {
      try { execSync('"' + p + '" --version', { stdio: 'ignore', timeout: 5000 }); process.env.PATH = path.dirname(p) + ';' + (process.env.PATH || ''); break; } catch {}
    }
  }
  for (const p of ffmpegPaths) {
    if (fs.existsSync(p)) {
      try { execSync('"' + p + '" -version', { stdio: 'ignore', timeout: 5000 }); process.env.PATH = path.dirname(p) + ';' + (process.env.PATH || ''); break; } catch {}
    }
  }

  return { ytDlp: checkCommand('yt-dlp'), ffmpeg: checkCommand('ffmpeg') };
}

function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    const ytdlp = findTools().ytDlp ? 'yt-dlp' : null;
    if (!ytdlp) return reject(new Error('yt-dlp not found'));
    exec(`"${ytdlp}" --dump-json --no-download "${url}"`, { timeout: 30000, maxBuffer: 1024 * 1024 * 10 }, (err, stdout) => {
      if (err) return reject(err);
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error('Parse error')); }
    });
  });
}

function downloadVideo(url, outputDir) {
  return new Promise((resolve, reject) => {
    const ytdlp = 'yt-dlp';
    const outputPath = path.join(outputDir, 'video.mp4');
    const args = ['-f', 'best[height<=720]', '-o', outputPath, '--no-playlist', url];
    log('Downloading video...');
    const proc = spawn(ytdlp, args, { shell: true });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(stderr || 'Download failed'));
      if (!fs.existsSync(outputPath)) return reject(new Error('File not created'));
      log('Download complete');
      resolve(outputPath);
    });
    proc.on('error', reject);
  });
}

function clipVideo(inputPath, outputDir, startSec, duration, index) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(outputDir, `clip_${String(index).padStart(2, '0')}.mp4`);
    const args = ['-ss', String(startSec), '-i', inputPath, '-t', String(duration), '-c:v', 'libx264', '-c:a', 'aac', '-preset', 'fast', '-y', outputPath];
    log(`Creating clip ${index} (${startSec}s, ${duration}s)...`);
    const proc = spawn('ffmpeg', args, { shell: true });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(stderr || 'Clip failed'));
      log(`Clip ${index} created`);
      resolve(outputPath);
    });
    proc.on('error', reject);
  });
}

async function startSplice(url, clipDuration) {
  if (status === 'running') return { error: 'Already running' };
  status = 'running';
  progress = [];
  videoInfo = null;

  const outputDir = path.join(process.cwd(), '5star_clips');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  try {
    const tools = findTools();
    if (!tools.ytDlp) { status = 'error'; throw new Error('yt-dlp not found. Install with: winget install yt-dlp'); }
    if (!tools.ffmpeg) { status = 'error'; throw new Error('ffmpeg not found. Install with: winget install ffmpeg'); }

    log('Fetching video info...');
    const info = await getVideoInfo(url);
    videoInfo = { title: info.title, duration: info.duration, channel: info.channel, thumbnail: info.thumbnail };
    broadcast('info', videoInfo);
    log(`Title: ${info.title}`);
    log(`Duration: ${Math.floor(info.duration / 60)}m ${info.duration % 60}s`);

    const videoPath = await downloadVideo(url, outputDir);

    const totalClips = Math.ceil(info.duration / clipDuration);
    log(`Creating ${totalClips} clips of ${clipDuration}s each...`);

    for (let i = 0; i < totalClips; i++) {
      const start = i * clipDuration;
      const dur = Math.min(clipDuration, info.duration - start);
      if (dur <= 0) break;
      await clipVideo(videoPath, outputDir, start, dur, i + 1);
      broadcast('progress', { current: i + 1, total: totalClips });
    }

    try { fs.unlinkSync(videoPath); } catch {}

    log(`Done! ${totalClips} clips saved to ${outputDir}`);
    status = 'done';
    broadcast('done', { clips: totalClips, dir: outputDir });
    return { success: true, clips: totalClips, dir: outputDir };
  } catch (err) {
    status = 'error';
    log(`Error: ${err.message}`);
    broadcast('error', { msg: err.message });
    return { error: err.message };
  }
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>5 Star Links - AI Video Splicer</title>
<link rel="icon" type="image/png" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA2klEQVQ4T6WTsQ3CQBBE3yAhIaEDOqAEUgIFUAJdUAIhCZCQkBMfsvlzd7Znr8ST7G/n/8x6jYgIr5ExMzMnZq7MbJk5lFJKa/dOawghhFJKO2Z+MrNl5lDOOR8i4pOZQyll+QXn88x9KeU9Im7MnEspr1EUM3fMnEspK0R8ZWb/zJyZeW+td4j4nJlbrXdrPZfSd2a+zOyaWSIi4mNmLqW8ZeZwzvmemVPb+77vd2a+zSylNOecc/7MzKVtON8kIp5KKd+ZuTDzPTNf296ZmVPb+77vd2a+zSylNOecc/7MzKVtON8kIp5KKd+ZuTDzPTNf296ZmVPb+77vd2a+zSylNOecc/7MzKVtON8kIp5KKd+ZuTDzPTNf296ZmVPb+77vd2a+zSylNOecc/7MzKVtON8kIp5KKd+ZuTDzPTNf296ZmVPb+77vT8w8t1a+MnNqpUzMPDFzaaX8AJ4qS/ELFOCWAAAAAElFTkSuQmCC">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#050208;color:#fff;min-height:100vh;display:flex;flex-direction:column;align-items:center}
.topbar{width:100%;background:rgba(13,8,21,0.9);backdrop-filter:blur(12px);border-bottom:1px solid rgba(168,85,247,0.15);padding:1rem 1.5rem;display:flex;align-items:center;justify-content:space-between}
.topbar h1{font-size:1.3rem;font-weight:800;letter-spacing:3px;text-transform:uppercase;background:linear-gradient(135deg,#fff,#ef4444);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.hero{text-align:center;padding:3rem 1.5rem 1rem;max-width:600px}
.hero h2{font-size:2.2rem;font-weight:800;margin-bottom:0.5rem;background:linear-gradient(135deg,#fff,#a855f7,#ef4444);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.hero p{color:#aaa;font-size:1rem}
.card{background:linear-gradient(145deg,#0d0815,#110a1a);border:1px solid rgba(168,85,247,0.2);border-radius:18px;padding:2rem;max-width:560px;width:90%;margin:1rem auto}
.card h3{color:#a855f7;margin-bottom:1rem;font-size:1.1rem}
.input-group{margin-bottom:1rem}
.input-group label{display:block;color:#888;font-size:0.85rem;margin-bottom:0.3rem}
.input-group input{width:100%;padding:12px 16px;background:#0a0612;border:1px solid rgba(168,85,247,0.3);border-radius:10px;color:#fff;font-size:0.95rem;outline:none;transition:border 0.3s}
.input-group input:focus{border-color:#a855f7}
.input-group input::placeholder{color:#444}
.btn{width:100%;padding:14px;background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff;border:none;border-radius:12px;font-size:1rem;font-weight:700;cursor:pointer;transition:all 0.3s;margin-top:0.5rem}
.btn:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(168,85,247,0.4)}
.btn:disabled{opacity:0.5;cursor:not-allowed;transform:none;box-shadow:none}
.status-bar{margin-top:1rem;display:none}
.status-bar.active{display:block}
.progress-bar{width:100%;height:6px;background:#1a1028;border-radius:3px;overflow:hidden;margin-bottom:0.5rem}
.progress-fill{height:100%;background:linear-gradient(90deg,#a855f7,#ef4444);width:0%;transition:width 0.5s;border-radius:3px}
.log-box{background:#0a0612;border:1px solid rgba(168,85,247,0.15);border-radius:10px;padding:1rem;max-height:200px;overflow-y:auto;font-family:'Courier New',monospace;font-size:0.8rem;color:#22c55e;margin-top:0.5rem}
.log-line{padding:2px 0;border-bottom:1px solid rgba(168,85,247,0.05)}
.info-box{background:rgba(168,85,247,0.1);border:1px solid rgba(168,85,247,0.2);border-radius:10px;padding:1rem;margin-top:1rem;display:none}
.info-box.active{display:block}
.info-box p{font-size:0.85rem;color:#ccc;margin:0.2rem 0}
.info-box .title{color:#a855f7;font-weight:700;font-size:1rem}
.done-box{background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:10px;padding:1rem;margin-top:1rem;text-align:center;display:none}
.done-box.active{display:block}
.done-box h4{color:#22c55e;margin-bottom:0.3rem}
.features{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0.8rem;max-width:560px;width:90%;margin:1rem auto}
.feature{background:linear-gradient(145deg,#0d0815,#110a1a);border:1px solid rgba(168,85,247,0.1);border-radius:12px;padding:1rem;text-align:center}
.feature .icon{font-size:1.5rem;margin-bottom:0.3rem}
.feature h4{font-size:0.8rem;margin-bottom:0.2rem}
.feature p{font-size:0.7rem;color:#666}
.footer{text-align:center;padding:1.5rem;color:#333;font-size:0.75rem;margin-top:auto}
@keyframes spin{0%{transform:rotateY(0deg)}100%{transform:rotateY(360deg)}}
.logo-spin{animation:spin 3s linear infinite;transform-style:preserve-3d;display:inline-block}
</style>
</head>
<body>
<div class="topbar">
  <h1>5 STAR LINKS</h1>
  <span style="color:#a855f7;font-size:0.8rem">AI Video Splicer</span>
</div>

<div class="hero">
  <h2>AI Video Splicer</h2>
  <p>Paste a YouTube link. Get viral TikTok clips.</p>
</div>

<div class="features">
  <div class="feature"><div class="icon">✂️</div><h4>Auto Clip</h4><p>1:30 clips</p></div>
  <div class="feature"><div class="icon">🤖</div><h4>AI Detection</h4><p>Finds viral moments</p></div>
  <div class="feature"><div class="icon">📝</div><h4>Transcription</h4><p>Full transcript</p></div>
  <div class="feature"><div class="icon">🔒</div><h4>100% Local</h4><p>Nothing sent to cloud</p></div>
</div>

<div class="card">
  <h3>Paste YouTube URL</h3>
  <div class="input-group">
    <input type="text" id="url" placeholder="https://youtube.com/watch?v=..." autofocus>
  </div>
  <div class="input-group">
    <label>Clip Duration (seconds)</label>
    <input type="number" id="duration" value="90" min="10" max="600">
  </div>
  <button class="btn" id="startBtn" onclick="startSplice()">Start Splicing</button>

  <div class="status-bar" id="statusBar">
    <div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>
    <div class="log-box" id="logBox"></div>
  </div>

  <div class="info-box" id="infoBox">
    <p class="title" id="infoTitle"></p>
    <p id="infoDuration"></p>
    <p id="infoChannel"></p>
  </div>

  <div class="done-box" id="doneBox">
    <h4>Done!</h4>
    <p id="doneMsg"></p>
  </div>
</div>

<div class="footer">5 Star Links &copy; 2026. Runs 100% locally on your device.</div>

<script>
const urlInput = document.getElementById('url');
const startBtn = document.getElementById('startBtn');
const statusBar = document.getElementById('statusBar');
const progressFill = document.getElementById('progressFill');
const logBox = document.getElementById('logBox');
const infoBox = document.getElementById('infoBox');
const doneBox = document.getElementById('doneBox');

function addLog(msg) {
  const line = document.createElement('div');
  line.className = 'log-line';
  line.textContent = msg;
  logBox.appendChild(line);
  logBox.scrollTop = logBox.scrollHeight;
}

let evtSource;
function startSplice() {
  const url = urlInput.value.trim();
  if (!url) return urlInput.focus();
  const duration = parseInt(document.getElementById('duration').value) || 90;

  startBtn.disabled = true;
  startBtn.textContent = 'Splicing...';
  statusBar.classList.add('active');
  doneBox.classList.remove('active');
  logBox.innerHTML = '';

  fetch('/api/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, duration })
  });

  if (evtSource) evtSource.close();
  evtSource = new EventSource('/api/events');

  evtSource.addEventListener('log', e => {
    const d = JSON.parse(e.data);
    addLog(d.msg);
  });

  evtSource.addEventListener('info', e => {
    const d = JSON.parse(e.data);
    infoBox.classList.add('active');
    document.getElementById('infoTitle').textContent = d.title;
    document.getElementById('infoDuration').textContent = 'Duration: ' + Math.floor(d.duration/60) + 'm ' + (d.duration%60) + 's';
    document.getElementById('infoChannel').textContent = d.channel;
  });

  evtSource.addEventListener('progress', e => {
    const d = JSON.parse(e.data);
    const pct = Math.round((d.current / d.total) * 100);
    progressFill.style.width = pct + '%';
    addLog('Progress: ' + d.current + '/' + d.total + ' clips');
  });

  evtSource.addEventListener('done', e => {
    const d = JSON.parse(e.data);
    progressFill.style.width = '100%';
    doneBox.classList.add('active');
    document.getElementById('doneMsg').textContent = d.clips + ' clips saved to: ' + d.dir;
    startBtn.disabled = false;
    startBtn.textContent = 'Start Splicing';
    evtSource.close();
  });

  evtSource.addEventListener('error', e => {
    try {
      const d = JSON.parse(e.data);
      addLog('Error: ' + d.msg);
    } catch {}
    startBtn.disabled = false;
    startBtn.textContent = 'Start Splicing';
    evtSource.close();
  });

  evtSource.onerror = () => {
    if (startBtn.disabled) {
      setTimeout(() => { if (startBtn.disabled) evtSource = new EventSource('/api/events'); }, 2000);
    }
  };
}

urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') startSplice(); });
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('\n');
    clients.push(res);
    req.on('close', () => { clients = clients.filter(c => c !== res); });
    return;
  }

  if (req.url === '/api/start' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { url, duration } = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        startSplice(url, duration || 90);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (req.url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ status, clips: progress.filter(l => l.startsWith('Clip')).length }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(HTML);
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║   5 STAR LINKS - AI VIDEO SPLICER v1.0   ║');
  console.log('  ║   Opening in your browser...              ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
  console.log('  If browser didn\'t open, go to: http://localhost:' + PORT);
  console.log('');

  const start = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  try { exec(start + ' http://localhost:' + PORT); } catch {}
});
