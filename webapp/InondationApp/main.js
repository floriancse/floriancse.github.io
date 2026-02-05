// main.js – Version finale intégrée

const API_URL = 'https://api-fonte-glace.duckdns.org';
let currentLevel = 0;
let selectedCountry = null;
const SLIDER_BOTTOM_OFFSET = 7;

const MIN_LEVEL = 1;
const MAX_LEVEL = 70;

// === Initialisation carte ===
const map = new maplibregl.Map({
    container: 'map',
    style: 'https://api.maptiler.com/maps/base-v4/style.json?key=MIeaKd18gACAhOFV3PZu',
    center: [0, 0],
    zoom: 1
});

// --- Fonctions utilitaires ---
function getFirstLabelLayer() {
    const layers = map.getStyle().layers;
    for (const layer of layers) {
        if (layer.id.includes('label') || layer.id.includes('text') || layer.id.includes('name')) {
            return layer.id;
        }
    }
    return null;
}

// --- Mise à jour de la couche d'inondation ---
function updateFloodLayer(level) {
    const sourceId = 'flood-source';
    const layerId = 'flood-layer';

    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    if (level > 0) {
        map.addSource(sourceId, {
            type: 'raster',
            tiles: [`${API_URL}/api/app_montee_eaux/tiles/${level}/{z}/{x}/{y}.png`],
            tileSize: 256
        });

        const firstLabel = getFirstLabelLayer();
        map.addLayer({
            id: layerId,
            type: 'raster',
            source: sourceId,
            paint: { 'raster-opacity': 1 }
        }, firstLabel);

        if (map.getLayer('countries-layer')) map.moveLayer('countries-layer', firstLabel);
        if (map.getLayer('countries-borders')) map.moveLayer('countries-borders', firstLabel);
    }
}

// --- Fonction principale pour mettre à jour le niveau ---
function updateLevel(level) {
    document.getElementById("levelDisplay").textContent = level + " m";
    currentLevel = level;

    updateFloodLayer(level);

    if (selectedCountry) {
        updateCitiesTableAndMap(selectedCountry, level);
    }

    fetch(`${API_URL}/info?level=${level}`)
        .then(r => r.json())
        .then(data => console.log(data))
        .catch(err => console.error("Erreur fetch info:", err));
}

// --- Poignée draggable ---
const container = document.getElementById("slider-image-container");
const handle = document.getElementById("slider-handle");
const line = document.getElementById("slider-line");
const iceOverlay = document.getElementById("ice-overlay");

let dragging = false;

handle.addEventListener("mousedown", () => dragging = true);
window.addEventListener("mouseup", () => dragging = false);

window.addEventListener("mousemove", (e) => {
    if (!dragging) return;

    const rect = container.getBoundingClientRect();
    let y = e.clientY - rect.top;

    y = Math.max(0, Math.min(y, rect.height));

    line.style.top = y + "px";
    handle.style.top = y + "px";
    handle.style.left = rect.width / 2 + "px";
    iceOverlay.style.height = y + "px";

    // --- Niveau inversé : 0 en haut, MAX_LEVEL en bas ---
    const yNormalized = rect.height - y;
    let level = MAX_LEVEL - (yNormalized / rect.height) * (MAX_LEVEL - MIN_LEVEL);
    level = Math.round(level);
    level = Math.max(MIN_LEVEL, Math.min(level, MAX_LEVEL));

    updateLevelVisual(level);
    updateLevelDebounced(level);
});

// Position initiale
window.addEventListener("load", () => {
    const rect = container.getBoundingClientRect();

    const startY = 0; // niveau minimum en haut
    line.style.top = startY + "px";
    handle.style.top = startY + "px";
    handle.style.left = rect.width / 2 + "px"; // CENTRER la poignée horizontalement

    iceOverlay.style.height = startY + "px";

    updateLevel(MIN_LEVEL);
});

function showPanelLoading() {
    const loader = document.getElementById('panel-loading');
    if (loader) loader.style.display = 'flex';
}

function hidePanelLoading() {
    const loader = document.getElementById('panel-loading');
    if (loader) loader.style.display = 'none';
}

