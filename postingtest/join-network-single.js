// join-network-single.js - Script to join a specific network with a single user
const fs = require("fs");
const fetch = require("node-fetch"); // if Node < 18, install with: npm install node-fetch

const users = JSON.parse(fs.readFileSync("users.json", "utf-8"));
const BASE_URL = "http://localhost:3000";
const NETWORK_ID = "d4043ed6-9707-4907-b836-c989351e6c60";

// Use the first user from the list
const user = users[0];

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

// Main function
async function joinNetworkForUser() {
  console.log(`🚀 Joining network: ${NETWORK_ID}`);
  console.log(`👤 User: ${user.email}\n`);

  // Step 1: Login
  const token = await loginUser(user.email, user.password);
  if (!token) {
    console.log(`❌ Failed to login user`);
    return;
  }

  // Step 2: Try to join network directly
  const joinSuccess = await joinNetwork(token, NETWORK_ID, user.email);
  if (joinSuccess) {
    console.log(`✅ Successfully joined network!`);
    return;
  }

  // Step 3: If direct join fails, try request to join
  const requestSuccess = await requestJoinNetwork(token, NETWORK_ID, user.email);
  if (requestSuccess) {
    console.log(`📝 Join request sent successfully!`);
  } else {
    console.log(`❌ Failed to join or request to join network`);
  }
}

// Run the script
joinNetworkForUser().catch(console.error);