module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'No URL provided' });

    const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    if (!videoIdMatch) return res.status(400).json({ error: 'Invalid YouTube URL' });

    const videoId = videoIdMatch[1];

    // Fetch oEmbed data (title, author, thumbnail)
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const oembedRes = await fetch(oembedUrl);
    if (!oembedRes.ok) return res.status(404).json({ error: 'Video not found' });
    const oembed = await oembedRes.json();

    // Fetch video page to extract duration and description
    let duration = null;
    let description = '';
    let viewCount = null;
    let publishDate = null;
    try {
      const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      const html = await pageRes.text();

      // Extract duration from meta
      const durMatch = html.match(/"lengthSeconds":"(\d+)"/);
      if (durMatch) duration = parseInt(durMatch[1]);

      // Extract description
      const descMatch = html.match(/"shortDescription":"(.*?)(?<!\\)"/);
      if (descMatch) description = descMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').substring(0, 500);

      // Extract view count
      const viewMatch = html.match(/"viewCount":"(\d+)"/);
      if (viewMatch) viewCount = parseInt(viewMatch[1]);

      // Extract publish date
      const dateMatch = html.match(/"publishDate":"([\d-]+)"/);
      if (dateMatch) publishDate = dateMatch[1];
    } catch (e) {
      // Page fetch failed, continue with oembed data only
    }

    // Extract chapters from description if present
    const chapters = [];
    const chapterRegex = /(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)/g;
    let chMatch;
    while ((chMatch = chapterRegex.exec(description)) !== null) {
      chapters.push({ time: chMatch[1], title: chMatch[2].trim() });
    }

    res.status(200).json({
      videoId,
      title: oembed.title,
      author: oembed.author_name,
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      duration,
      description,
      viewCount,
      publishDate,
      chapters,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
      watchUrl: `https://www.youtube.com/watch?v=${videoId}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
