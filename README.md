# 🏛 Barangay File Manager — MVP

A full-stack document request and tracking system for a Barangay hall.
Built with **FastAPI + MySQL + Vanilla JS + Tailwind CSS**.

---

## 📁 File Structure

```
barangay-file-manager/
├── database/
│   └── schema.sql          # Run this once to set up MySQL tables + default admin
├── backend/
│   ├── main.py             # FastAPI app — all routes and business logic
│   ├── requirements.txt    # Python dependencies
│   └── .env.example        # Copy this to .env and fill in your credentials
└── frontend/
    ├── index.html          # Resident portal (login + dashboard)
    ├── admin.html          # Admin dashboard
    └── app.js              # All frontend JavaScript logic
```

---

## ⚙️ Setup Instructions

### Step 1 — Database

1. Open MySQL Workbench (or terminal).
2. Run `database/schema.sql`. This creates the `barangay_db` database and all tables.
3. A default admin account is seeded automatically:
   - **Email:** `admin@barangay.gov.ph`
   - **Password:** `admin123`

### Step 2 — Backend

```bash
# Navigate to backend folder
cd backend

# Create a virtual environment
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy and edit the environment file
cp .env.example .env
# Open .env and fill in DB_PASSWORD and SECRET_KEY
```

### Step 3 — Run the backend

```bash
# Local development
uvicorn main:app --reload --port 8000

# Cloud deployment (Render / Azure / DigitalOcean)
uvicorn main:app --host 0.0.0.0 --port $PORT
```

The API will be live at: `http://localhost:8000`
Interactive API docs: `http://localhost:8000/docs`

### Step 4 — Frontend

Simply open `frontend/index.html` in your browser.

> **If your backend is NOT on localhost:8000**, edit the first line of `frontend/app.js`:
> ```javascript
> const API_BASE = "https://your-deployed-backend.onrender.com";
> ```

---

## 🚀 Cloud Deployment (Render.com)

1. Push this repo to GitHub.
2. On Render, create a **Web Service** pointing to the `backend/` folder.
3. Set **Build Command:** `pip install -r requirements.txt`
4. Set **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add environment variables in the Render dashboard (same as `.env`).
6. For the frontend, deploy `frontend/` as a **Static Site** on Render or Netlify.

---

## 🔑 Default Credentials (for testing)

| Role     | Email                        | Password   |
|----------|------------------------------|------------|
| Admin    | admin@barangay.gov.ph        | admin123   |
| Resident | Register via the web form    | your choice |

---

## 📋 Features Implemented

- ✅ Role-Based Access Control (Admin / Resident)
- ✅ 7 document types with automatic requirements display
- ✅ Status tracker: Submitted → Under Review → Approved → Claimed
- ✅ Message log (chat) per request (admin + resident can both post)
- ✅ Pickup date & time scheduling by admin
- ✅ Admin analytics dashboard (totals, pending, scheduled today)
- ✅ Mock SMS notification on approval
- ✅ JWT authentication
- ✅ dotenv-based credentials (cloud-ready)
- ✅ CORS enabled for any origin
