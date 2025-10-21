import express from "express";
import db from "../db.js";
const router = express.Router();

// Сделать ставку
router.post("/place", async (req, res) => {
  const { userId, matchId, amount, choice } = req.body;
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const matchRes = await client.query(
      "SELECT odds, status FROM matches WHERE id = $1 FOR UPDATE",
      [matchId]
    );

    if (matchRes.rowCount === 0) throw new Error("Match not found");
    if (matchRes.rows[0].status !== "NS")
      throw new Error("Match already started");

    const odds = matchRes.rows[0].odds[choice];
    if (!odds) throw new Error("Invalid team choice");

    const userRes = await client.query(
      "SELECT balance FROM users WHERE id = $1 FOR UPDATE",
      [userId]
    );

    if (userRes.rows[0].balance < amount) throw new Error("Insufficient funds");

    await client.query(
      "UPDATE users SET balance = balance - $1 WHERE id = $2",
      [amount, userId]
    );

    await client.query(
      "INSERT INTO bets (user_id, match_id, amount, choice, odds, status) VALUES ($1, $2, $3, $4, $5, 'pending')",
      [userId, matchId, amount, choice, odds]
    );

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(400).json({ error: error.message });
  } finally {
    client.release();
  }
});

// История ставок
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { rows } = await db.query(
      `SELECT b.*, m.team1, m.team2, m.status AS match_status 
       FROM bets b 
       JOIN matches m ON b.match_id = m.id 
       WHERE b.user_id = $1 
       ORDER BY b.created_at DESC`,
      [userId]
    );
    res.json(rows);
  } catch (error) {
    console.error("Error fetching bet history:", error);
    res.status(500).json({ error: "Failed to fetch bet history" });
  }
});

export default router;
