
let selectedRole = "customer";
let currentPosition = null;
let map = null;
let markers = [];
let selected = null;
let currentResults = [];
let sortNear = true;
let routeLine = null;

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function toast(msg) {
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 3200);
}

async function api(url, opts = {}) {
    const res = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        ...opts
    });

    let data = {};
    try { data = await res.json(); } catch {}

    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
}

function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;",
        '"': "&quot;", "'": "&#39;"
    }[c]));
}

/* STOCK COLOURS */
function stockClass(k) {
    return k === "high" ? "high"
        : k === "medium" ? "medium"
        : "low";
}

/* DISTANCE COLOURS */
function distanceColor(km) {
    if (km == null || !Number.isFinite(Number(km))) return "#64748b";
    if (Number(km) <= 2) return "#22a879";
    if (Number(km) <= 5) return "#edb73e";
    return "#e35d5b";
}

function getDistanceClass(distance) {
    if (distance == null || distance === "" ||
        !Number.isFinite(Number(distance))) {
        return "distance-unavailable";
    }

    const km = Number(distance);
    if (km <= 2) return "distance-near";
    if (km <= 5) return "distance-medium";
    return "distance-far";
}

function getDistanceLabel(distance) {
    if (distance == null || distance === "" ||
        !Number.isFinite(Number(distance))) {
        return "Distance unavailable";
    }

    const km = Number(distance);
    if (km <= 2) return "Near";
    if (km <= 5) return "Little far";
    return "Too far";
}

/* PAGE NAVIGATION */
function setPage(page) {
    $$(".page").forEach(p =>
        p.classList.toggle("active", p.id === "page-" + page)
    );

    $$(".nav").forEach(b =>
        b.classList.toggle("active", b.dataset.page === page)
    );

    const titles = {
        home: "Good day 👋",
        search: "Find a medicine",
        map: "Pharmacy map",
        inventory: "Manage inventory"
    };

    if ($("#pageTitle")) $("#pageTitle").textContent = titles[page] || page;
    if ($("#crumb")) $("#crumb").textContent = "MEDIS-INN / " + page.toUpperCase();

    if (page === "map") {
        setTimeout(() => {
            initMap();
            if (map) {
                map.invalidateSize();
                drawMap();
            }
        }, 100);
    }

    if (page === "inventory") loadInventory();

    window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ROLE SELECTION */
$$(".role").forEach(b => {
    b.addEventListener("click", () => {
        selectedRole = b.dataset.role;
        $$(".role").forEach(x => x.classList.toggle("active", x === b));
    });
});

/* ENTER APPLICATION */
function enterApp(data) {
    $("#authScreen").classList.add("hidden");
    $("#app").classList.remove("hidden");

    $("#userName").textContent = data.name;
    $("#userRole").textContent =
        data.role === "owner" ? "Pharmacy owner" : "Customer";

    $("#avatar").textContent = data.name
        .split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase();

    $$(".owner-only").forEach(x =>
        x.classList.toggle("hidden", data.role !== "owner")
    );

    setPage(data.role === "owner" ? "inventory" : "home");
}

/* LOGIN */
$("#loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    $("#authMessage").textContent = "";

    try {
        const d = await api("/api/login", {
            method: "POST",
            body: JSON.stringify({
                email: $("#email").value,
                password: $("#password").value,
                role: selectedRole
            })
        });
        enterApp(d);
    } catch (err) {
        $("#authMessage").textContent = err.message;
    }
});

/* REGISTER */
$("#registerForm").addEventListener("submit", async e => {
    e.preventDefault();
    $("#authMessage").textContent = "";

    try {
        const d = await api("/api/register", {
            method: "POST",
            body: JSON.stringify({
                name: $("#regName").value,
                email: $("#regEmail").value,
                password: $("#regPassword").value,
                role: selectedRole
            })
        });

        $("#authMessage").style.color = "#17866b";
        $("#authMessage").textContent = d.message + " You can now sign in.";
    } catch (err) {
        $("#authMessage").style.color = "#b74444";
        $("#authMessage").textContent = err.message;
    }
});

