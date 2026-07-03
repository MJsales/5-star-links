const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const date = req.query.date || new Date().toISOString().split('T')[0];
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=team,linescore`;

  try {
    const data = await fetchJSON(url);
    const games = (data.dates && data.dates[0] && data.dates[0].games) || [];
    const formatted = games.map(g => {
      const homeFull = g.teams.home.team.name;
      const awayFull = g.teams.away.team.name;
      const homeShort = homeFull.split(' ').pop();
      const awayShort = awayFull.split(' ').pop();
      const abstractState = g.status.abstractGameState;
      const isLive = abstractState === 'Live';
      const isFinal = abstractState === 'Final';
      const ls = g.linescore;
      return {
        home: homeShort,
        away: awayShort,
        homeFull: homeFull,
        awayFull: awayFull,
        timestamp: g.gameDate,
        date: new Date(g.gameDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        time: new Date(g.gameDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
        venue: g.venue.name,
        status: g.status.detailedState,
        score: (isLive || isFinal) && g.teams.home.score !== undefined ? {
          home: g.teams.home.score,
          away: g.teams.away.score
        } : null,
        inning: isLive && ls && ls.currentInningOrdinal ? ((ls.inningState || '') + ' ' + ls.currentInningOrdinal).trim() : null,
        hits: (isLive || isFinal) && ls && ls.teams && ls.teams.home.hits !== undefined ? {
          home: ls.teams.home.hits,
          away: ls.teams.away.hits
        } : null,
        errors: (isLive || isFinal) && ls && ls.teams && ls.teams.home.errors !== undefined ? {
          home: ls.teams.home.errors,
          away: ls.teams.away.errors
        } : null
      };
    });
    res.status(200).json({ date, games: formatted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse response'));
        }
      });
    }).on('error', reject);
  });
}
