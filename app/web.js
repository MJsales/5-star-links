#!/usr/bin/env node
const http = require('http');
const { execSync, spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const PImage = require('pureimage');

// The bare domain 308-redirects to www, and that redirect response carries no
// CORS headers -- breaks cross-origin fetch() from the packaged app (browser
// navigation/curl -L mask this by following the redirect transparently, but
// a real fetch() does not treat it as same-origin after the hop). Hitting
// www directly avoids the redirect entirely.
const LIVE_SITE = 'https://www.5starlinks.xyz';
const FREE_CLIPS = 3;

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
  const flag = cmd === 'ffmpeg' ? '-version' : '--version';
  try { execSync(cmd + ' ' + flag, { stdio: 'ignore' }); return true; } catch { return false; }
}

function findTools() {
  const isWin = process.platform === 'win32';
  const sep = isWin ? ';' : ':';
  const home = process.env.USERPROFILE || '';

  const ytdlpPaths = isWin ? [
    path.join(home, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages', 'yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe', 'yt-dlp.exe'),
    path.join(home, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages', 'yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe', 'yt-dlp_cmd.exe'),
  ] : ['/opt/homebrew/bin/yt-dlp', '/usr/local/bin/yt-dlp'];

  const ffmpegPaths = isWin ? [
    path.join(home, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages', 'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe', 'ffmpeg-8.1.1-full_build', 'bin', 'ffmpeg.exe'),
  ] : ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'];

  for (const p of ytdlpPaths) {
    if (fs.existsSync(p)) { try { execSync('"' + p + '" --version', { stdio: 'ignore', timeout: 5000 }); process.env.PATH = path.dirname(p) + sep + (process.env.PATH || ''); break; } catch {} }
  }
  for (const p of ffmpegPaths) {
    if (fs.existsSync(p)) { try { execSync('"' + p + '" -version', { stdio: 'ignore', timeout: 5000 }); process.env.PATH = path.dirname(p) + sep + (process.env.PATH || ''); break; } catch {} }
  }
  return { ytDlp: checkCommand('yt-dlp'), ffmpeg: checkCommand('ffmpeg') };
}

// ---- Free-tier / license state (local file, keyed to this machine) ----
// This is an honor-system limit, not DRM: it's a plain JSON file the user
// could delete or edit. Fine for a $2/mo, $20-lifetime product -- not worth
// the complexity of hardware-locked licensing at this price point.
function getStateFilePath() {
  const dir = path.join(os.homedir(), '.5star_splicer');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'state.json');
}
function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(getStateFilePath(), 'utf8'));
    if (typeof s.clipsCreated !== 'number') s.clipsCreated = 0;
    return s;
  } catch {
    return { clipsCreated: 0, license: null };
  }
}
function saveState(state) {
  try { fs.writeFileSync(getStateFilePath(), JSON.stringify(state)); } catch {}
}
function isLicensed(state) {
  return !!(state.license && state.license.licensed);
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
    log('Downloading video...');
    const proc = spawn('yt-dlp', ['-f', 'best[height<=720]', '-o', outputPath, '--no-playlist', url]);
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

// ffmpeg's own text renderer (drawtext) needs libfreetype/fontconfig, which the
// plain `brew install ffmpeg` this app tells users to run does NOT include on
// current bottles -- so text is rendered to a transparent PNG in JS instead
// (pureimage, pure-JS, no native deps) and composited with ffmpeg's `overlay`,
// which works with any ffmpeg build.
let titleFontPromise = null;
function getTitleFont() {
  if (!titleFontPromise) {
    const fontPath = process.platform === 'win32'
      ? path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'arialbd.ttf')
      : process.platform === 'darwin'
        ? '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
        : '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
    const font = PImage.registerFont(fontPath, 'TitleFont');
    titleFontPromise = font.load().then(() => font);
  }
  return titleFontPromise;
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawOutlinedText(ctx, text, x, y, fillColor) {
  ctx.fillStyle = '#000000';
  [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, 2], [-2, 2], [2, -2]]
    .forEach(([dx, dy]) => ctx.fillText(text, x + dx, y + dy));
  ctx.fillStyle = fillColor;
  ctx.fillText(text, x, y);
}

