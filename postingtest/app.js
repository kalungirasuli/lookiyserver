// app.js (CommonJS)
const fs = require("fs");
const fetch = (...args) => import("node-fetch").then(({default: fetch}) => fetch(...args));

const users = JSON.parse(fs.readFileSync("users.json", "utf-8"));
const BASE_URL = "http://localhost:3000/v1/auth/register";

async function registerUsers() {
  for (const user of users) {
    try {
      const res = await fetch(BASE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(user),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`❌ Failed for ${user.email}: ${text}`);
      } else {
        const data = await res.json();
        console.log(`✅ Registered: ${user.email}`, data);
      }
    } catch (err) {
      console.error(`❌ Error for ${user.email}:`, err.message);
    }
  }
}

registerUsers();
