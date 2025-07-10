<p align="center">
      <img src="./public/logo.png" alt="Lookiy Logo" width="200"/>
</p>


# 👁️ Lookiy — Smart Networking & Connection Visualizer

**Lookiy** is a fast and intelligent platform that helps people discover and connect in real-world environments like events, schools, organizations, hotels, cafés, or any gathering where people should meet, learn about each other, and grow together.

Whether you're attending a conference, managing a school club, or setting up a café community — Lookiy makes networking seamless, smart, and personal.

---

## ✨ Key Features

### 👤 User Management
- Register with name, email, password, description & interests
- Email verification & secure JWT login
- Reset password via OTP email
- Public or private profile visibility
- Avatar upload or random avatar generator

### 🌐 Network System
- Create public or private groups (networks)
- Join via @tagname, QR code, or invite link
- Passcode required for private networks
- Set network roles: Admins, Leaders, VIPs, Moderators
- Reset network passcode (admin only)

### 🤝 Connections & Community
- Send, accept, reject connection requests
- Turn off connection request access
- View and save followers
- Access limited profiles before connection approval
- Private in-network chat
- Public open space for posts with tagging

### 🔍 Discovery & Search
- Search users by name, interest, description, and network
- Tag and follow users in shared spaces
- View user-generated posts and statuses after connection

### 🧠 AI-Powered Recommendations
- Integrated with Hugging Face's `all-MiniLM-L6-v2` model
- Match users based on interests, description, goals, and activity
- Personalized suggestions within and across networks
- Users can select or create interest tags for deeper matching

---

## 🎯 Use Cases

- Conferences & expos  
- School groups and alumni networks  
- NGOs & community forums  
- Business hubs, hotels, or co-working spaces  
- Social clubs or activist movements  

Where people gather — **Lookiy** brings connections to life.

---

## 🧰 Tech Stack

- **Backend:** Node.js + Express
- **Database:** PostgreSQL
- **Authentication:** JWT, OTP, Email Verification
- **AI Matching:** Hugging Face `all-MiniLM-L6-v2` + FAISS
- **Messaging:**  Socket.IO (optional)
- **QR & Sharing:** Dynamic QR code and tagname generator
- **Deployment:** Docker, Render, Railway, or cloud provider

---

## 🛠️ Getting Started

```bash
# 1. Clone the repository
git clone https://github.com/kalungirasuli/lookiy.git

# 2. Navigate to the backend
cd lookiyserver

# 3. Install dependencies
npm install    

# 4. Setup environment variables
cp .env.example .env

# 5. Run the app
npm run dev   

```
# Contributing
[🔐 [ISSUE] Implement User Registration with Email Verification #28
](https://github.com/kalungirasuli/lookiyserver/issues/28)
[🧾 [ISSUE] User Privacy Options (Public vs Network-Only) #21
](https://github.com/kalungirasuli/lookiyserver/issues/21)
[📁 [ISSUE] Save & List Connections (Followers) #20
](https://github.com/kalungirasuli/lookiyserver/issues/20)
[🧠 [ISSUE] Create Interest Tags for Smart Matching #18
](https://github.com/kalungirasuli/lookiyserver/issues/18)
[👀 [ISSUE] View Profiles Before Connection Approval #17
](https://github.com/kalungirasuli/lookiyserver/issues/17)
[🧵 [ISSUE] Recommend Users via HuggingFace all-MiniLM-L6-v2 #16
](https://github.com/kalungirasuli/lookiyserver/issues/16)
[🔍 [ISSUE] Search Users in Network #15
](https://github.com/kalungirasuli/lookiyserver/issues/15)
[📣 [ISSUE] Post in Network Open Space #14
](https://github.com/kalungirasuli/lookiyserver/issues/14)
[🗨️ [ISSUE] Implement Private Messaging in Network #13
](https://github.com/kalungirasuli/lookiyserver/issues/13)
[🛑 [ISSUE] Block Incoming Connection Requests #12
](https://github.com/kalungirasuli/lookiyserver/issues/12)
[🔗 [ISSUE] Send & Manage Connection Requests #11
](https://github.com/kalungirasuli/lookiyserver/issues/11)
[🧩 [ISSUE] Set Network Hierarchy Roles #10
](https://github.com/kalungirasuli/lookiyserver/issues/10)
[🧑‍🤝‍🧑 [ISSUE] View Network Members #9
](https://github.com/kalungirasuli/lookiyserver/issues/9)
[🔐 [ISSUE] Reset Network Passcode (Admin Only) #8
](https://github.com/kalungirasuli/lookiyserver/issues/8)
[➕ [ISSUE] Join Network [Public/Private] #7
](https://github.com/kalungirasuli/lookiyserver/issues/7)
[🔎 [ISSUE] Search Networks by Tag Name #6
](https://github.com/kalungirasuli/lookiyserver/issues/6)
[🌐 [ISSUE] Create Network (Group) [Public/Private] #5
](https://github.com/kalungirasuli/lookiyserver/issues/5)
[🧾 [ISSUE] User Profile Editing #4
](https://github.com/kalungirasuli/lookiyserver/issues/4)
[🔑 [ISSUE] JWT-Based User Login #3
](https://github.com/kalungirasuli/lookiyserver/issues/3)
[🔄 [ISSUE] OTP-Based Password Reset #2
](https://github.com/kalungirasuli/lookiyserver/issues/2)
[📋 [ISSUE] Data collections from users. #29
](https://github.com/kalungirasuli/lookiyserver/issues/29)
