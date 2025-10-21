import express from "express";
import fetch from "node-fetch";

const router = express.Router();

// ⚡ Получение живых Dota 2 матчей
router.get("/live", async (req, res) => {
  try {
    const response = await fetch("https://api.opendota.com/api/live");
    const data = await response.json();

    // Фильтруем только матчи, где указаны команды
    const dotaMatches = data
      .filter((m) => m.team_name_radiant && m.team_name_dire)
      .slice(0, 15) // берём максимум 15 матчей
      .map((m) => ({
        id: m.match_id,
        team1: m.team_name_radiant,
        team2: m.team_name_dire,
        league: m.league_name,
        spectators: m.spectators,
        sport: "Dota 2",
      }));

    res.json(dotaMatches);
  } catch (error) {
    console.error("Ошибка при получении live матчей:", error.message);
    res.status(500).json({ error: "Не удалось получить матчи" });
  }
});

export default router;
