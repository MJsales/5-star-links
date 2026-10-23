// Floating support chat bubble. Include on a page with:
//   <script src="support-chat.js" defer></script>
// Answers come from /api/ai-picks in "support" mode (Gemini + site facts).
(function () {
  if (document.getElementById('sc-btn')) return;

  const css = `
    #sc-btn { position: fixed; right: 20px; bottom: 20px; z-index: 1500; width: 56px; height: 56px;
      border-radius: 50%; border: none; cursor: pointer; font-size: 24px; color: #fff;
      background: linear-gradient(135deg, #a855f7, #7c3aed); box-shadow: 0 6px 24px rgba(168,85,247,0.45); }
    #sc-box { position: fixed; right: 20px; bottom: 88px; z-index: 1500; width: 340px; max-width: calc(100vw - 32px);
      height: 460px; max-height: calc(100vh - 120px); display: none; flex-direction: column; overflow: hidden;
      background: #0d0815; border: 1px solid rgba(168,85,247,0.35); border-radius: 16px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.6); font-family: 'Inter', system-ui, sans-serif; }
    #sc-box.open { display: flex; }
    #sc-head { padding: 12px 14px; display: flex; justify-content: space-between; align-items: center;
      background: linear-gradient(135deg, #a855f7, #7c3aed); color: #fff; font-weight: 700; font-size: 14px; }
    #sc-close { background: none; border: none; color: #fff; font-size: 20px; cursor: pointer; line-height: 1; }
    #sc-log { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
    .sc-msg { max-width: 85%; padding: 8px 12px; border-radius: 12px; font-size: 14px; line-height: 1.45;
      white-space: pre-wrap; word-wrap: break-word; }
    .sc-bot { align-self: flex-start; background: #1a1026; color: #e0d6ed; }
    .sc-user { align-self: flex-end; background: #7c3aed; color: #fff; }
    .sc-bot a { color: #c4b5fd; }
    #sc-form { display: flex; gap: 6px; padding: 10px; border-top: 1px solid rgba(168,85,247,0.2); }
    #sc-input { flex: 1; min-width: 0; padding: 9px 12px; border-radius: 10px; border: 1px solid rgba(168,85,247,0.3);
      background: #050208; color: #fff; font-size: 16px; outline: none; }
    #sc-send { padding: 0 14px; border: none; border-radius: 10px; background: #a855f7; color: #fff;
      font-weight: 700; cursor: pointer; }
    #sc-send:disabled { opacity: 0.5; cursor: default; }
    @media (max-width: 480px) { #sc-box { left: 16px; right: 16px; width: auto; max-width: none; } }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.id = 'sc-btn';
  btn.setAttribute('aria-label', 'Open support chat');
  btn.textContent = '💬';

  const box = document.createElement('div');
  box.id = 'sc-box';
  box.innerHTML = `
    <div id="sc-head"><span>5 Star Support</span><button id="sc-close" aria-label="Close">&times;</button></div>
    <div id="sc-log"></div>
    <form id="sc-form"><input id="sc-input" placeholder="Ask a question…" autocomplete="off" maxlength="1000" />
      <button id="sc-send" type="submit">Send</button></form>`;

  document.body.appendChild(btn);
  document.body.appendChild(box);

  const log = box.querySelector('#sc-log');
  const input = box.querySelector('#sc-input');
  const send = box.querySelector('#sc-send');
  const history = [];

  function escape(s) {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Escape first, then turn emails, site paths and **bold** into markup.
  function format(text) {
    return escape(text)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/([\w.+-]+@[\w-]+\.[\w.]+)/g, '<a href="mailto:$1">$1</a>')
      .replace(/(^|\s|\()(\/[\w-]+\.html)/g, '$1<a href="$2">$2</a>');
  }

  function add(text, who) {
    const div = document.createElement('div');
    div.className = 'sc-msg ' + (who === 'user' ? 'sc-user' : 'sc-bot');
    if (who === 'user') div.textContent = text; else div.innerHTML = format(text);
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  }

  btn.addEventListener('click', () => {
    box.classList.toggle('open');
    if (box.classList.contains('open')) {
      if (!log.children.length) add("Hey! 👋 Ask me anything about 5 Star Links: orders, the Video Splicer, websites, Discord VIP…", 'bot');
      input.focus();
    }
  });
  box.querySelector('#sc-close').addEventListener('click', () => box.classList.remove('open'));

  box.querySelector('#sc-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message || send.disabled) return;
    input.value = '';
    add(message, 'user');
    const pending = add('…', 'bot');
    send.disabled = true;
    try {
      const r = await fetch('/api/ai-picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'support', message, history })
      });
      const data = await r.json();
      if (!r.ok || !data.reply) throw new Error(data.error || 'error');
      pending.innerHTML = format(data.reply);
      history.push({ role: 'user', text: message }, { role: 'model', text: data.reply });
    } catch (err) {
      pending.innerHTML = format("Sorry, I couldn't answer that right now. Email support@5starlinks.xyz and we'll help within 24 hours.");
    }
    send.disabled = false;
    log.scrollTop = log.scrollHeight;
    input.focus();
  });
})();
