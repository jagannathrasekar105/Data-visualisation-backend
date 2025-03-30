const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: "datav.cjimqy0oeso9.eu-north-1.rds.amazonaws.com",
  user: "admin",
  password: "password105",
  database: "readcsv",
  port: 1616,
});

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log("✅ Connected to the database!");
    conn.release();
  } catch (error) {
    console.error("❌ Error connecting to database:", error.message);
  }
}

testConnection();
