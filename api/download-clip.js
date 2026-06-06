module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { url, start, end, title } = req.body;
    if (!url || start === undefined || end === undefined) {
      return res.status(400).json({ error: 'Missing url, start, or end' });
    }

    const videoId = url.match(/(?:watch\?v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/)?.[1];
    if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL' });

    const safeTitle = (title || 'clip').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
    const startSec = Number(start);
    const endSec = Number(end);

    res.json({
      success: true,
      videoId: videoId,
      filename: safeTitle + '_' + videoId + '_' + startSec + '-' + endSec + '.mp4',
      embedUrl: 'https://www.youtube.com/embed/' + videoId + '?start=' + startSec + '&end=' + endSec + '&autoplay=1&rel=0'
    });

  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed' });
  }
};
