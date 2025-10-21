import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";
import axios from "axios";
import cron from "node-cron";
const { Pool } = pkg;
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT,
});

// Инициализация таблиц
async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        balance INT DEFAULT 200,
        points INT DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS matches (
        id BIGINT PRIMARY KEY,
        team1 TEXT NOT NULL,
        team2 TEXT NOT NULL,
        start_time TIMESTAMP,
        winner INT DEFAULT NULL,
        status TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bets (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        match_id BIGINT REFERENCES matches(id),
        team INT NOT NULL,
        amount INT NOT NULL,
        result TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✅ Таблицы готовы");
  } catch (err) {
    console.error("Ошибка инициализации БД:", err.message);
    throw err;
  }
}
initDb();

// Логин
app.post("/api/login", async (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: "Укажите username" });
  }

  try {
    let user = await pool.query("SELECT * FROM users WHERE username = $1", [
      username,
    ]);
    if (user.rows.length === 0) {
      user = await pool.query(
        "INSERT INTO users (username, balance, points) VALUES ($1, 200, 0) RETURNING *",
        [username]
      );
    }
    res.json(user.rows[0]);
  } catch (err) {
    console.error("Ошибка логина:", err);
    res.status(500).json({ error: "Ошибка сервера", details: err.message });
  }
});

// Получить данные пользователя
app.get("/api/user/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "SELECT id, username, balance, points FROM users WHERE id = $1",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Ошибка получения пользователя:", err);
    res.status(500).json({ error: "Ошибка сервера", details: err.message });
  }
});

// Получить список матчей
app.get("/api/matches", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM matches WHERE status != 'finished' ORDER BY start_time ASC LIMIT 10"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Ошибка получения матчей:", err);
    res.status(500).json({ error: "Ошибка сервера", details: err.message });
  }
});

// Сделать ставку
app.post("/api/bet", async (req, res) => {
  const { userId, match_id, team, amount } = req.body;

  if (
    !userId ||
    !match_id ||
    !team ||
    !amount ||
    amount <= 0 ||
    ![1, 2].includes(team)
  ) {
    return res.status(400).json({ error: "Неверные данные ставки" });
  }

  try {
    const user = await pool.query("SELECT balance FROM users WHERE id = $1", [
      userId,
    ]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }
    if (user.rows[0].balance < amount) {
      return res.status(400).json({ error: "Недостаточно средств" });
    }

    const match = await pool.query("SELECT status FROM matches WHERE id = $1", [
      match_id,
    ]);
    if (match.rows.length === 0 || match.rows[0].status === "finished") {
      return res.status(400).json({ error: "Матч завершён или не существует" });
    }

    await pool.query("UPDATE users SET balance = balance - $1 WHERE id = $2", [
      amount,
      userId,
    ]);
    const bet = await pool.query(
      "INSERT INTO bets (user_id, match_id, team, amount, result) VALUES ($1, $2, $3, $4, 'pending') RETURNING *",
      [userId, match_id, team, amount]
    );
    console.log("Создана ставка:", bet.rows[0]);
    res.json(bet.rows[0]);
  } catch (err) {
    console.error("Ошибка размещения ставки:", err);
    res.status(500).json({ error: "Ошибка сервера", details: err.message });
  }
});

// История ставок
app.get("/api/bets/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await pool.query(
      "SELECT b.*, m.team1, m.team2 FROM bets b JOIN matches m ON b.match_id = m.id WHERE b.user_id = $1 ORDER BY b.created_at DESC",
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Ошибка получения ставок:", err);
    res.status(500).json({ error: "Ошибка сервера", details: err.message });
  }
});

// Лидерборд
app.get("/api/leaderboard", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT username, points FROM users ORDER BY points DESC LIMIT 10"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Ошибка получения лидерборда:", err);
    res.status(500).json({ error: "Ошибка сервера", details: err.message });
  }
});

