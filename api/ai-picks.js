module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
  }

  const { message, sportsData, scheduledGames, liveOdds } = req.body || {};

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  const systemPrompt = `You are an expert AI Sports Analyst for 5 Star Links. You provide confident, data-driven sports predictions.

RULES:
- You cover NFL, NBA, MLB, NHL, and College Football
- Use sport-specific terminology: "extra innings" for baseball (NOT "overtime"), "overtime" for NFL/NBA/NHL, "shootout" for NHL tiebreakers
- Always pick a winner with confidence percentage (51-89%)
- Give a predicted margin or method of victory
- Reference real team stats, records, streaks when available
- If you have live odds, factor them into your analysis
- Keep responses concise (under 200 words)
- Be confident but honest about uncertainty
- Format with bold team names and key stats
- If asked about a game you don't have data for, say so honestly
- If a scheduled game has a "score" field, it is LIVE or FINAL: report the current score FIRST (with the game situation from the "liveDetail" field, e.g. inning or quarter/clock, plus hits/errors if present) before any analysis. Live data comes from the official MLB Stats API and ESPN.
- Never invent a score. Only report scores present in the data.
- Game date/time fields are already in the user's local timezone; repeat them as-is

SPORTS DATA PROVIDED:
${sportsData ? JSON.stringify(sportsData) : 'No team stats available'}

SCHEDULED GAMES:
${scheduledGames ? JSON.stringify(scheduledGames.slice(0, 60)) : 'No scheduled games available'}

LIVE ODDS:
${liveOdds ? JSON.stringify(liveOdds) : 'No live odds available'}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: systemPrompt + '\n\nUser question: ' + message }] }
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024
          }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Gemini API error:', errorData);
      return res.status(500).json({ error: 'AI service temporarily unavailable' });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(500).json({ error: 'No response from AI' });
    }

    res.status(200).json({ reply: text });
  } catch (error) {
    console.error('Error calling Gemini:', error);
    res.status(500).json({ error: 'AI service error' });
  }
};
