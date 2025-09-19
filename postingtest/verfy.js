// verifyUsers.js
const fs = require("fs");
const fetch = require("node-fetch"); // if Node < 18, install with: npm install node-fetch

// Read your log file
const logText = fs.readFileSync("../logs/combined.log", "utf-8");

// Extract userIds
const regex = /"message":"User registered successfully","userId":"(.*?)"/g;
const userIds = [];
let match;
while ((match = regex.exec(logText)) !== null) {
  userIds.push(match[1]);
}

console.log(`Found ${userIds.length} user IDs. Sending verification requests...`);

// Function to verify a single user
async function verifyUser(userId) {
  const url = `http://localhost:3000/v1/auth/verify-email/?token=${userId}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log(`User ${userId}:`, data);
  } catch (err) {
    console.error(`User ${userId} failed:`, err.message);
  }
}

// Send requests sequentially
(async () => {
  for (const id of userIds) {
    await verifyUser(id);
  }
})();
