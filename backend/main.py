"""
Barangay File Manager — FastAPI Backend
========================================
Entry point for all API routes.

Run locally:
    uvicorn main:app --reload --port 8000

Run on Render / Azure / DigitalOcean (dynamic port):
    uvicorn main:app --host 0.0.0.0 --port $PORT
"""

import os
from datetime import datetime, timedelta, date, time
from typing import Optional, List

import bcrypt
import mysql.connector
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr

# ---------------------------------------------------------------------------
# 1. Load environment variables from .env (never hardcode credentials!)
# ---------------------------------------------------------------------------
load_dotenv()

DB_HOST     = os.getenv("DB_HOST", "localhost")
DB_PORT     = int(os.getenv("DB_PORT", 3306))
DB_USER     = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME     = os.getenv("DB_NAME", "barangay_db")

# JWT configuration — change SECRET_KEY in production!
SECRET_KEY      = os.getenv("SECRET_KEY", "change-me-in-production-please")
ALGORITHM       = "HS256"
TOKEN_EXPIRE_MINUTES = 60 * 8   # 8-hour sessions

# ---------------------------------------------------------------------------
# 2. FastAPI app + CORS middleware
#    allow_origins=["*"] lets any frontend (localhost, Netlify, etc.) connect.
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Barangay File Manager API",
    description="Backend for the Barangay Document Request System",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# ---------------------------------------------------------------------------
# 3. Database helper — opens a fresh connection per request
#    In production you would use a connection pool, but this is clear for MVP.
# ---------------------------------------------------------------------------
def get_db():
    """Yield a MySQL connection and close it when the request finishes."""
    conn = mysql.connector.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        autocommit=False,
        ssl_disabled=False
    )
    try:
        yield conn
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# 4. Pydantic Models (request/response schemas)
# ---------------------------------------------------------------------------

# --- Auth ---
class UserRegister(BaseModel):
    full_name:  str
    email:      EmailStr
    password:   str
    phone:      Optional[str] = None
    address:    Optional[str] = None

class UserOut(BaseModel):
    id:         int
    full_name:  str
    email:      str
    role:       str
    phone:      Optional[str]
    address:    Optional[str]
    created_at: datetime

class Token(BaseModel):
    access_token:   str
    token_type:     str
    user:           UserOut

# --- Document Requests ---
class RequestCreate(BaseModel):
    document_type:  str
    purpose:        Optional[str] = None

class RequestUpdate(BaseModel):
    """Admin uses this to update status, pickup schedule, and notes."""
    status:         Optional[str] = None
    pickup_date:    Optional[str] = None    # "YYYY-MM-DD"
    pickup_time:    Optional[str] = None    # "HH:MM"
    admin_notes:    Optional[str] = None

# --- Messages ---
class MessageCreate(BaseModel):
    body: str


# ---------------------------------------------------------------------------
# 5. Auth utilities
# ---------------------------------------------------------------------------

def hash_password(plain: str) -> str:
    """Return a bcrypt hash of the plain-text password."""
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(12)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    """Check a plain-text password against its bcrypt hash."""
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(data: dict) -> str:
    """Create a signed JWT that expires in TOKEN_EXPIRE_MINUTES."""
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(minutes=TOKEN_EXPIRE_MINUTES)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db=Depends(get_db)
) -> dict:
    """
    Decode the JWT and look up the user in the database.
    Raises 401 if the token is invalid or user doesn't exist.
    """
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = int(payload.get("sub"))
        if user_id is None:
            raise credentials_exc
    except JWTError:
        raise credentials_exc

    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
    user = cursor.fetchone()
    cursor.close()

    if not user:
        raise credentials_exc
    return user


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """Dependency — raises 403 if the caller is not an admin."""
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required."
        )
    return current_user


# ---------------------------------------------------------------------------
# 6. AUTH Routes
# ---------------------------------------------------------------------------

@app.post("/auth/register", response_model=UserOut, status_code=201,
          summary="Register a new resident account")
def register(body: UserRegister, db=Depends(get_db)):
    """
    Anyone can register; role is always 'resident'.
    Admins are seeded directly in the database.
    """
    cursor = db.cursor(dictionary=True)

    # Check for duplicate email
    cursor.execute("SELECT id FROM users WHERE email = %s", (body.email,))
    if cursor.fetchone():
        raise HTTPException(status_code=409, detail="Email already registered.")

    hashed = hash_password(body.password)
    cursor.execute(
        """INSERT INTO users (full_name, email, password, role, phone, address)
           VALUES (%s, %s, %s, 'resident', %s, %s)""",
        (body.full_name, body.email, hashed, body.phone, body.address)
    )
    db.commit()
    new_id = cursor.lastrowid

    cursor.execute("SELECT * FROM users WHERE id = %s", (new_id,))
    user = cursor.fetchone()
    cursor.close()
    return user


