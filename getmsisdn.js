require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const pool = require("./db");
const authMiddleware = require("./middleware/auth");
const app = express();
const port = process.env.SERVER_PORT;

app.use(cors({ origin: "http://localhost:13.60.236.60" }));
app.use(express.json({ limit: "300mb" }));
app.use(bodyParser.json({ limit: "300mb" }));

app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required" });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const query = "INSERT INTO users (username, password) VALUES (?, ?)";
    await pool.query(query, [username, hashedPassword]);
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "Username already exists" });
    }
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE username = ?", [
      username,
    ]);
    if (rows.length === 0) {
      return res.status(400).json({ error: "Invalid credentials" });
    }
    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES || "1h" }
    );
    res.json({ token });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/api/protected", authMiddleware, (req, res) => {
  res.json({ message: "You accessed a protected route!", user: req.user });
});

app.get("/api/msisdns", authMiddleware, async (req, res) => {
  const { page = 1, limit = 100 } = req.query;
  const offset = (page - 1) * limit;
  const query = "SELECT DISTINCT MSISDN FROM events LIMIT ? OFFSET ?";
  try {
    const [results] = await pool.query(query, [
      parseInt(limit),
      parseInt(offset),
    ]);
    res.json({
      page: parseInt(page),
      limit: parseInt(limit),
      total: results.length,
      data: results.map((row) => row.MSISDN),
    });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/api/msisdns/search", authMiddleware, async (req, res) => {
  const searchTerm = req.query.q;
  if (!searchTerm) {
    return res.status(400).json({ error: "Search term is required" });
  }
  const query =
    "SELECT DISTINCT MSISDN FROM events WHERE MSISDN LIKE ? LIMIT 100";
  try {
    const [results] = await pool.query(query, [`%${searchTerm}%`]);
    res.json(results.map((row) => row.MSISDN));
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/api/getData", authMiddleware, async (req, res) => {
  const { msisdns, eventName } = req.body;
  if (
    !Array.isArray(msisdns) ||
    msisdns.length === 0 ||
    eventName === undefined
  ) {
    return res
      .status(400)
      .json({ error: "Invalid input, send msisdns array and eventName." });
  }
  const columns =
    eventName === 1
      ? "timestamp, eventName, MSISDN, classIdentifier, maxUploadBitRate, maxDownloadBitRate"
      : "timestamp, eventName, MSISDN, ip, crName, fup_to_full, full_to_fup, fup_status, multisim_flag";
  const query = `SELECT ${columns} FROM events WHERE MSISDN IN (?) AND eventName = ?`;
  try {
    const [results] = await pool.query(query, [msisdns, eventName]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/api/getAllDataByMSISDNs", authMiddleware, async (req, res) => {
  const { msisdns } = req.body;
  if (!Array.isArray(msisdns) || msisdns.length === 0) {
    return res
      .status(400)
      .json({ error: "Invalid input, please send an array of MSISDN values." });
  }
  const placeholders = msisdns.map(() => "?").join(",");
  const query = `SELECT * FROM events WHERE MSISDN IN (${placeholders})`;
  try {
    const [results] = await pool.query(query, msisdns);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});
app.post("/api/getLatestDataByMSISDNs", authMiddleware, async (req, res) => {
  try {
    const { msisdns, eventName } = req.body;
    if (!Array.isArray(msisdns) || msisdns.length === 0) {
      return res.status(400).json({
        error: "Invalid input. Please send an array of MSISDN values.",
      });
    }

    const columns =
      eventName === 1
        ? "e.timestamp, e.eventName, e.MSISDN, e.classIdentifier, e.maxUploadBitRate, e.maxDownloadBitRate"
        : "e.timestamp, e.eventName, e.MSISDN, e.ip, e.crName, e.fup_to_full, e.full_to_fup, e.fup_status, e.multisim_flag";

    const placeholders = msisdns.map(() => "?").join(",");

    let query = `
      SELECT ${columns} FROM events e
      JOIN (
          SELECT MSISDN, MAX(timestamp) AS latest_timestamp FROM events
          WHERE MSISDN IN (${placeholders}) ${
      eventName !== undefined ? "AND eventName = ?" : ""
    }
          GROUP BY MSISDN
      ) latest_events
      ON e.MSISDN = latest_events.MSISDN 
      AND e.timestamp = latest_events.latest_timestamp
      ${eventName !== undefined ? "AND e.eventName = ?" : ""};
    `;

    const queryParams =
      eventName !== undefined ? [...msisdns, eventName, eventName] : msisdns;

    // Using async/await for the query
    const [results] = await pool.query(query, queryParams);

    if (results.length === 0) {
      return res.status(404).json({
        message: "No records found for the given MSISDNs and eventName.",
      });
    }

    res.json(results);
  } catch (err) {
    console.error("Database query error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
console.log(`Running on Node.js version: ${process.version}`);

app.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Server running on :${port} and ${process.env.DB_HOST}`);
});