// --- Gestion des villes et tableau ---
async function updateCitiesTableAndMap(countryName, level) {
    if (!countryName) return;
    showPanelLoading();
    try {
        const response = await fetch(`${API_URL}/api/app_montee_eaux/get_info/InondationApp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: countryName, level: level })
        });
        const data = await response.json();

        const popImpactee = data.impacted_population || 0;
        const pctPop = data.pct_population_affectee || 0;
        const surfaceInondee = data.surface_inondee_km2 || 0;
        const personnesParFoyer = 2.2;
        const foyersTouches = Math.round(popImpactee / personnesParFoyer);
        const terrainsDeFoot = Math.round(surfaceInondee / 0.00714);

        document.getElementById('stats-pop-impacted').textContent = Number(popImpactee).toLocaleString('fr-FR') + " personnes";
        document.getElementById('stats-pop-text').textContent = " seraient touchées par les inondations.";
        document.getElementById('stats-pop-pct').textContent = ` ${pctPop}%`;
        document.getElementById('stats-foyers-value').textContent = foyersTouches.toLocaleString('fr-FR');
        document.getElementById('stats-surface-km2').textContent = Number(surfaceInondee).toLocaleString('fr-FR') + " km²";
        document.getElementById('stats-football-fields').textContent = terrainsDeFoot.toLocaleString('fr-FR');

        const cities = data.cities || [];
        const tableBody = document.getElementById('cities-table');
        if (cities.length > 0) {
            let rows = '';
            cities.forEach(city => {
                const pop = city.population ? Number(city.population).toLocaleString('fr-FR') : 'Inconnue';
                const rank = city.rank ? `#${city.rank}` : '-';
                rows += `<tr><td>${rank}</td><td>${city.name}</td><td>${pop}</td></tr>`;
            });
            tableBody.innerHTML = `
                <table>
                    <thead><tr><th>Rang national</th><th>Ville</th><th>Population</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>`;
        } else {
            tableBody.innerHTML = `<p style="color: #888; font-style: italic;">Aucune ville majeure touchée à ${level} m.</p>`;
        }

        const features = cities
            .filter(city => city.lat && city.lng)
            .map(city => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [city.lng, city.lat] },
                properties: { name: city.name, population: city.population || 0 }
            }));

        map.getSource('city-pulses').setData({ type: 'FeatureCollection', features });

        document.getElementById('cities-table-container').style.display = 'block';
        hidePanelLoading();
    } catch (err) {
        console.error("Erreur API:", err);
        document.getElementById('cities-table').innerHTML = '<p style="color:red;">Erreur de connexion au serveur</p>';
    }
}

function hideLoadingScreen() {
    const loadingScreen = document.getElementById('map-loading');
    if (loadingScreen) {
        loadingScreen.classList.add('hidden');
        setTimeout(() => loadingScreen.remove(), 400); // Retire l'élément après la transition
    }
}

// --- Initialisation carte, pays et popups ---
map.on('load', () => {
    fetch(`${API_URL}/api/app_montee_eaux/get_countries`)
        .then(res => res.json())
        .then(data => {
            map.addSource('countries', { type: 'geojson', data: data });
            const firstLabel = getFirstLabelLayer();

            map.addLayer({
                id: 'countries-layer',
                type: 'fill',
                source: 'countries',
                paint: { 'fill-color': '#ffffffff', 'fill-opacity': 0 }
            }, firstLabel);

            map.addLayer({
                id: 'countries-borders',
                type: 'line',
                source: 'countries',
                paint: { 'line-color': '#ffffff', 'line-width': 1 }
            }, firstLabel);

            map.on('mouseenter', 'countries-layer', () => map.getCanvas().style.cursor = 'pointer');
            map.on('mouseleave', 'countries-layer', () => map.getCanvas().style.cursor = '');
            map.on('mousemove', 'countries-layer', e => {
                if (e.features.length > 0) {
                    const name = e.features[0].properties.name;
                    map.setPaintProperty('countries-layer', 'fill-opacity', [
                        'case',
                        ['==', ['get', 'name'], name], 0.25,
                        0
                    ]);
                }
            });
            map.on('mouseleave', 'countries-layer', () => map.setPaintProperty('countries-layer', 'fill-opacity', 0));

            // GESTIONNAIRE UNIQUE pour le click - avec zoom intégré
            map.on('click', 'countries-layer', async e => {
                if (e.features.length > 0) {
                    const country = e.features[0];
                    selectedCountry = country.properties.name;
                    document.querySelector('h2').textContent = `FONTE DES GLACES ${selectedCountry}`;

                    // Calculer la bounding box
                    const coordinates = country.geometry.coordinates;
                    const bounds = new maplibregl.LngLatBounds();

                    const addCoordinates = (coords) => {
                        if (Array.isArray(coords) && coords.length > 0) {
                            if (typeof coords[0] === 'number') {
                                // C'est une paire [lng, lat]
                                bounds.extend(coords);
                            } else {
                                // C'est un tableau de coordonnées
                                coords.forEach(addCoordinates);
                            }
                        }
                    };

                    addCoordinates(coordinates);

                    // Zoomer sur le pays
                    map.fitBounds(bounds, {
                        padding: { top: 100, bottom: 100, left: 100, right: 100 },
                        maxZoom: 6,
                        duration: 1000
                    });

                    await updateCitiesTableAndMap(selectedCountry, currentLevel);
                    document.getElementById('cities-table-container').style.display = 'block';
                }
            });

            hideLoadingScreen();
        });

    // Créer la source vide
    map.addSource('city-pulses', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

    // Créer le layer avec une config par défaut
    map.addLayer({
        id: 'city-pulses-dot',
        type: 'circle',
        source: 'city-pulses',
        paint: {
            'circle-radius': 5, // Valeur par défaut temporaire
            'circle-color': '#272727ff',
            'circle-opacity': 1,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
        }
    });

    // Écouter les mises à jour de la source pour recalculer l'échelle
    map.on('sourcedata', e => {
        if (e.sourceId === 'city-pulses' && e.isSourceLoaded) {
            const features = map.querySourceFeatures('city-pulses');

            if (features.length > 0) {
                const populations = features
                    .map(f => f.properties.population)
                    .filter(p => p != null && !isNaN(p) && p > 0);

                if (populations.length > 0) {
                    const minPop = Math.min(...populations);
                    const maxPop = Math.max(...populations);

                    // Calcul des rayons : on fixe minRadius et maxRadius
                    const minRadius = 2;   // rayon minimum (pour la plus petite ville)
                    const maxRadius = 20;  // rayon maximum (pour la plus grande ville)

                    // Interpolation linéaire proportionnelle
                    map.setPaintProperty('city-pulses-dot', 'circle-radius', [
                        'interpolate',
                        ['linear'],
                        ['get', 'population'],
                        minPop, minRadius,   // plus petite ville → rayon min
                        maxPop, maxRadius    // plus grande ville → rayon max
                    ]);
                }
            }
        }
    });

    let hoveredPopup = null;
    map.on('mouseenter', 'city-pulses-dot', e => {
        map.getCanvas().style.cursor = 'pointer';
        const props = e.features[0].properties;
        const coordinates = e.features[0].geometry.coordinates.slice();
        hoveredPopup = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 15,
            className: 'city-popup'
        }).setLngLat(coordinates).setHTML(`${props.name}<br><span>${Number(props.population).toLocaleString('fr-FR')} hab.</span>`).addTo(map);
    });
    map.on('mousemove', 'city-pulses-dot', e => {
        if (hoveredPopup) hoveredPopup.setLngLat(e.features[0].geometry.coordinates.slice());
    });
    map.on('mouseleave', 'city-pulses-dot', () => {
        map.getCanvas().style.cursor = '';
        if (hoveredPopup) { hoveredPopup.remove(); hoveredPopup = null; }
    });
});

