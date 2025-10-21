import express from "express";
import { db } from "../server.js";

const router = express.Router();

// Логин или регистрация
router.post("/login", async (req, res) => {
  const { username } = req.body;
  try {
    let result = await db.query("SELECT * FROM users WHERE username = $1", [
      username,
    ]);
    if (result.rowCount === 0) {
      result = await db.query(
        "INSERT INTO users (username, balance) VALUES ($1, 1000) RETURNING *",
        [username]
      );
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// Пополнить баланс
router.post("/add-funds", async (req, res) => {
  const { userId, amount } = req.body;
  try {
    const { rows } = await db.query(
      "UPDATE users SET balance = balance + $1 WHERE id = $2 RETURNING balance",
      [amount, userId]
    );
    res.json({ balance: rows[0].balance });
  } catch (error) {
    console.error("Error adding funds:", error);
    res.status(500).json({ error: "Failed to add funds" });
  }
});

// Рейтинг
router.get("/rating", async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT username, balance FROM users ORDER BY balance DESC LIMIT 10"
    );
    res.json(rows);
  } catch (error) {
    console.error("Error fetching rating:", error);
    res.status(500).json({ error: "Failed to fetch rating" });
  }
});

export default router;