// Обновление матчей (cron-job)
cron.schedule("*/1 * * * *", async () => {
  // Обновление каждые 5 минут
  try {
    console.log("Запуск обновления матчей...");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const now = Date.now() / 1000; // Текущее время: 1729356360 (19 октября 2025, 13:26 UTC)
    const response = await axios.get("https://api.opendota.com/api/proMatches");
    console.log("Получено матчей от OpenDota:", response.data.length);
    console.log(
      "Пример данных:",
      JSON.stringify(response.data.slice(0, 2), null, 2)
    );

    // Фильтр: только будущие матчи (start_time > сейчас)
    const matches = response.data
      .filter((match) => match.start_time > now)
      .slice(0, 10); // Первые 10 матчей

    console.log(`Отфильтровано будущих матчей: ${matches.length}`);

    if (matches.length === 0) {
      console.log(
        "Предупреждение: Нет будущих матчей. Проверяем все доступные..."
      );
      // Резерв: ближайшие доступные матчи
      const fallbackMatches = response.data.slice(0, 10);
      matches.push(...fallbackMatches);
      console.log(`Добавлены ближайшие матчи: ${fallbackMatches.length}`);
    }

    for (const match of matches) {
      const team1 =
        match.radiant_name || `Team ${match.radiant_team_id || "Unknown"}`;
      const team2 =
        match.dire_name || `Team ${match.dire_team_id || "Unknown"}`;
      const status = match.start_time > now + 3600 ? "upcoming" : "live"; // 'live' если в пределах 1 часа

      console.log(
        `Обработка матча ${
          match.match_id
        }: ${team1} vs ${team2} (${status}, ${new Date(
          match.start_time * 1000
        ).toLocaleString()})`
      );

      await pool.query(
        `
        INSERT INTO matches (id, team1, team2, start_time, status)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET
          team1 = EXCLUDED.team1,
          team2 = EXCLUDED.team2,
          start_time = EXCLUDED.start_time,
          status = EXCLUDED.status
        `,
        [
          match.match_id,
          team1,
          team2,
          new Date(match.start_time * 1000),
          status,
        ]
      );
      console.log(`Матч ${match.match_id} добавлен/обновлён`);
    }

    // Проверка завершённых матчей с обработкой искусственных ID
    const pendingMatches = await pool.query(
      "SELECT id, start_time FROM matches WHERE status = 'upcoming' OR status = 'live'"
    );
    const nowDate = new Date();
    for (const match of pendingMatches.rows) {
      const matchStartTime = new Date(match.start_time);
      const timeDiff = (nowDate - matchStartTime) / 1000 / 3600; // Разница в часах
      if (
        timeDiff > 1 &&
        match.status !== "finished" &&
        !match.id.toString().startsWith("999999")
      ) {
        console.log(`Матч ${match.id} прошёл (>1 час) — обновляем статус`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
          const matchDetails = await axios.get(
            `https://api.opendota.com/api/matches/${match.id}`
          );
          if (matchDetails.data.duration) {
            const winner = matchDetails.data.radiant_win ? 1 : 2;
            await pool.query(
              "UPDATE matches SET status = 'finished', winner = $1 WHERE id = $2",
              [winner, match.id]
            );
            console.log(`Матч ${match.id} завершён, победитель: ${winner}`);

            const bets = await pool.query(
              "SELECT * FROM bets WHERE match_id = $1 AND result = 'pending'",
              [match.id]
            );
            for (const bet of bets.rows) {
              const result = bet.team === winner ? "win" : "loss";
              await pool.query("UPDATE bets SET result = $1 WHERE id = $2", [
                result,
                bet.id,
              ]);
              if (result === "win") {
                await pool.query(
                  "UPDATE users SET balance = balance + $1, points = points + 1 WHERE id = $2",
                  [bet.amount * 2, bet.user_id]
                );
                console.log(`Ставка ${bet.id} выиграна!`);
              }
            }
          }
        } catch (err) {
          console.error(
            `Ошибка при проверке матча ${match.id}: ${err.message} — пропускаем`
          );
        }
      } else {
        console.log(
          `Матч ${match.id} ещё актуален (разница: ${timeDiff.toFixed(
            2
          )} часов)`
        );
      }
    }
    console.log("✅ Матчи и ставки обновлены");
  } catch (err) {
    console.error("Ошибка обновления матчей:", err);
  }
});

app.listen(process.env.PORT, () =>
  console.log("🚀 Backend running on port", process.env.PORT)
);