// --- Clic hors pays désélectionne ---
map.on('click', () => {
    if (map.getCanvas().style.cursor === '') {
        selectedCountry = null;
        document.querySelector('h2').textContent = 'Fonte des glaces';
        document.getElementById('cities-table-container').style.display = 'none';
        if (map.getSource('city-pulses')) map.getSource('city-pulses').setData({ type: 'FeatureCollection', features: [] });
    }
});

// Debounce
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function updateLevelVisual(level) {
    document.getElementById("levelDisplay").textContent = level + " m";
    currentLevel = level;
}

const updateLevelDebounced = debounce(level => {
    updateFloodLayer(level);

    if (selectedCountry) {
        showPanelLoading();
        updateCitiesTableAndMap(selectedCountry, level);
    }
}, 300);

function getY(e) {
    if (e.touches && e.touches.length > 0) {
        return e.touches[0].clientY;   // Touch
    }
    return e.clientY;                  // Souris
}

// Démarrer le drag
function startDrag(e) {
    e.preventDefault();                // Très important sur mobile
    dragging = true;
}

// Fin du drag
function stopDrag() {
    dragging = false;
}

// Déplacement
function moveDrag(e) {
    if (!dragging) return;
    e.preventDefault();                // Empêche le scroll/page move

    const rect = container.getBoundingClientRect();
    let y = getY(e) - rect.top;

    y = Math.max(0, Math.min(y, rect.height));

    line.style.top    = y + "px";
    handle.style.top  = y + "px";
    handle.style.left = (rect.width / 2) + "px";
    iceOverlay.style.height = y + "px";

    const yNormalized = rect.height - y;
    let level = MAX_LEVEL - (yNormalized / rect.height) * (MAX_LEVEL - MIN_LEVEL);
    level = Math.round(level);
    level = Math.max(MIN_LEVEL, Math.min(level, MAX_LEVEL));

    updateLevelVisual(level);
    updateLevelDebounced(level);
}

// Ajout des listeners (souris + touch)
handle.addEventListener("mousedown", startDrag);
handle.addEventListener("touchstart", startDrag, { passive: false });  // passive:false → on peut preventDefault

window.addEventListener("mouseup",   stopDrag);
window.addEventListener("touchend",  stopDrag);
window.addEventListener("touchcancel", stopDrag);   // au cas où

window.addEventListener("mousemove", moveDrag);
window.addEventListener("touchmove", moveDrag, { passive: false });