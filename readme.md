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
