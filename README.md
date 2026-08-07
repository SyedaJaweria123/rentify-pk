# Rentify PK 🏠

**Rent Anything, Anytime, Anywhere** — A peer-to-peer rental marketplace built for the Pakistani market.

Graduation Project — Aptech Learning (Vision 2026)
Built by: Syeda Jaweria & Fizzah Batool

🔗 **Live Site:** https://rentify-pk-eight.vercel.app
🔗 **Backend API:** https://rentify-backend-h7mv.onrender.com

---

## 📌 About

Rentify PK lets users rent out or rent in almost anything — cameras, tools, furniture, vehicles, and more. It includes AI-powered CNIC verification, escrow-based payments, live rider tracking, and a Gemini-powered chatbot.

## 👥 User Roles

- **Owner** — lists items for rent
- **Renter** — browses and books items
- **Rider** — handles delivery
- **Admin** — manages the whole platform via a dedicated dashboard

## ✨ Key Features

- 🔒 AI-powered CNIC verification (Gemini Vision + liveness detection)
- ⭐ Trust score system (affects advance payment percentage)
- 💰 Escrow-based payments (Bank Transfer, JazzCash, Easypaisa, COD)
- 🚚 Rider delivery system with live GPS tracking (Leaflet.js) and QR handover
- 🤖 RentBot — Gemini AI chatbot
- 💬 Real-time chat (voice notes, media sharing, location sharing) via Socket.IO
- 📹 Video/voice calling (ZegoCloud)
- 📊 Full admin dashboard with analytics

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Angular |
| Backend | Node.js, Express |
| Database | MongoDB |
| Realtime | Socket.IO |
| AI | Google Gemini Vision |
| Media | Cloudinary |
| Calling | ZegoCloud |
| Hosting | Vercel (frontend), Render (backend), MongoDB Atlas (database) |

---

## 🚀 Running the Project Locally

### Prerequisites
- Node.js installed
- MongoDB installed locally (or use a MongoDB Atlas connection string)
- Git installed

### 1. Clone the repository
```bash
git clone https://github.com/SyedaJaweria123/rentify-pk.git
cd rentify-pk
```

### 2. Backend Setup
```bash
cd backend
npm install
```

Create a `.env` file inside the `backend` folder with the following (fill in your own keys):
Start the backend:
```bash
node server.js
```
Backend runs at `http://localhost:5000`

### 3. Frontend Setup
Open a new terminal:
```bash
cd frontend
npm install
```

Check `frontend/src/environments/environment.ts` has:
```typescript
apiUrl: 'http://localhost:5000/api'
```

Start the frontend:
```bash
ng serve
```
Frontend runs at `http://localhost:4200`

### 4. Open the app
Visit `http://localhost:4200` in your browser.

---

## 🌐 Deployment

This project is deployed across three free-tier services:

| Part | Service |
|---|---|
| Database | MongoDB Atlas |
| Backend | Render |
| Frontend | Vercel |

> Note: Render's free tier spins down after 15 minutes of inactivity — the first request after idle time may take 30–60 seconds to respond.

---

## 📄 License

This project was built as a graduation project for educational purposes.