// Renders "TITLE\nPART i/N" (TikTok-style) to a transparent 1080-wide PNG that
// gets overlaid on the blurred band at the top of the clip.
async function renderTitleOverlay(title, partIndex, totalParts, outPath) {
  await getTitleFont();
  const W = 1080, H = 320;
  const img = PImage.make(W, H);
  const ctx = img.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const maxWidth = W - 100;
  ctx.font = '54px TitleFont';
  let lines = wrapText(ctx, (title || 'Video').toUpperCase(), maxWidth);
  if (lines.length > 2) {
    lines = lines.slice(0, 2);
    lines[1] = lines[1].replace(/\s*\S*$/, '') + '...';
  }

  let y = lines.length === 1 ? 110 : 90;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    drawOutlinedText(ctx, line, (W - w) / 2, y, '#ffffff');
    y += 64;
  }

  ctx.font = '38px TitleFont';
  const partText = 'PART ' + partIndex + '/' + totalParts;
  const pw = ctx.measureText(partText).width;
  drawOutlinedText(ctx, partText, (W - pw) / 2, y + 20, '#a855f7');

  await PImage.encodePNGToStream(img, fs.createWriteStream(outPath));
}

// Small "5starlinks.xyz" watermark for the bottom-right corner, shown once a
// user's free clips run out. Static content, so it's rendered once and reused
// for every watermarked clip in the process's lifetime (see getWatermarkPath).
async function renderWatermark(outPath) {
  await getTitleFont();
  const W = 420, H = 60;
  const img = PImage.make(W, H);
  const ctx = img.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.font = '28px TitleFont';
  const text = '5starlinks.xyz';
  const w = ctx.measureText(text).width;
  drawOutlinedText(ctx, text, W - w - 16, 40, '#ffffff');
  await PImage.encodePNGToStream(img, fs.createWriteStream(outPath));
}

let watermarkPathPromise = null;
function getWatermarkPath() {
  if (!watermarkPathPromise) {
    const p = path.join(os.tmpdir(), '5star_watermark.png');
    watermarkPathPromise = renderWatermark(p).then(() => p);
  }
  return watermarkPathPromise;
}

async function clipVideo(inputPath, outputDir, startSec, duration, index, title, totalClips, watermarked) {
  const outputPath = path.join(outputDir, 'clip_' + String(index).padStart(2, '0') + '.mp4');
  log('Creating clip ' + index + ' (' + startSec + 's, ' + duration + 's)...' + (watermarked ? ' [watermarked]' : ''));

  const overlayPath = path.join(outputDir, '.overlay_' + index + '.png');
  await renderTitleOverlay(title, index, totalClips, overlayPath);
  const watermarkPath = watermarked ? await getWatermarkPath() : null;

  // TikTok 9:16: blurred zoomed copy fills the frame behind a slightly cropped (4:3)
  // foreground, with the title + part number overlaid on the blurred band at top.
  // Blur at 1/4 resolution then scale back up -- it's blurred either way so the
  // downscale is invisible, but boxblur does ~16x less pixel work this way. This
  // (not the encoder) was the actual bottleneck on weak CPUs.
  const inputs = ['-ss', String(startSec), '-t', String(duration), '-i', inputPath, '-i', overlayPath];
  let FILTER = '[0:v]split=2[bg][fg];[bg]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=8:2,scale=1080:1920[bgb];[fg]crop=min(iw\\,ih*4/3):ih,scale=1080:-2[fgs];[bgb][fgs]overlay=(W-w)/2:(H-h)/2[base];[base][1:v]overlay=0:70:format=auto' + (watermarkPath ? '[t1]' : '[outv]');
  if (watermarkPath) {
    inputs.push('-i', watermarkPath);
    FILTER += ';[t1][2:v]overlay=W-w-20:H-h-40:format=auto[outv]';
  }

  // On macOS, use the VideoToolbox hardware encoder instead of software libx264 --
  // on weak/fanless CPUs (e.g. 2-core Intel), software x264 is the whole bottleneck.
  const videoCodecArgs = process.platform === 'darwin'
    ? ['-c:v', 'h264_videotoolbox', '-b:v', '6M', '-allow_sw', '1']
    : ['-c:v', 'libx264', '-preset', 'fast'];

  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      ...inputs,
      '-filter_complex', FILTER,
      '-map', '[outv]', '-map', '0:a?',
      ...videoCodecArgs, '-c:a', 'aac', '-pix_fmt', 'yuv420p', '-y', outputPath,
    ]);
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      try { fs.unlinkSync(overlayPath); } catch {}
      if (code !== 0) return reject(new Error(stderr || 'Clip failed'));
      log('Clip ' + index + ' created');
      resolve(outputPath);
    });
    proc.on('error', reject);
  });
}

