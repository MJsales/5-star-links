// Posts newly added entries in deals.html's `deals` array to Discord, comparing
// the version at process.env.BEFORE_SHA against the current working tree.
const { execSync } = require('child_process');
const fs = require('fs');

const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
const beforeSha = process.env.BEFORE_SHA;

function extractDeals(html) {
  const m = html.match(/const deals = (\[[\s\S]*?\n\]);/);
  if (!m) return [];
  return eval(m[1]);
}

function dealKey(d) {
  return `${d.store}|${d.name}|${d.link || ''}`;
}

if (!webhookUrl) {
  console.log('No DISCORD_WEBHOOK_URL set, skipping notify.');
  process.exit(0);
}

const afterHtml = fs.readFileSync('deals.html', 'utf8');
const afterDeals = extractDeals(afterHtml);

let beforeDeals = [];
try {
  const beforeHtml = execSync(`git show ${beforeSha}:deals.html`, { encoding: 'utf8' });
  beforeDeals = extractDeals(beforeHtml);
} catch {
  // First commit touching this file, or before-ref unavailable — treat everything as new.
}

const beforeKeys = new Set(beforeDeals.map(dealKey));
const newDeals = afterDeals.filter(d => !beforeKeys.has(dealKey(d)));

if (newDeals.length === 0) {
  console.log('No new deals to announce.');
  process.exit(0);
}

for (const d of newDeals.slice(0, 10)) {
  const badge = d.badgeText || (d.pctOverride ? `${d.pctOverride}% OFF` : '');
  const body = {
    embeds: [{
      title: `🔥 New Deal: ${d.name} (${d.store})`,
      color: 11098834,
      description: d.blurb || '',
      fields: [
        { name: 'Store', value: d.store || 'Unknown', inline: true },
        ...(badge ? [{ name: 'Discount', value: badge, inline: true }] : []),
      ],
      url: d.link || undefined,
      footer: { text: '5starlinks.xyz/deals.html' },
    }],
  };
  const res = execSync(
    `curl -s -o /dev/null -w "%{http_code}" -X POST "${webhookUrl}" -H "Content-Type: application/json" -d @-`,
    { input: JSON.stringify(body), encoding: 'utf8' }
  );
  console.log(`Posted "${d.name}" -> HTTP ${res}`);
}