/* LOGOUT */
async function logout() {
    await api("/api/logout", { method: "POST" }).catch(() => {});
    location.reload();
}
$("#logout").addEventListener("click", logout);

/* NAVIGATION */
$$("[data-page]").forEach(b =>
    b.addEventListener("click", () => setPage(b.dataset.page))
);
$$("[data-goto]").forEach(b =>
    b.addEventListener("click", () => setPage(b.dataset.goto))
);

/* MEDICINE SEARCH */
async function searchMedicine() {
    const q = $("#medicine").value.trim();
    if (!q) {
        toast("Please enter a medicine name.");
        return;
    }

    $("#results").innerHTML = '<div class="empty">Searching database…</div>';

    try {
        const params = new URLSearchParams({ q });

        if (currentPosition) {
            params.set("lat", currentPosition.lat);
            params.set("lng", currentPosition.lng);
        }

        const data = await api("/api/search?" + params.toString());
        currentResults = data.results || [];

        $("#resultTitle").textContent = `Results for “${q}”`;
        $("#resultSub").textContent = currentResults.length
            ? "Database matches · stock information depends on pharmacy updates."
            : (data.message || "No matching results found.");

        renderResults();
    } catch (err) {
        $("#results").innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    }
}

$("#searchForm").addEventListener("submit", e => {
    e.preventDefault();
    searchMedicine();
});

/* RENDER SEARCH RESULTS */
function renderResults() {
    let list = [...currentResults];

    if (sortNear && currentPosition) {
        list.sort((a, b) =>
            (a.distance_km ?? 999) - (b.distance_km ?? 999)
        );
    } else if (!sortNear) {
        list.sort((a, b) => Number(a.price) - Number(b.price));
    }

    $("#results").innerHTML = list.length
        ? list.map(p => `
            <article class="pharmacy">
                <div>
                    <h3>${esc(p.pharmacy)}</h3>
                    <p class="address">⌖ ${esc(p.address)}</p>

                    <div class="price-line">
                        <span class="price">₹${Number(p.price).toFixed(2)}</span>
                        <span class="stock ${stockClass(p.stock_key)}">
                            ● ${esc(p.stock_label)} · ${p.stock} units
                        </span>
                    </div>

                    <div class="meta">
                        <span class="distance-badge ${getDistanceClass(p.distance_km)}">
                            📍 ${getDistanceLabel(p.distance_km)}${
                                p.distance_km == null ? "" :
                                " · " + Number(p.distance_km).toFixed(1) + " km"
                            }
                        </span>

                        <span>
                            ◷ ${p.estimated_minutes == null
                                ? "Time estimate unavailable"
                                : "~" + p.estimated_minutes + " min estimate"}
                        </span>

                        <span>${esc(p.medicine)} ${esc(p.strength)}</span>
                    </div>
                </div>

                <div class="card-buttons">
                    <button data-map="${p.medicine_id}">View on map</button>
                    <button class="filled" data-dir="${p.medicine_id}">
                        Get directions ↗
                    </button>
                </div>
            </article>
        `).join("")
        : `<div class="empty">
            <h3>No matching medicine listing found</h3>
            <p>Try a different spelling or ask a pharmacy to add the medicine.</p>
        </div>`;

    $("#results").querySelectorAll("[data-map]").forEach(b => {
        b.addEventListener("click", () => {
            choosePharmacy(
                list.find(p => p.medicine_id === +b.dataset.map),
                false
            );
        });
    });

    $("#results").querySelectorAll("[data-dir]").forEach(b => {
        b.addEventListener("click", () => {
            choosePharmacy(
                list.find(p => p.medicine_id === +b.dataset.dir),
                true
            );
        });
    });
}

/* SORT */
$("#sortBtn").addEventListener("click", () => {
    sortNear = !sortNear;
    $("#sortBtn").textContent = sortNear ? "↕ Sort: nearest" : "↕ Sort: price";
    renderResults();
});

