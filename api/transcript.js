module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { videoId } = req.body;
    if (!videoId) return res.status(400).json({ error: 'No videoId provided' });

    // Fetch the YouTube page to extract transcript data
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const html = await pageRes.text();

    // Extract captions track URL from ytInitialPlayerResponse
    const captionsMatch = html.match(/"captionTracks":\[(.*?)\]/);
    if (!captionsMatch) {
      return res.status(200).json({ transcript: null, error: 'No captions available' });
    }

    // Parse the first caption track
    const trackMatch = captionsMatch[1].match(/"baseUrl":"(.*?)"/);
    if (!trackMatch) {
      return res.status(200).json({ transcript: null, error: 'No caption URL found' });
    }

    let captionUrl = trackMatch[1].replace(/\\u0026/g, '&');
    // Request JSON3 format for easier parsing
    if (!captionUrl.includes('fmt=')) captionUrl += '&fmt=json3';

    const captionRes = await fetch(captionUrl);
    const captionData = await captionRes.json();

    if (!captionData.events) {
      return res.status(200).json({ transcript: null, error: 'No transcript events' });
    }

    // Parse transcript into segments with timestamps
    const segments = [];
    for (const event of captionData.events) {
      if (!event.segs) continue;
      const text = event.segs.map(s => s.utf8).join('').trim();
      if (!text || text === '\n') continue;
      const startMs = event.tStartMs || 0;
      const endMs = startMs + (event.dDurationMs || 0);
      segments.push({
        start: startMs / 1000,
        end: endMs / 1000,
        text
      });
    }

    // Merge consecutive short segments into sentences (group by ~5-10 second windows)
    const merged = [];
    let current = null;
    for (const seg of segments) {
      if (!current) {
        current = { ...seg };
      } else if (seg.start - current.start < 8 && !/[.!?]$/.test(current.text)) {
        current.text += ' ' + seg.text;
        current.end = seg.end;
      } else {
        merged.push(current);
        current = { ...seg };
      }
    }
    if (current) merged.push(current);

    res.status(200).json({ transcript: merged, totalSegments: merged.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
