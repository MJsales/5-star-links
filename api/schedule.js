const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const date = req.query.date || new Date().toISOString().split('T')[0];
  const espnDate = date.replace(/-/g, '');

  // Major soccer leagues pulled from ESPN (each league is its own endpoint).
  const soccerLeagues = ['usa.1', 'eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'uefa.champions'];

  const sources = [
    { sport: 'mlb', kind: 'mlb', url: `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=team,linescore` },
    { sport: 'nfl', kind: 'espn', url: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${espnDate}` },
    { sport: 'nba', kind: 'espn', url: `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${espnDate}` },
    { sport: 'nhl', kind: 'espn', url: `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=${espnDate}` },
    ...soccerLeagues.map(lg => ({ sport: 'soccer', kind: 'espn', url: `https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/scoreboard?dates=${espnDate}` }))
  ];

  try {
    const results = await Promise.all(sources.map(s =>
      fetchJSON(s.url).then(data => ({ source: s, data })).catch(() => ({ source: s, data: null }))
    ));

    let games = [];
    results.forEach(r => {
      if (!r.data) return;
      if (r.source.kind === 'mlb') games = games.concat(mapMlb(r.data));
      else games = games.concat(mapEspn(r.data, r.source.sport));
    });

    res.status(200).json({ date, games });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

function mapMlb(data) {
  const games = (data.dates && data.dates[0] && data.dates[0].games) || [];
  return games.map(g => {
    const homeFull = g.teams.home.team.name;
    const awayFull = g.teams.away.team.name;
    const abstractState = g.status.abstractGameState;
    const isLive = abstractState === 'Live';
    const isFinal = abstractState === 'Final';
    const ls = g.linescore;
    return {
      sport: 'mlb',
      home: homeFull.split(' ').pop(),
      away: awayFull.split(' ').pop(),
      homeFull: homeFull,
      awayFull: awayFull,
      timestamp: g.gameDate,
      venue: g.venue.name,
      status: g.status.detailedState,
      score: (isLive || isFinal) && g.teams.home.score !== undefined ? {
        home: g.teams.home.score,
        away: g.teams.away.score
      } : null,
      liveDetail: isLive && ls && ls.currentInningOrdinal ? ((ls.inningState || '') + ' ' + ls.currentInningOrdinal).trim() : null,
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
}

function mapEspn(data, sport) {
  const events = (data && data.events) || [];
  return events.map(ev => {
    const comp = ev.competitions && ev.competitions[0];
    if (!comp || !comp.competitors) return null;
    const homeC = comp.competitors.find(c => c.homeAway === 'home');
    const awayC = comp.competitors.find(c => c.homeAway === 'away');
    if (!homeC || !awayC) return null;
    const st = (comp.status && comp.status.type) || (ev.status && ev.status.type) || {};
    const state = st.state;
    const hasScore = state === 'in' || state === 'post';
    return {
      sport: sport,
      home: homeC.team.name || homeC.team.shortDisplayName,
      away: awayC.team.name || awayC.team.shortDisplayName,
      homeFull: homeC.team.displayName,
      awayFull: awayC.team.displayName,
      timestamp: ev.date,
      venue: (comp.venue && comp.venue.fullName) || 'TBD',
      status: st.description || 'Scheduled',
      score: hasScore ? {
        home: parseInt(homeC.score, 10) || 0,
        away: parseInt(awayC.score, 10) || 0
      } : null,
      liveDetail: state === 'in' ? (st.shortDetail || null) : null,
      hits: null,
      errors: null
    };
  }).filter(Boolean);
}

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
