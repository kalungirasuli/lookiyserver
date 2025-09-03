// join-network.js - Script to join a specific network
const fs = require("fs");
const fetch = require("node-fetch"); // if Node < 18, install with: npm install node-fetch

const users = JSON.parse(fs.readFileSync("users.json", "utf-8"));
const BASE_URL = "http://localhost:3000";
const NETWORK_ID = "d4043ed6-9707-4907-b836-c989351e6c60";

// Function to login and get authentication token
async function loginUser(email, password) {
  try {
    const res = await fetch(`${BASE_URL}/V1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`❌ Login failed for ${email}: ${text}`);
      return null;
    }

    const data = await res.json();
    console.log(`✅ Logged in: ${email}`);
    return data.token;
  } catch (err) {
    console.error(`❌ Login error for ${email}:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

// Function to join network
async function joinNetwork(token, networkId, userEmail) {
  try {
    const res = await fetch(`${BASE_URL}/V1/networks/${networkId}/join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({}), // Empty body, no passcode or invite token
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`❌ Failed to join network for ${userEmail}: ${text}`);
      return false;
    }

    const data = await res.json();
    console.log(`✅ ${userEmail} successfully joined network:`, data);
    return true;
  } catch (err) {
    console.error(`❌ Network join error for ${userEmail}:`, err instanceof Error ? err.message : String(err));
    return false;
  }
}

// Function to request to join network (if auto-join fails)
async function requestJoinNetwork(token, networkId, userEmail) {
  try {
    const res = await fetch(`${BASE_URL}/V1/networks/${networkId}/request-join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({}), // Empty body, no passcode
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`❌ Failed to request join for ${userEmail}: ${text}`);
      return false;
    }

    const data = await res.json();
    console.log(`✅ ${userEmail} successfully requested to join network:`, data);
    return true;
  } catch (err) {
    console.error(`❌ Network join request error for ${userEmail}:`, err instanceof Error ? err.message : String(err));
    return false;
  }
}

// Main function to process all users
async function joinNetworkForAllUsers() {
  console.log(`🚀 Starting network join process for network: ${NETWORK_ID}`);
  console.log(`📊 Processing ${users.length} users...\n`);

  let successCount = 0;
  let requestCount = 0;
  let failCount = 0;

  for (const user of users) {
    console.log(`\n🔄 Processing: ${user.email}`);
    
    // Step 1: Login
    const token = await loginUser(user.email, user.password);
    if (!token) {
      failCount++;
      continue;
    }

    // Step 2: Try to join network directly
    const joinSuccess = await joinNetwork(token, NETWORK_ID, user.email);
    if (joinSuccess) {
      successCount++;
      continue;
    }

    // Step 3: If direct join fails, try request to join
    const requestSuccess = await requestJoinNetwork(token, NETWORK_ID, user.email);
    if (requestSuccess) {
      requestCount++;
    } else {
      failCount++;
    }

    // Add small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Summary
  console.log(`\n📈 SUMMARY:`);
  console.log(`✅ Successfully joined: ${successCount}`);
  console.log(`📝 Join requests sent: ${requestCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📊 Total processed: ${users.length}`);
}

// Run the script
joinNetworkForAllUsers().catch(console.error);