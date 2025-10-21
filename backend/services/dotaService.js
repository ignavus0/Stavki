import axios from "axios";
import { db } from "../server.js";

export async function fetchDotaMatches() {
  try {
    console.log("⏳ Fetching Dota matches...");
    const res = await axios.get("https://api.opendota.com/api/proMatches");
    const matches = res.data.slice(0, 20);

    for (const m of matches) {
      const odds = {
        team1: (Math.random() * 2 + 1).toFixed(2),
        team2: (Math.random() * 2 + 1).toFixed(2),
      };

      await db.query(
        `
        INSERT INTO matches (external_id, sport, team1, team2, start_time, status, odds)
        VALUES ($1, 'dota2', $2, $3, NOW(), 'NS', $4)
        ON CONFLICT (external_id)
        DO UPDATE SET odds = EXCLUDED.odds
      `,
        [String(m.match_id), m.radiant_name, m.dire_name, odds]
      );
    }

    console.log("✅ Dota matches updated successfully");
  } catch (err) {
    console.error("❌ Error fetching Dota matches:", err.message);
  }
}