/* MAP INITIALIZATION */
function initMap() {
    if (map || !window.L) return;

    const center = currentPosition || { lat: 13.0622, lng: 80.2508 };

    map = L.map("map").setView([center.lat, center.lng], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap"
    }).addTo(map);
}

/* REMOVE OLD ROUTE */
function clearRoute() {
    if (routeLine && map) {
        map.removeLayer(routeLine);
    }
    routeLine = null;
}

/* DRAW COLOUR-CODED ROAD ROUTE AND SHOW DISTANCE */
async function drawRouteToPharmacy(p) {
    if (!map || !currentPosition || !p) {
        toast("Enable your location to calculate a route.");
        return;
    }

    clearRoute();

    const start = currentPosition;
    const end = { lat: Number(p.lat), lng: Number(p.lng) };

    const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${start.lng},${start.lat};${end.lng},${end.lat}` +
        `?overview=full&geometries=geojson`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok || data.code !== "Ok" || !data.routes?.length) {
            toast("Road route is unavailable.");
            return;
        }

        const route = data.routes[0];
        const km = route.distance / 1000;
        const minutes = Math.round(route.duration / 60);
        const color = distanceColor(km);

        routeLine = L.geoJSON(route.geometry, {
            style: {
                color: color,
                weight: 6,
                opacity: 0.9
            }
        }).addTo(map);

        routeLine.bindPopup(
            `<b>${km.toFixed(1)} km · ${getDistanceLabel(km)}</b><br>` +
            `Estimated driving time: ${minutes} min`
        );

        map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
        routeLine.openPopup();

        $("#mapName").textContent = p.pharmacy || p.name;
        $("#mapDesc").textContent =
            `${km.toFixed(1)} km by road · ${getDistanceLabel(km)} · ` +
            `About ${minutes} min driving (estimate).`;

        $("#directions").disabled = false;
    } catch (err) {
        toast("Route failed. Check your internet connection.");
    }
}

/* DRAW PHARMACY MARKERS */
async function drawMap() {
    if (!map) return;

    markers.forEach(m => map.removeLayer(m));
    markers = [];

    let pharmacies = [];

    try {
        pharmacies = await api(
            "/api/pharmacies" +
            (currentPosition
                ? `?lat=${currentPosition.lat}&lng=${currentPosition.lng}`
                : "")
        );
    } catch {
        return;
    }

    if (currentPosition) {
        markers.push(
            L.marker([currentPosition.lat, currentPosition.lng])
                .addTo(map)
                .bindPopup("Your location")
        );
    }

    pharmacies.forEach(p => {
        const km = p.distance_km;
        const color = distanceColor(km);

        const marker = L.circleMarker([p.lat, p.lng], {
            radius: 8,
            color,
            fillColor: color,
            fillOpacity: 0.9,
            weight: 2
        }).addTo(map);

        marker.bindPopup(
            `<b>${esc(p.name)}</b><br>` +
            `${km == null ? "Distance unavailable" : Number(km).toFixed(1) + " km away"}`
        );

        marker.on("click", () => {
            selected = p;
            updateMapPanel(p);

            if (currentPosition) {
                drawRouteToPharmacy(p);
            }
        });

        markers.push(marker);
    });
}

/* SELECT PHARMACY AND DISPLAY ROUTE */
function choosePharmacy(p, open) {
    if (!p) return;

    selected = p;
    setPage("map");

    setTimeout(async () => {
        initMap();
        if (!map) return;

        map.invalidateSize();
        clearRoute();
        updateMapPanel(p);

        if (currentPosition) {
            await drawRouteToPharmacy(p);
        } else {
            map.setView([Number(p.lat), Number(p.lng)], 15);
            toast("Click Use my location to display the road route.");
        }

        if (open) openDirections();
    }, 250);
}

/* MAP DETAILS */
function updateMapPanel(p) {
    $("#mapName").textContent = p.pharmacy || p.name;

    $("#mapDesc").textContent =
        `${p.distance_km == null
            ? "Enable location for distance"
            : Number(p.distance_km).toFixed(1) + " km straight-line distance"} · ` +
        `${p.estimated_minutes == null
            ? "Road travel time unavailable"
            : "~" + p.estimated_minutes + " min estimate"}.`;

    $("#directions").disabled = false;
}

/* OPEN GOOGLE MAPS DIRECTIONS */
function openDirections() {
    if (!selected) return;

    const dest = `${selected.lat},${selected.lng}`;

    let url =
        "https://www.google.com/maps/dir/?api=1&destination=" +
        encodeURIComponent(dest) +
        "&travelmode=driving";

    if (currentPosition) {
        url += "&origin=" +
            encodeURIComponent(`${currentPosition.lat},${currentPosition.lng}`);
    }

    window.open(url, "_blank", "noopener");
}

$("#directions").addEventListener("click", openDirections);

/* USE MY LOCATION */
$("#locate").addEventListener("click", () => {
    if (!navigator.geolocation) {
        toast("This browser does not support location.");
        return;
    }

    $("#locate").textContent = "Finding location…";

    navigator.geolocation.getCurrentPosition(
        pos => {
            currentPosition = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude
            };

            $("#locationLabel").textContent =
                `${currentPosition.lat.toFixed(3)}, ${currentPosition.lng.toFixed(3)}`;

            $("#locate").textContent = "Location updated ✓";

            if (map) {
                map.setView([currentPosition.lat, currentPosition.lng], 13);
                clearRoute();
                drawMap();
            }

            if ($("#medicine").value.trim()) searchMedicine();
        },
        () => {
            $("#locate").textContent = "◎ Use my location";
            toast("Location permission was not granted.");
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
});

/* ADD INVENTORY */
$("#inventoryForm").addEventListener("submit", async e => {
    e.preventDefault();
    $("#invMessage").textContent = "";

    try {
        const d = await api("/api/inventory", {
            method: "POST",
            body: JSON.stringify({
                name: $("#invName").value,
                strength: $("#invStrength").value,
                price: $("#invPrice").value,
                stock: $("#invStock").value
            })
        });

        $("#invMessage").style.color = "#17866b";
        $("#invMessage").textContent = d.message;
        e.target.reset();
        loadInventory();
    } catch (err) {
        $("#invMessage").style.color = "#b74444";
        $("#invMessage").textContent = err.message;
    }
});

/* LOAD INVENTORY */
async function loadInventory() {
    if (!$("#page-inventory").classList.contains("active")) return;

    try {
        const rows = await api("/api/owner/inventory");

        $("#ownerListings").innerHTML = rows.length
            ? rows.map(p => `
                <article class="pharmacy">
                    <div>
                        <h3>${esc(p.name)} ${esc(p.strength)}</h3>

                        <div class="price-line">
                            <span class="price">₹${Number(p.price).toFixed(2)}</span>

                            <span class="stock ${
                                p.stock_quantity <= 5 ? "low" :
                                p.stock_quantity <= 19 ? "medium" : "high"
                            }">
                                ${
                                    p.stock_quantity <= 5 ? "Low stock" :
                                    p.stock_quantity <= 19 ? "Medium stock" : "High stock"
                                } · ${p.stock_quantity} units
                            </span>
                        </div>

                        <div class="meta">Updated: ${esc(p.updated_at)}</div>
                    </div>
                </article>
            `).join("")
            : '<div class="empty">No inventory records yet.</div>';
    } catch (err) {
        $("#ownerListings").innerHTML =
            `<div class="empty">${esc(err.message)}</div>`;
    }
}

$("#refreshInventory").addEventListener("click", loadInventory);

/* RESTORE SESSION */
(async () => {
    try {
        const d = await api("/api/me");
        if (d.logged_in) enterApp(d);
    } catch {}
})();
