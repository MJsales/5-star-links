// Runs daily via .github/workflows/daily-sports-pick.yml. Pulls tomorrow's
// real schedule (same live API the site uses), asks the same Gemini-backed
// endpoint the paid AI Sports Picks page uses for a prediction on every
// matchup with matchable team stats, and posts each one to Discord.
const fs = require('fs');
const { execSync } = require('child_process');

const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
if (!webhookUrl) {
  console.log('No DISCORD_WEBHOOK_URL set, skipping.');
  process.exit(0);
}

const SITE = 'https://www.5starlinks.xyz';

function curlJSON(url, opts = {}) {
  const method = opts.method || 'GET';
  const args = [`-s`, `-X`, method, `"${url}"`];
  if (opts.body) {
    args.push('-H', '"Content-Type: application/json"', '-d', '@-');
  }
  const out = execSync(`curl ${args.join(' ')}`, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    input: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return JSON.parse(out);
}

function tomorrowET() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function etTime(isoTimestamp) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(new Date(isoTimestamp)) + ' ET';
}

const date = process.env.TARGET_DATE || tomorrowET();
console.log(`Checking schedule for ${date}...`);

let schedule;
try {
  schedule = curlJSON(`${SITE}/api/schedule?date=${date}`);
} catch (e) {
  console.log('Failed to fetch schedule:', e.message);
  process.exit(0);
}

const games = (schedule.games || []).filter(g => g.status !== 'Final');
if (games.length === 0) {
  console.log(`No games scheduled for ${date}. Skipping post.`);
  process.exit(0);
}

const sportsData = JSON.parse(fs.readFileSync('sports-data.json', 'utf8'));

function findTeam(sport, fullName) {
  const teams = (sportsData[sport] && sportsData[sport].teams) || [];
  return teams.find(t => `${t.city} ${t.name}` === fullName);
}

const matchable = [];
for (const g of games) {
  const home = findTeam(g.sport, g.homeFull);
  const away = findTeam(g.sport, g.awayFull);
  if (!home || !away) {
    console.log(`Skipping ${g.awayFull} @ ${g.homeFull} -- no team stats on file.`);
    continue;
  }
  matchable.push({ game: g, home, away });
}

if (matchable.length === 0) {
  console.log('No games with matchable team stats found. Skipping post.');
  process.exit(0);
}

console.log(`Posting picks for ${matchable.length} game(s)...`);

for (const { game, home, away } of matchable) {
  const matchup = `${game.awayFull} @ ${game.homeFull}`;
  const gameTime = `${etTime(game.timestamp)} — ${game.venue}`;

  let reply;
  try {
    const aiRes = curlJSON(`${SITE}/api/ai-picks`, {
      method: 'POST',
      body: {
        message: `What is your best, most confident pick for this game: ${matchup}?`,
        sportsData: { [game.sport]: { teams: [home, away] } },
        scheduledGames: [{ sport: game.sport, home: game.home, away: game.away, date, time: gameTime, venue: game.venue }],
      },
    });
    reply = aiRes.reply;
  } catch (e) {
    console.log(`ai-picks call failed for ${matchup}:`, e.message);
    continue;
  }

  if (!reply) {
    console.log(`No AI reply for ${matchup}, skipping.`);
    continue;
  }

  const body = {
    embeds: [{
      title: `🏆 AI Sports Pick: ${matchup}`,
      color: 11098834,
      description: reply,
      fields: [{ name: 'Game Time', value: gameTime, inline: false }],
      footer: { text: '5starlinks.xyz/ai.html -- AI Sports Picks' },
    }],
  };

  const status = execSync(
    `curl -s -o /dev/null -w "%{http_code}" -X POST "${webhookUrl}" -H "Content-Type: application/json" -d @-`,
    { input: JSON.stringify(body), encoding: 'utf8' }
  );
  console.log(`Posted "${matchup}" -> HTTP ${status}`);
}
