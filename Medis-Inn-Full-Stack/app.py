import os, sqlite3, math
from functools import wraps
from flask import Flask, render_template, request, jsonify, session, redirect, url_for, flash
from werkzeug.security import generate_password_hash, check_password_hash

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DB_PATH = os.path.join(BASE_DIR, "medis_inn.db")
app = Flask(__name__)
app.secret_key = os.environ.get("MEDIS_INN_SECRET", "change-this-demo-secret-before-deployment")
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax")

DEMO_PHARMACIES = [
    ("GreenCare Pharmacy", "12 Lake View Road, Chennai", 13.0604, 80.2496),
    ("City Meds Pharmacy", "45 Main Road, Chennai", 13.0678, 80.2502),
    ("Wellness Corner", "8 Market Street, Chennai", 13.0526, 80.2428),
    ("Sunrise Medicals", "21 Park Avenue, Chennai", 13.0755, 80.2634),
    ("People's Pharmacy", "5 Station Road, Chennai", 13.0399, 80.2702),
    ("CarePlus Medicals", "77 Garden Road, Chennai", 13.0845, 80.2350),
]
# Demonstration stock only. Do not treat this seed data as real inventory.
DEMO_MEDICINES = [
    ("Paracetamol", "500 mg", 32.00, 28), ("Paracetamol", "500 mg", 35.00, 12),
    ("Paracetamol", "500 mg", 30.00, 4), ("Paracetamol", "500 mg", 38.00, 18),
    ("Paracetamol", "500 mg", 34.00, 2), ("Paracetamol", "500 mg", 36.00, 41),
    ("Cetirizine", "10 mg", 22.00, 15), ("Cetirizine", "10 mg", 25.00, 3),
    ("ORS", " sachet", 20.00, 30), ("ORS", " sachet", 18.00, 8),
    ("Antacid", "tablets", 45.00, 22), ("Antacid", "tablets", 42.00, 5),
    ("Vitamin C", "500 mg", 60.00, 14), ("Vitamin C", "500 mg", 55.00, 27),
]

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    with get_db() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('customer','owner')),
          pharmacy_id INTEGER,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(pharmacy_id) REFERENCES pharmacies(id)
        );
        CREATE TABLE IF NOT EXISTS pharmacies (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          address TEXT NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          owner_user_id INTEGER,
          FOREIGN KEY(owner_user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS medicines (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pharmacy_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          strength TEXT DEFAULT '',
          price REAL NOT NULL CHECK(price >= 0),
          stock_quantity INTEGER NOT NULL CHECK(stock_quantity >= 0),
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(pharmacy_id) REFERENCES pharmacies(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_medicine_name ON medicines(name);
        CREATE INDEX IF NOT EXISTS idx_medicine_pharmacy ON medicines(pharmacy_id);
        """)
        if db.execute("SELECT COUNT(*) FROM pharmacies").fetchone()[0] == 0:
            for name, address, lat, lng in DEMO_PHARMACIES:
                db.execute("INSERT INTO pharmacies(name,address,latitude,longitude) VALUES(?,?,?,?)",
                           (name,address,lat,lng))
            for i, (name, strength, price, stock) in enumerate(DEMO_MEDICINES):
                pharmacy_id = (i % len(DEMO_PHARMACIES)) + 1
                db.execute("INSERT INTO medicines(pharmacy_id,name,strength,price,stock_quantity) VALUES(?,?,?,?,?)",
                           (pharmacy_id,name,strength.strip(),price,stock))
        # Create easy-to-test demo accounts if not present.
        if not db.execute("SELECT 1 FROM users WHERE email=?", ("customer@medisinn.demo",)).fetchone():
            db.execute("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)",
                       ("Demo Customer","customer@medisinn.demo",generate_password_hash("Customer123!"),"customer"))
        if not db.execute("SELECT 1 FROM users WHERE email=?", ("owner@medisinn.demo",)).fetchone():
            owner_pharmacy = db.execute("SELECT id FROM pharmacies WHERE name=?", ("GreenCare Pharmacy",)).fetchone()
            cur = db.execute("INSERT INTO users(name,email,password_hash,role,pharmacy_id) VALUES(?,?,?,?,?)",
                       ("Demo Pharmacy Owner","owner@medisinn.demo",generate_password_hash("Owner123!"),"owner",owner_pharmacy["id"] if owner_pharmacy else 1))
            db.execute("UPDATE pharmacies SET owner_user_id=? WHERE id=?", (cur.lastrowid, owner_pharmacy["id"] if owner_pharmacy else 1))

def login_required(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error":"Please sign in first."}), 401
        return fn(*args, **kwargs)
    return wrapped

def haversine(lat1, lon1, lat2, lon2):
    r=6371.0
    p=math.pi/180
    dlat=(lat2-lat1)*p; dlon=(lon2-lon1)*p
    a=math.sin(dlat/2)**2 + math.cos(lat1*p)*math.cos(lat2*p)*math.sin(dlon/2)**2
    return 2*r*math.asin(math.sqrt(a))

def stock_status(quantity):
    if quantity <= 5: return {"label":"Out of stock" if quantity == 0 else "Low stock","key":"low"}
    if quantity <= 19: return {"label":"Medium stock","key":"medium"}
    return {"label":"High stock","key":"high"}

@app.route("/")
def index():
    return render_template("index.html", user=session.get("name"), role=session.get("role"))

@app.post("/api/login")
def api_login():
    data=request.get_json(silent=True) or {}
    email=(data.get("email") or "").strip().lower()
    password=data.get("password") or ""
    requested_role=data.get("role")
    if not email or not password or requested_role not in ("customer","owner"):
        return jsonify({"error":"Enter email, password and account type."}),400
    with get_db() as db:
        user=db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    if not user or not check_password_hash(user["password_hash"],password) or user["role"] != requested_role:
        return jsonify({"error":"Login details or account type are incorrect."}),401
    session.clear()
    session["user_id"]=user["id"]; session["name"]=user["name"]; session["role"]=user["role"]
    session["pharmacy_id"]=user["pharmacy_id"]
    return jsonify({"ok":True,"name":user["name"],"role":user["role"]})

@app.post("/api/register")
def api_register():
    data=request.get_json(silent=True) or {}
    name=(data.get("name") or "").strip()
    email=(data.get("email") or "").strip().lower()
    password=data.get("password") or ""
    role=data.get("role")
    if not name or not email or len(password)<8 or role not in ("customer","owner"):
        return jsonify({"error":"Provide name, valid email, role, and a password of at least 8 characters."}),400
    try:
        with get_db() as db:
            if role=="owner":
                cur=db.execute("INSERT INTO pharmacies(name,address,latitude,longitude) VALUES(?,?,?,?)",
                    (name+"'s Pharmacy","Address to be updated, Chennai",13.0604,80.2496))
                pharmacy_id=cur.lastrowid
            else: pharmacy_id=None
            cur=db.execute("INSERT INTO users(name,email,password_hash,role,pharmacy_id) VALUES(?,?,?,?,?)",
                (name,email,generate_password_hash(password),role,pharmacy_id))
            if role=="owner":
                db.execute("UPDATE pharmacies SET owner_user_id=? WHERE id=?",(cur.lastrowid,pharmacy_id))
        return jsonify({"ok":True,"message":"Account created. Please sign in."})
    except sqlite3.IntegrityError:
        return jsonify({"error":"That email is already registered."}),409

@app.post("/api/logout")
def api_logout():
    session.clear()
    return jsonify({"ok":True})

@app.get("/api/me")
def api_me():
    if "user_id" not in session: return jsonify({"logged_in":False})
    return jsonify({"logged_in":True,"name":session.get("name"),"role":session.get("role")})

@app.get("/api/pharmacies")
@login_required
def api_pharmacies():
    lat=request.args.get("lat",type=float); lng=request.args.get("lng",type=float)
    with get_db() as db:
        rows=db.execute("SELECT * FROM pharmacies ORDER BY name").fetchall()
    result=[]
    for p in rows:
        d=haversine(lat,lng,p["latitude"],p["longitude"]) if lat is not None and lng is not None else None
        result.append({"id":p["id"],"name":p["name"],"address":p["address"],"lat":p["latitude"],"lng":p["longitude"],"distance_km":round(d,2) if d is not None else None})
    if lat is not None and lng is not None: result.sort(key=lambda x:x["distance_km"])
    return jsonify(result)

@app.get("/api/search")
@login_required
def api_search():
    term=(request.args.get("q") or "").strip()
    lat=request.args.get("lat",type=float); lng=request.args.get("lng",type=float)
    if not term: return jsonify({"results":[],"message":"Enter a medicine name."})
    with get_db() as db:
        rows=db.execute("""SELECT m.id AS medicine_id,m.name AS medicine,m.strength,m.price,m.stock_quantity,
          p.id AS pharmacy_id,p.name AS pharmacy,p.address,p.latitude,p.longitude
          FROM medicines m JOIN pharmacies p ON p.id=m.pharmacy_id
          WHERE m.name LIKE ? ORDER BY m.name,p.name""",("%"+term+"%",)).fetchall()
    results=[]
    for r in rows:
        distance=haversine(lat,lng,r["latitude"],r["longitude"]) if lat is not None and lng is not None else None
        status=stock_status(r["stock_quantity"])
        results.append({"medicine_id":r["medicine_id"],"medicine":r["medicine"],"strength":r["strength"],"price":r["price"],"stock":r["stock_quantity"],"stock_label":status["label"],"stock_key":status["key"],"pharmacy_id":r["pharmacy_id"],"pharmacy":r["pharmacy"],"address":r["address"],"lat":r["latitude"],"lng":r["longitude"],"distance_km":round(distance,2) if distance is not None else None,"estimated_minutes":max(1,round(distance/20*60)) if distance is not None else None})
    if lat is not None and lng is not None: results.sort(key=lambda x:(x["distance_km"] if x["distance_km"] is not None else 999,x["price"]))
    return jsonify({"results":results,"message":"" if results else "No matching demo stock found. Try another medicine or ask a participating pharmacy to add it."})

@app.post("/api/inventory")
@login_required
def api_inventory():
    if session.get("role")!="owner": return jsonify({"error":"Only pharmacy owners can update inventory."}),403
    data=request.get_json(silent=True) or {}
    name=(data.get("name") or "").strip()
    strength=(data.get("strength") or "").strip()
    try: price=float(data.get("price")); stock=int(data.get("stock"))
    except (TypeError,ValueError): return jsonify({"error":"Enter a valid price and whole-number stock quantity."}),400
    if not name or price<0 or stock<0: return jsonify({"error":"Medicine name, non-negative price and stock are required."}),400
    pharmacy_id=session.get("pharmacy_id")
    if not pharmacy_id: return jsonify({"error":"No pharmacy is linked to this account."}),400
    with get_db() as db:
        existing=db.execute("SELECT id FROM medicines WHERE pharmacy_id=? AND lower(name)=lower(?) AND lower(strength)=lower(?)",(pharmacy_id,name,strength)).fetchone()
        if existing:
            db.execute("UPDATE medicines SET price=?,stock_quantity=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",(price,stock,existing["id"]))
        else:
            db.execute("INSERT INTO medicines(pharmacy_id,name,strength,price,stock_quantity) VALUES(?,?,?,?,?)",(pharmacy_id,name,strength,price,stock))
    return jsonify({"ok":True,"message":"Inventory saved to the database."})

@app.get("/api/owner/inventory")
@login_required
def api_owner_inventory():
    if session.get("role")!="owner": return jsonify({"error":"Only pharmacy owners can view this page."}),403
    with get_db() as db:
        rows=db.execute("SELECT id,name,strength,price,stock_quantity,updated_at FROM medicines WHERE pharmacy_id=? ORDER BY name",(session.get("pharmacy_id"),)).fetchall()
    return jsonify([dict(r) for r in rows])

@app.get("/health")
def health(): return jsonify({"ok":True,"service":"Medis-Inn"})

init_db()
if __name__ == "__main__":
    app.run(debug=True, port=5000)