async function startSplice(url, clipDuration) {
  if (status === 'running') return;
  status = 'running';
  progress = [];
  videoInfo = null;
  const outputDir = path.join(process.cwd(), '5star_clips');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  try {
    const tools = findTools();
    const installHint = process.platform === 'win32' ? 'winget install' : 'brew install';
    if (!tools.ytDlp) { status = 'error'; log('ERROR: yt-dlp not found. Run: ' + installHint + ' yt-dlp'); return; }
    if (!tools.ffmpeg) { status = 'error'; log('ERROR: ffmpeg not found. Run: ' + installHint + ' ffmpeg'); return; }
    log('Fetching video info...');
    const info = await getVideoInfo(url);
    videoInfo = { title: info.title, duration: info.duration, channel: info.channel, thumbnail: info.thumbnail };
    broadcast('info', videoInfo);
    log('Title: ' + info.title);
    log('Duration: ' + Math.floor(info.duration / 60) + 'm ' + (info.duration % 60) + 's');
    const videoPath = await downloadVideo(url, outputDir);
    const totalClips = Math.ceil(info.duration / clipDuration);
    log('Creating ' + totalClips + ' clips of ' + clipDuration + 's each...');
    const state = loadState();
    for (let i = 0; i < totalClips; i++) {
      const start = i * clipDuration;
      const dur = Math.min(clipDuration, info.duration - start);
      if (dur <= 0) break;
      const licensed = isLicensed(state);
      const watermarked = !licensed && state.clipsCreated >= FREE_CLIPS;
      await clipVideo(videoPath, outputDir, start, dur, i + 1, info.title, totalClips, watermarked);
      state.clipsCreated += 1;
      saveState(state);
      broadcast('progress', {
        current: i + 1, total: totalClips, watermarked, licensed,
        freeRemaining: Math.max(0, FREE_CLIPS - state.clipsCreated),
      });
    }
    try { fs.unlinkSync(videoPath); } catch {}
    log('Done! ' + totalClips + ' clips saved to ' + outputDir);
    status = 'done';
    broadcast('done', { clips: totalClips, dir: outputDir });
  } catch (err) {
    status = 'error';
    log('Error: ' + err.message);
    broadcast('error', { msg: err.message });
  }
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>5 Star Links - AI Video Splicer</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:"Segoe UI",system-ui,sans-serif;background:#050208;color:#fff;min-height:100vh;display:flex;flex-direction:column;align-items:center}
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
.btn.secondary{background:rgba(168,85,247,0.12);border:1px solid rgba(168,85,247,0.3)}
.status-bar{margin-top:1rem;display:none}
.status-bar.active{display:block}
.progress-bar{width:100%;height:6px;background:#1a1028;border-radius:3px;overflow:hidden;margin-bottom:0.5rem}
.progress-fill{height:100%;background:linear-gradient(90deg,#a855f7,#ef4444);width:0%;transition:width 0.5s;border-radius:3px}
.log-box{background:#0a0612;border:1px solid rgba(168,85,247,0.15);border-radius:10px;padding:1rem;max-height:200px;overflow-y:auto;font-family:"Courier New",monospace;font-size:0.8rem;color:#22c55e;margin-top:0.5rem}
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
.license-banner{max-width:560px;width:90%;margin:1rem auto 0;padding:0.7rem 1rem;border-radius:10px;font-size:0.85rem;text-align:center;font-weight:600}
.license-banner.free{background:rgba(168,85,247,0.1);border:1px solid rgba(168,85,247,0.25);color:#c9a8ff}
.license-banner.watermarked{background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#ff8a8a}
.license-banner.pro{background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);color:#4ade80}
.plan-row{display:flex;gap:0.6rem;margin-top:0.5rem}
.plan-row .btn{margin-top:0}
.watermark-status{font-size:0.8rem;color:#888;margin-top:0.6rem;text-align:center}
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
<div id="licenseBanner" class="license-banner free">Loading license status...</div>
<div class="features">
  <div class="feature"><div class="icon">&#9986;</div><h4>Auto Clip</h4><p>1:30 clips</p></div>
  <div class="feature"><div class="icon">&#129302;</div><h4>AI Detection</h4><p>Finds viral moments</p></div>
  <div class="feature"><div class="icon">&#128221;</div><h4>Transcription</h4><p>Full transcript</p></div>
  <div class="feature"><div class="icon">&#128274;</div><h4>100% Local</h4><p>Nothing sent to cloud</p></div>
</div>
<div class="card">
  <h3>Paste YouTube URL</h3>
  <div class="input-group"><input type="text" id="url" placeholder="https://youtube.com/watch?v=..." autofocus></div>
  <div class="input-group"><label>Clip Duration (seconds)</label><input type="number" id="duration" value="90" min="10" max="600"></div>
  <button class="btn" id="startBtn" onclick="startSplice()">Start Splicing</button>
  <div class="status-bar" id="statusBar"><div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div><div class="log-box" id="logBox"></div></div>
  <div class="info-box" id="infoBox"><p class="title" id="infoTitle"></p><p id="infoDuration"></p><p id="infoChannel"></p></div>
  <div class="done-box" id="doneBox"><h4>Done!</h4><p id="doneMsg"></p></div>
</div>
<div class="card" id="proCard">
  <h3>Remove Watermark</h3>
  <p style="color:#aaa;font-size:0.85rem;margin-bottom:1rem;">First 3 clips are always watermark-free. After that, clips get a small "5starlinks.xyz" watermark unless you go Pro.</p>
  <div class="input-group"><label>Your Email</label><input type="text" id="licenseEmail" placeholder="you@example.com"></div>
  <div class="plan-row">
    <button class="btn secondary" onclick="buyPlan('monthly', this)">Subscribe $2/mo</button>
    <button class="btn secondary" onclick="buyPlan('lifetime', this)">Lifetime $20</button>
  </div>
  <button class="btn" onclick="verifyLicense()" id="verifyBtn">Already Paid? Verify</button>
  <div class="watermark-status" id="proStatus"></div>
</div>
<div class="footer">5 Star Links &copy; 2026. Runs 100% locally on your device.</div>
<script>
var evtSource;
var LIVE_SITE = "${LIVE_SITE}";
var licenseState = { licensed: false, freeRemaining: ${FREE_CLIPS}, email: null };

function renderLicenseBanner(){
  var el = document.getElementById("licenseBanner");
  if(licenseState.licensed){
    el.className = "license-banner pro";
    el.textContent = "Pro active (" + (licenseState.plan||"") + ") -- no watermark. Thanks for supporting 5 Star Links!";
  } else if(licenseState.freeRemaining > 0){
    el.className = "license-banner free";
    el.textContent = licenseState.freeRemaining + " free watermark-free clip" + (licenseState.freeRemaining===1?"":"s") + " left";
  } else {
    el.className = "license-banner watermarked";
    el.textContent = "Free clips used up -- new clips get a small watermark. Go Pro below to remove it.";
  }
}

function loadLicenseStatus(){
  fetch("/api/license-status").then(function(r){return r.json();}).then(function(d){
    licenseState.licensed = d.licensed;
    licenseState.freeRemaining = d.freeRemaining;
    licenseState.plan = d.plan;
    if(d.email) document.getElementById("licenseEmail").value = d.email;
    renderLicenseBanner();
  }).catch(function(){});
}

function verifyLicense(){
  var email = document.getElementById("licenseEmail").value.trim();
  if(!email) return alert("Enter the email you paid with first.");
  var btn = document.getElementById("verifyBtn");
  btn.disabled = true; btn.textContent = "Checking...";
  fetch(LIVE_SITE + "/api/splicer-license?email=" + encodeURIComponent(email))
    .then(function(r){return r.json();})
    .then(function(d){
      return fetch("/api/save-license", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({email: email, licensed: d.licensed, plan: d.plan})})
        .then(function(){ return d; });
    })
    .then(function(d){
      btn.disabled = false; btn.textContent = "Already Paid? Verify";
      document.getElementById("proStatus").textContent = d.licensed ? "Verified! Watermark removed." : "No active plan found for that email yet.";
      licenseState.licensed = d.licensed;
      licenseState.plan = d.plan;
      renderLicenseBanner();
    })
    .catch(function(){
      btn.disabled = false; btn.textContent = "Already Paid? Verify";
      document.getElementById("proStatus").textContent = "Couldn't reach 5starlinks.xyz -- check your internet connection.";
    });
}

function buyPlan(plan, btn){
  var email = document.getElementById("licenseEmail").value.trim();
  if(!email) return alert("Enter your email first so we know which account to activate.");
  // Navigate the current tab instead of opening a new one -- window.open()
  // (even called synchronously on click) can be silently blocked with zero
  // visible indication depending on the browser's Pop-up Windows setting.
  // A same-tab navigation isn't a popup, so no blocker setting can stop it.
  if(btn){ btn.disabled = true; btn.textContent = "Redirecting..."; }
  fetch(LIVE_SITE + "/api/splicer-license", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({email: email, plan: plan})})
    .then(function(r){return r.json();})
    .then(function(d){
      if(d.url) { window.location.href = d.url; }
      else { if(btn){ btn.disabled = false; btn.textContent = plan === "lifetime" ? "Lifetime $20" : "Subscribe $2/mo"; } alert(d.error || "Could not start checkout."); }
    })
    .catch(function(){ if(btn){ btn.disabled = false; btn.textContent = plan === "lifetime" ? "Lifetime $20" : "Subscribe $2/mo"; } alert("Couldn't reach 5starlinks.xyz -- check your internet connection."); });
}

function startSplice(){
  var url=document.getElementById("url").value.trim();
  if(!url)return document.getElementById("url").focus();
  var duration=parseInt(document.getElementById("duration").value)||90;
  document.getElementById("startBtn").disabled=true;
  document.getElementById("startBtn").textContent="Splicing...";
  document.getElementById("statusBar").classList.add("active");
  document.getElementById("doneBox").classList.remove("active");
  document.getElementById("logBox").innerHTML="";
  fetch("/api/start",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:url,duration:duration})});
  if(evtSource)evtSource.close();
  evtSource=new EventSource("/api/events");
  evtSource.addEventListener("log",function(e){var d=JSON.parse(e.data);var lb=document.getElementById("logBox");var ln=document.createElement("div");ln.className="log-line";ln.textContent=d.msg;lb.appendChild(ln);lb.scrollTop=lb.scrollHeight;});
  evtSource.addEventListener("info",function(e){var d=JSON.parse(e.data);document.getElementById("infoBox").classList.add("active");document.getElementById("infoTitle").textContent=d.title;document.getElementById("infoDuration").textContent="Duration: "+Math.floor(d.duration/60)+"m "+(d.duration%60)+"s";document.getElementById("infoChannel").textContent=d.channel;});
  evtSource.addEventListener("progress",function(e){
    var d=JSON.parse(e.data);
    document.getElementById("progressFill").style.width=Math.round(d.current/d.total*100)+"%";
    licenseState.licensed = d.licensed;
    licenseState.freeRemaining = d.freeRemaining;
    renderLicenseBanner();
  });
  evtSource.addEventListener("done",function(e){var d=JSON.parse(e.data);document.getElementById("progressFill").style.width="100%";document.getElementById("doneBox").classList.add("active");document.getElementById("doneMsg").textContent=d.clips+" clips saved to: "+d.dir;document.getElementById("startBtn").disabled=false;document.getElementById("startBtn").textContent="Start Splicing";evtSource.close();});
  evtSource.addEventListener("error",function(e){try{var d=JSON.parse(e.data);var lb=document.getElementById("logBox");var ln=document.createElement("div");ln.className="log-line";ln.textContent="Error: "+d.msg;lb.appendChild(ln);}catch(ex){}document.getElementById("startBtn").disabled=false;document.getElementById("startBtn").textContent="Start Splicing";evtSource.close();});
  evtSource.onerror=function(){if(document.getElementById("startBtn").disabled){setTimeout(function(){if(document.getElementById("startBtn").disabled)evtSource=new EventSource("/api/events");},2000);}};
}
document.getElementById("url").addEventListener("keydown",function(e){if(e.key==="Enter")startSplice();});
loadLicenseStatus();
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*' });
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
        const data = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        startSplice(data.url, data.duration || 90);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  if (req.url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ status: status, clips: progress.filter(l => l.startsWith('Clip')).length }));
    return;
  }
  if (req.url === '/api/license-status' && req.method === 'GET') {
    const state = loadState();
    const licensed = isLicensed(state);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      clipsCreated: state.clipsCreated,
      freeRemaining: Math.max(0, FREE_CLIPS - state.clipsCreated),
      licensed,
      email: state.license ? state.license.email : null,
      plan: licensed ? state.license.plan : null,
    }));
    return;
  }
  if (req.url === '/api/save-license' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const state = loadState();
        state.license = { email: data.email, licensed: !!data.licensed, plan: data.plan || null, verifiedAt: Date.now() };
        saveState(state);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(HTML);
});

const FIXED_PORT = process.env.SPLICER_PORT ? parseInt(process.env.SPLICER_PORT, 10) : 0;
server.listen(FIXED_PORT, '127.0.0.1', () => {
  const actualPort = server.address().port;
  if (process.env.NO_AUTO_OPEN) {
    console.log('SPLICER_READY:' + actualPort);
    return;
  }
  const start = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  try { exec(start + ' http://localhost:' + actualPort); } catch {}
});
