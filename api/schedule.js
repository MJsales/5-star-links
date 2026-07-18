const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Stock/index candles proxy (Yahoo blocks browser CORS, so apps call us instead).
  if (req.query.type === 'stocks') return handleStocks(req, res);
  if (req.query.type === 'stockquotes') return handleStockQuotes(req, res);
  if (req.query.type === 'stocksearch') return handleStockSearch(req, res);

  // Default to the ET calendar day, not UTC — in the evening UTC has already
  // rolled over to tomorrow and would show the wrong slate.
  const date = req.query.date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const espnDate = date.replace(/-/g, '');

  // Major soccer leagues pulled from ESPN (each league is its own endpoint).
  // fifa.world = World Cup, mex.1 = Liga MX (plays through summer breaks).
  const soccerLeagues = {
    'fifa.world': 'World Cup', 'usa.1': 'MLS', 'mex.1': 'Liga MX', 'eng.1': 'Premier League',
    'esp.1': 'La Liga', 'ita.1': 'Serie A', 'ger.1': 'Bundesliga', 'fra.1': 'Ligue 1',
    'uefa.champions': 'Champions League'
  };

  const sources = [
    { sport: 'mlb', kind: 'mlb', url: `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=team,linescore` },
    { sport: 'nfl', kind: 'espn', url: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${espnDate}` },
    { sport: 'nba', kind: 'espn', url: `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${espnDate}` },
    { sport: 'nhl', kind: 'espn', url: `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=${espnDate}` },
    ...Object.keys(soccerLeagues).map(lg => ({ sport: 'soccer', kind: 'espn', league: soccerLeagues[lg], url: `https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/scoreboard?dates=${espnDate}` }))
  ];

  try {
    const results = await Promise.all(sources.map(s =>
      fetchJSON(s.url).then(data => ({ source: s, data })).catch(() => ({ source: s, data: null }))
    ));

    let games = [];
    results.forEach(r => {
      if (!r.data) return;
      if (r.source.kind === 'mlb') games = games.concat(mapMlb(r.data));
      else games = games.concat(mapEspn(r.data, r.source.sport, r.source.league));
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

function mapEspn(data, sport, league) {
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
      league: league || null,
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

async function handleStocks(req, res) {
  const symbol = req.query.symbol || '^GSPC';
  const interval = req.query.interval || '1d';
  const range = req.query.range || '1y';
  if (!/^[\^A-Za-z0-9.\-]{1,12}$/.test(symbol) || !/^[a-z0-9]{1,6}$/.test(interval) || !/^[a-z0-9]{1,6}$/.test(range)) {
    return res.status(400).json({ error: 'bad params' });
  }
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) +
      '?interval=' + interval + '&range=' + range;
    const j = await fetchJSON(url, { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' });
    const r = j.chart && j.chart.result && j.chart.result[0];
    if (!r || !r.timestamp) return res.status(502).json({ error: 'no data' });
    const q = r.indicators.quote[0];
    const candles = [];
    for (let i = 0; i < r.timestamp.length; i++) {
      if (q.close[i] == null) continue;
      candles.push({
        time: r.timestamp[i],
        open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i],
        volume: q.volume[i] || 0
      });
    }
    res.status(200).json({
      meta: {
        symbol: r.meta.symbol,
        price: r.meta.regularMarketPrice,
        prevClose: r.meta.chartPreviousClose
      },
      candles
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}

const YAHOO_UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' };

// Latest price + previous close for many symbols in one call (sidebar tickers).
async function handleStockQuotes(req, res) {
  const symbols = req.query.symbols || '';
  if (!/^[\^A-Za-z0-9.\-,]{1,300}$/.test(symbols)) return res.status(400).json({ error: 'bad symbols' });
  try {
    const j = await fetchJSON('https://query1.finance.yahoo.com/v8/finance/spark?symbols=' + encodeURIComponent(symbols) + '&range=1d&interval=5m', YAHOO_UA);
    const src = j.spark && j.spark.result ? Object.fromEntries(j.spark.result.map(r => [r.symbol, r.response && r.response[0]])) : j;
    const out = {};
    Object.keys(src).forEach(sym => {
      const v = src[sym];
      if (!v) return;
      const closes = (v.close || []).filter(x => x != null);
      const prev = v.chartPreviousClose || (v.meta && v.meta.chartPreviousClose);
      if (closes.length) out[sym] = { price: closes[closes.length - 1], prevClose: prev };
    });
    res.status(200).json(out);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}

// Ticker/company search so the app can chart any stock.
async function handleStockSearch(req, res) {
  const q = (req.query.q || '').slice(0, 40);
  if (!q) return res.status(400).json({ error: 'no q' });
  try {
    const j = await fetchJSON('https://query1.finance.yahoo.com/v1/finance/search?q=' + encodeURIComponent(q) + '&quotesCount=8&newsCount=0', YAHOO_UA);
    const out = (j.quotes || [])
      .filter(x => x.symbol && ['EQUITY', 'ETF', 'INDEX'].indexOf(x.quoteType) !== -1)
      .map(x => ({ symbol: x.symbol, name: x.shortname || x.longname || x.symbol, type: x.quoteType }));
    res.status(200).json(out);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}

function fetchJSON(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, headers ? { headers } : {}, (response) => {
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