@app.post("/auth/login", response_model=Token,
          summary="Login and receive a JWT access token")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db=Depends(get_db)):
    """
    Standard OAuth2 password flow.
    Returns a JWT and the user object so the frontend can store both.
    """
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT * FROM users WHERE email = %s", (form_data.username,))
    user = cursor.fetchone()
    cursor.close()

    if not user or not verify_password(form_data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_access_token({"sub": str(user["id"]), "role": user["role"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user
    }


@app.get("/auth/me", response_model=UserOut, summary="Get current user profile")
def me(current_user: dict = Depends(get_current_user)):
    return current_user


# ---------------------------------------------------------------------------
# 7. DOCUMENT REQUEST Routes
# ---------------------------------------------------------------------------

@app.post("/requests", status_code=201,
          summary="Resident submits a new document request")
def create_request(
    body: RequestCreate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Only residents can create requests for themselves."""
    if current_user["role"] != "resident":
        raise HTTPException(status_code=403, detail="Only residents can submit requests.")

    cursor = db.cursor(dictionary=True)
    cursor.execute(
        """INSERT INTO document_requests (resident_id, document_type, purpose)
           VALUES (%s, %s, %s)""",
        (current_user["id"], body.document_type, body.purpose)
    )
    db.commit()
    new_id = cursor.lastrowid

    cursor.execute(
        """SELECT dr.*, u.full_name, u.email, u.phone
           FROM document_requests dr
           JOIN users u ON dr.resident_id = u.id
           WHERE dr.id = %s""",
        (new_id,)
    )
    req = cursor.fetchone()
    cursor.close()

    # Serialize date/time fields so JSON can handle them
    return _serialize_request(req)


@app.get("/requests", summary="List document requests")
def list_requests(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """
    - Admins see ALL requests (sorted by newest first).
    - Residents see only their own requests.
    """
    cursor = db.cursor(dictionary=True)

    if current_user["role"] == "admin":
        cursor.execute(
            """SELECT dr.*, u.full_name, u.email, u.phone
               FROM document_requests dr
               JOIN users u ON dr.resident_id = u.id
               ORDER BY dr.created_at DESC"""
        )
    else:
        cursor.execute(
            """SELECT dr.*, u.full_name, u.email, u.phone
               FROM document_requests dr
               JOIN users u ON dr.resident_id = u.id
               WHERE dr.resident_id = %s
               ORDER BY dr.created_at DESC""",
            (current_user["id"],)
        )

    rows = cursor.fetchall()
    cursor.close()
    return [_serialize_request(r) for r in rows]


@app.get("/requests/{request_id}", summary="Get a single request by ID")
def get_request(
    request_id: int,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    cursor = db.cursor(dictionary=True)
    cursor.execute(
        """SELECT dr.*, u.full_name, u.email, u.phone
           FROM document_requests dr
           JOIN users u ON dr.resident_id = u.id
           WHERE dr.id = %s""",
        (request_id,)
    )
    req = cursor.fetchone()
    cursor.close()

    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")

    # Residents can only view their own requests
    if current_user["role"] == "resident" and req["resident_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied.")

    return _serialize_request(req)


@app.patch("/requests/{request_id}", summary="Admin updates a request status/schedule")
def update_request(
    request_id: int,
    body: RequestUpdate,
    admin: dict = Depends(require_admin),
    db=Depends(get_db)
):
    """
    Admin can change:
      - status (moves through the pipeline)
      - pickup_date / pickup_time (set on approval)
      - admin_notes (internal reminder)
    """
    cursor = db.cursor(dictionary=True)

    # Build a dynamic UPDATE query from only the provided fields
    fields = []
    values = []

    if body.status is not None:
        valid_statuses = [
            "Submitted", "Under Review",
            "Approved (Ready for Pickup)", "Claimed"
        ]
        if body.status not in valid_statuses:
            raise HTTPException(status_code=400, detail="Invalid status value.")
        fields.append("status = %s")
        values.append(body.status)

    if body.pickup_date is not None:
        fields.append("pickup_date = %s")
        values.append(body.pickup_date)

    if body.pickup_time is not None:
        fields.append("pickup_time = %s")
        values.append(body.pickup_time)

    if body.admin_notes is not None:
        fields.append("admin_notes = %s")
        values.append(body.admin_notes)

    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update.")

    values.append(request_id)
    cursor.execute(
        f"UPDATE document_requests SET {', '.join(fields)} WHERE id = %s",
        tuple(values)
    )
    db.commit()

    # Return the updated record
    cursor.execute(
        """SELECT dr.*, u.full_name, u.email, u.phone
           FROM document_requests dr
           JOIN users u ON dr.resident_id = u.id
           WHERE dr.id = %s""",
        (request_id,)
    )
    req = cursor.fetchone()
    cursor.close()

    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")

    return _serialize_request(req)


# ---------------------------------------------------------------------------
# 8. MESSAGE Routes  (message log / chat)
# ---------------------------------------------------------------------------

@app.post("/requests/{request_id}/messages", status_code=201,
          summary="Post a message on a request")
def post_message(
    request_id: int,
    body: MessageCreate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Both admin and resident can post messages to a request thread."""
    cursor = db.cursor(dictionary=True)

    # Make sure the request exists
    cursor.execute("SELECT id, resident_id FROM document_requests WHERE id = %s",
                   (request_id,))
    req = cursor.fetchone()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")

    # Residents may only post on their own requests
    if current_user["role"] == "resident" and req["resident_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied.")

    cursor.execute(
        """INSERT INTO messages (request_id, sender_id, sender_role, body)
           VALUES (%s, %s, %s, %s)""",
        (request_id, current_user["id"], current_user["role"], body.body)
    )
    db.commit()
    new_id = cursor.lastrowid

    cursor.execute(
        """SELECT m.*, u.full_name
           FROM messages m JOIN users u ON m.sender_id = u.id
           WHERE m.id = %s""",
        (new_id,)
    )
    msg = cursor.fetchone()
    cursor.close()
    return _serialize_message(msg)


@app.get("/requests/{request_id}/messages",
         summary="Get all messages for a request")
def get_messages(
    request_id: int,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    cursor = db.cursor(dictionary=True)

    # Verify access
    cursor.execute("SELECT resident_id FROM document_requests WHERE id = %s",
                   (request_id,))
    req = cursor.fetchone()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")
    if current_user["role"] == "resident" and req["resident_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied.")

    cursor.execute(
        """SELECT m.*, u.full_name
           FROM messages m JOIN users u ON m.sender_id = u.id
           WHERE m.request_id = %s
           ORDER BY m.created_at ASC""",
        (request_id,)
    )
    rows = cursor.fetchall()
    cursor.close()
    return [_serialize_message(r) for r in rows]


# ---------------------------------------------------------------------------
# 9. ADMIN ANALYTICS Route
# ---------------------------------------------------------------------------

@app.get("/admin/analytics", summary="Dashboard statistics for admin")
def get_analytics(admin: dict = Depends(require_admin), db=Depends(get_db)):
    """
    Returns counts used by the admin dashboard cards:
      - total_requests
      - pending  (Submitted + Under Review)
      - approved (Approved / Ready for Pickup)
      - claimed
      - scheduled_today (pickup_date = today)
    """
    cursor = db.cursor(dictionary=True)
    today = date.today().isoformat()

    cursor.execute("SELECT COUNT(*) AS cnt FROM document_requests")
    total = cursor.fetchone()["cnt"]

    cursor.execute(
        """SELECT COUNT(*) AS cnt FROM document_requests
           WHERE status IN ('Submitted', 'Under Review')"""
    )
    pending = cursor.fetchone()["cnt"]

    cursor.execute(
        """SELECT COUNT(*) AS cnt FROM document_requests
           WHERE status = 'Approved (Ready for Pickup)'"""
    )
    approved = cursor.fetchone()["cnt"]

    cursor.execute(
        "SELECT COUNT(*) AS cnt FROM document_requests WHERE status = 'Claimed'"
    )
    claimed = cursor.fetchone()["cnt"]

    cursor.execute(
        "SELECT COUNT(*) AS cnt FROM document_requests WHERE pickup_date = %s",
        (today,)
    )
    scheduled_today = cursor.fetchone()["cnt"]

    cursor.close()
    return {
        "total_requests":   total,
        "pending":          pending,
        "approved":         approved,
        "claimed":          claimed,
        "scheduled_today":  scheduled_today,
    }


# ---------------------------------------------------------------------------
# 10. Serialization helpers
#     MySQL returns date/time as Python objects; we convert to strings for JSON.
# ---------------------------------------------------------------------------

def _serialize_request(req: dict) -> dict:
    if req is None:
        return req
    r = dict(req)
    if isinstance(r.get("created_at"), datetime):
        r["created_at"] = r["created_at"].isoformat()
    if isinstance(r.get("updated_at"), datetime):
        r["updated_at"] = r["updated_at"].isoformat()
    if isinstance(r.get("pickup_date"), date):
        r["pickup_date"] = r["pickup_date"].isoformat()
    if isinstance(r.get("pickup_time"), timedelta):
        # MySQL TIME comes back as timedelta in mysql-connector
        total_seconds = int(r["pickup_time"].total_seconds())
        hours, remainder = divmod(total_seconds, 3600)
        minutes = remainder // 60
        r["pickup_time"] = f"{hours:02d}:{minutes:02d}"
    return r


def _serialize_message(msg: dict) -> dict:
    if msg is None:
        return msg
    m = dict(msg)
    if isinstance(m.get("created_at"), datetime):
        m["created_at"] = m["created_at"].isoformat()
    return m


from fastapi.staticfiles import StaticFiles
app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")