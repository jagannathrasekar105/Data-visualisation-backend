const fs = require("fs");
const csv = require("csv-parser");
const pool = require("./db"); // Import the MySQL pool

const importCsvData = async (csvFilePath) => {
  try {
    const results = [];

    // Read and parse the CSV file
    await new Promise((resolve, reject) => {
      fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on("data", (data) => {
          results.push(data);
        })
        .on("end", resolve)
        .on("error", reject);
    });

    if (results.length === 0) {
      console.log("No data found in CSV. Skipping database insertion.");
      return;
    }

    // Insert parsed data into MySQL
    await insertData(results);
  } catch (error) {
    console.error("Error processing CSV:", error);
  }
};

const insertData = async (data) => {
  const query = `
    INSERT INTO events 
    (timestamp, eventName, MSISDN, ip, crName, classIdentifier, maxUploadBitRate, maxDownloadBitRate, fup_to_full, full_to_fup, fup_status, multisim_flag) 
    VALUES ?
  `;

  const values = data.map((row) => [
    row.timestamp,
    row.eventName,
    row.MSISDN,
    row.ip,
    row.crName,
    row.classIdentifier,
    isNaN(row.maxUploadBitRate) || row.maxUploadBitRate === ""
      ? null
      : parseFloat(row.maxUploadBitRate),
    isNaN(row.maxDownloadBitRate) || row.maxDownloadBitRate === ""
      ? null
      : parseFloat(row.maxDownloadBitRate),
    row.fup_to_full === "" ? null : row.fup_to_full,
    row.full_to_fup === "" ? null : row.full_to_fup,
    row.fup_status === "" ? null : row.fup_status,
    row.multisim_flag === "" ? null : row.multisim_flag,
  ]);

  try {
    const [results] = await pool.query(query, [values]);
    console.log("Inserted rows:", results.affectedRows);
  } catch (error) {
    console.error("Error inserting data:", error);
  }
};

// Run the function
importCsvData("C:\\Users\\ws_htu1065\\Downloads\\backend-nodejs\\data.csv");

///db
// create database readcsv;
// use readcsv;
// select * from users;
// DROP TABLE IF EXISTS events;
// DELETE FROM users WHERE id = 41;

// CREATE TABLE events (
//     timestamp VARCHAR(255),
//     eventName VARCHAR(255),
//     MSISDN VARCHAR(20),
//     ip VARCHAR(50),
//     crName VARCHAR(255),
//     classIdentifier VARCHAR(255),
//     maxUploadBitRate FLOAT,
//     maxDownloadBitRate FLOAT,
//     fup_to_full VARCHAR(255),
//     full_to_fup VARCHAR(255),
//     fup_status VARCHAR(255),
//     multisim_flag VARCHAR(255)
// );
// TRUNCATE TABLE events;
// select distinct MSISDN from events limit 100 offset 200;
