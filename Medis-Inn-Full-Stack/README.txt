MEDIS-INN FULL-STACK PROTOTYPE
==============================

WHAT IS INCLUDED
- Flask/Python backend and REST-style JSON endpoints
- SQLite database automatically created as medis_inn.db
- Password hashes (Werkzeug), session-based login, customer and pharmacy-owner roles
- Register/login/logout
- Medicine search against database records
- Owner inventory add/update persisted in SQL
- OpenStreetMap + Leaflet pharmacy map, browser location permission, coloured distance markers
- Google Maps directions link for selected pharmacy
- Seed/demo pharmacies and medicines

RUN ON WINDOWS
1. Install Python 3.10+.
2. Extract this ZIP into a folder.
3. Open Command Prompt/Terminal inside the extracted folder.
4. Run:  py -m venv .venv
5. Activate:
   Windows CMD: .venv\Scripts\activate
   PowerShell: .venv\Scripts\Activate.ps1
6. Run:  pip install -r requirements.txt
7. Run:  python app.py
8. Open http://127.0.0.1:5000

DEMO LOGIN
Customer:
  Email: customer@medisinn.demo
  Password: Customer123!
Owner:
  Email: owner@medisinn.demo
  Password: Owner123!

DATABASE
SQLite file medis_inn.db is created on first run. Tables: users, pharmacies, medicines.
To reset the demo database, stop the server and delete medis_inn.db; it will be recreated on next start.

IMPORTANT LIMITATIONS
- Pharmacy data, prices, stock and coordinates are seeded demo data, mainly around Chennai. They are NOT live verified pharmacy listings.
- Searching accepts any typed medicine name but only returns database matches. Unknown names will show no matching listing until an owner adds that medicine.
- Route distance in the result list is straight-line distance and travel minutes are rough estimates. Google Maps opens for actual road directions; traffic/ETA depends on Google Maps.
- Map requires internet for OpenStreetMap tiles. Browser location works on localhost/HTTPS after permission.
- This is a student prototype, not production-ready. Before deployment: change MEDIS_INN_SECRET to a strong random secret, turn off debug mode, use HTTPS, add rate limiting, CSRF protections, email verification, account recovery, audit logs, owner verification, database backups, input validation and privacy/security review.
- Live inventory requires real pharmacies to participate and update their stock, or a verified pharmacy/POS API integration. No real pharmacy API is configured in this ZIP.
- Medicine information here is only inventory data, not medical advice. Users should consult a pharmacist/doctor for medicine suitability.
