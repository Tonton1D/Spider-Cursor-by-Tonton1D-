require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const { Client, GatewayIntentBits } = require('discord.js');

const app = express();
app.use(cors());
app.use(express.json());

// --- Base de données SQLite ---
const db = new Database('scores.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    score INTEGER NOT NULL,
    date TEXT NOT NULL
  )
`);

// --- Client Discord pour le leaderboard ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.login(process.env.DISCORD_TOKEN);

// =============================================
// API : Soumettre un score
// POST /api/score
// Body: { userId, score }
// =============================================
app.post('/api/score', async (req, res) => {
  const { userId, score } = req.body;

  if (!userId || score === undefined) {
    return res.status(400).json({ error: 'userId et score requis' });
  }

  const date = new Date().toISOString();

  // Enregistre le score
  db.prepare('INSERT INTO scores (userId, score, date) VALUES (?, ?, ?)').run(userId, score, date);

  console.log(`[Score] ${userId} → ${score}s`);

  // Met à jour le leaderboard dans Discord
  await updateLeaderboard();

  res.json({ success: true });
});

// =============================================
// API : Récupérer le top 10
// GET /api/leaderboard
// =============================================
app.get('/api/leaderboard', (req, res) => {
  const rows = db.prepare(`
    SELECT userId, MAX(score) as score
    FROM scores
    GROUP BY userId
    ORDER BY score DESC
    LIMIT 10
  `).all();

  res.json(rows);
});

// =============================================
// Met à jour le salon "score-spider" dans Discord
// =============================================
async function updateLeaderboard() {
  try {
    await client.guilds.fetch();
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) return;

    const channel = guild.channels.cache.find(c => c.name === 'score-spider');
    if (!channel) return;

    const rows = db.prepare(`
      SELECT userId, MAX(score) as score
      FROM scores
      GROUP BY userId
      ORDER BY score DESC
      LIMIT 10
    `).all();

    if (rows.length === 0) return;

    const medals = ['🥇', '🥈', '🥉'];
    const lines = rows.map((row, i) => {
      const medal = medals[i] || `**${i + 1}.**`;
      const time = formatTime(row.score);
      return `${medal} <@${row.userId}> — **${time}**`;
    });

    const message = [
      '🕷️ **Classement Spider Game**',
      '─────────────────────',
      ...lines,
      '─────────────────────',
      `*Mis à jour le ${new Date().toLocaleString('fr-FR')}*`,
    ].join('\n');

    // Cherche un message existant du bot et le modifie
    const messages = await channel.messages.fetch({ limit: 10 });
    const botMsg = messages.find(m => m.author.id === client.user.id && m.content.includes('Classement Spider'));

    if (botMsg) {
      await botMsg.edit(message);
    } else {
      await channel.send(message);
    }

    console.log('[Leaderboard] Mis à jour dans Discord');
  } catch (err) {
    console.error('[Leaderboard] Erreur :', err.message);
  }
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Serveur API démarré sur le port ${PORT}`);
});
