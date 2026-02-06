let currentDays = 1;
let currentSearch = "";
let selectedAuthors = new Set();
let allAuthors = [];
let rotationInterval = null;
let isRotationEnabled = true;
let popupPinned = false;
let currentFeatures = [];
let currentFeatureIndex = 0;

// Cache pour les données par période
let cachedData = {
    1: null,
    7: null,
    30: null
};

// Cache pour les auteurs par période
let cachedAuthors = {
    1: null,
    7: null,
    30: null
};

let isInitialLoadComplete = false;

// Variables pour le carrousel de tweets importants
let importantTweets = [];
let currentImportantIndex = 0;

function updateRotationButton() {
    const btn = document.getElementById("rotationToggleBtn");
    if (!btn) return;
    if (isRotationEnabled) {
        btn.textContent = "⏸";
        btn.classList.add("active");
    } else {
        btn.textContent = "▶";
        btn.classList.remove("active");
    }
}

function startRotation() {
    if (rotationInterval) return;
    rotationInterval = setInterval(() => {
        const center = map.getCenter();
        center.lng += .5;
        map.easeTo({
            center,
            duration: 100,
            easing: t => t
        });
    }, 100);
    isRotationEnabled = true;
    updateRotationButton();
}

function stopRotation() {
    if (rotationInterval) {
        clearInterval(rotationInterval);
        rotationInterval = null;
    }
    isRotationEnabled = false;
    updateRotationButton();
}

function toggleRotation() {
    if (isRotationEnabled) {
        stopRotation();
    } else {
        startRotation();
    }
}

document.getElementById("rotationToggleBtn").addEventListener("click", toggleRotation);

document.addEventListener("DOMContentLoaded", async () => {
    const response = await fetch("https://api-conflit-twitter.duckdns.org/api/twitter_conflicts/last_tweet_date");
    const data = await response.json();
    document.getElementById("last-update").textContent =
        `Dernière mise à jour : ${data.last_date} à ${data.last_hour}`;
});

// Précharge toutes les données au démarrage
async function preloadAllData() {
    const periods = [1, 7, 30];

    try {
        // Charger les auteurs pour chaque période (maintenant en heures)
        const authorPromises = periods.map(async (days) => {
            const hours = days * 24; // Convertir en heures
            const response = await fetch(`https://api-conflit-twitter.duckdns.org/api/twitter_conflicts/authors?hours=${hours}`);
            const data = await response.json();
            cachedAuthors[days] = data.authors || [];
        });

        // Charger les tweets pour chaque période (maintenant en heures)
        const tweetPromises = periods.map(async (days) => {
            const hours = days * 24; // Convertir en heures
            const response = await fetch(`https://api-conflit-twitter.duckdns.org/api/twitter_conflicts/tweets.geojson?hours=${hours}`);
            const data = await response.json();
            cachedData[days] = data;
        });

        // Attendre que tout soit chargé
        await Promise.all([...authorPromises, ...tweetPromises]);

        isInitialLoadComplete = true;
    } catch (error) {
        console.error("Erreur lors du préchargement des données:", error);
    }
}

async function loadAuthors() {
    try {
        const hours = currentDays * 24; // Convertir en heures

        // Utiliser les données en cache si disponibles
        if (cachedAuthors[currentDays]) {
            allAuthors = cachedAuthors[currentDays];
        } else {
            // Fallback si pas en cache
            const response = await fetch(`https://api-conflit-twitter.duckdns.org/api/twitter_conflicts/authors?hours=${hours}`);
            const data = await response.json();
            allAuthors = data.authors || [];
            cachedAuthors[currentDays] = allAuthors;
        }

        selectedAuthors = new Set(
            [...selectedAuthors].filter(author => allAuthors.includes(author))
        );
        renderAuthorList();
    } catch (error) {
        console.error("Erreur lors du chargement des auteurs:", error);
    }
}

function renderAuthorList() {
    const authorList = document.getElementById("authorList");
    authorList.innerHTML = "";
    allAuthors.forEach(author => {
        const item = document.createElement("div");
        item.className = "author-item";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = `author_${author}`;
        checkbox.checked = !selectedAuthors.has(author);
        checkbox.addEventListener("change", () => toggleAuthor(author));
        const label = document.createElement("label");
        label.htmlFor = `author_${author}`;
        const img = document.createElement("img");
        img.src = `img/${author}.jpg`;
        img.onerror = () => img.style.display = 'none';
        const span = document.createElement("span");
        span.textContent = author;
        label.appendChild(img);
        label.appendChild(span);
        item.appendChild(checkbox);
        item.appendChild(label);
        item.addEventListener("click", (e) => {
            if (e.target === checkbox || e.target === label || e.target === img || e.target === span) {
                return;
            }
            checkbox.click();
        });
        authorList.appendChild(item);
    });
    updateAuthorFilterButton();
}

function toggleAuthor(author) {
    if (selectedAuthors.has(author)) {
        selectedAuthors.delete(author);
    } else {
        selectedAuthors.add(author);
    }
    loadTweets(currentDays);
    updateAuthorFilterButton();
}

function updateAuthorFilterButton() {
    const btn = document.getElementById("authorFilterBtn");
    const label = document.getElementById("authorFilterLabel");
    const nbSelected = allAuthors.length - selectedAuthors.size;
    if (selectedAuthors.size === 0) {
        label.textContent = `Sources (${nbSelected})`;
        btn.classList.remove("has-selection");
    } else if (selectedAuthors.size === allAuthors.length) {
        label.textContent = "Source (0)";
        btn.classList.add("has-selection");
    } else {
        label.textContent = `Sources (${nbSelected})`;
        btn.classList.add("has-selection");
    }
}

async function loadTweets(days) {
    let data;
    const hours = days * 24; // Convertir en heures

    // Utiliser les données en cache si disponibles
    if (cachedData[days]) {
        data = cachedData[days];
    } else {
        // Fallback si pas en cache
        const params = new URLSearchParams({ hours: hours });
        const response = await fetch(
            `https://api-conflit-twitter.duckdns.org/api/twitter_conflicts/tweets.geojson?${params.toString()}`
        );
        data = await response.json();
        cachedData[days] = data;
    }

    // Appliquer les filtres de recherche et d'auteurs
    let filteredData = { ...data };

    const authorsToShow = allAuthors.filter(a => !selectedAuthors.has(a));

    if (selectedAuthors.size === allAuthors.length) {
        filteredData.features = [];
    } else {
        filteredData.features = data.features.filter(feature => {
            // Filtre par auteur
            const authorMatch = authorsToShow.length === 0 ||
                authorsToShow.length === allAuthors.length ||
                authorsToShow.includes(feature.properties.author);

            // Filtre par recherche
            const searchMatch = currentSearch.trim() === "" ||
                feature.properties.body.toLowerCase().includes(currentSearch.toLowerCase());

            return authorMatch && searchMatch;
        });
    }

    if (map.getSource('tweets')) {
        map.getSource('tweets').setData(filteredData);
    }

    const tweetCount = filteredData.features ? filteredData.features.length : 0;
    document.getElementById("tweet-count").textContent =
        `${tweetCount} événement${tweetCount > 1 ? 's' : ''}`;
    currentDays = days;
}

const authorFilterBtn = document.getElementById("authorFilterBtn");
const authorDropdown = document.getElementById("authorDropdown");
authorFilterBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    authorDropdown.classList.toggle("open");
    authorFilterBtn.classList.toggle("open");
});

document.addEventListener("click", (e) => {
    if (!authorDropdown.contains(e.target) && e.target !== authorFilterBtn) {
        authorDropdown.classList.remove("open");
        authorFilterBtn.classList.remove("open");
    }
});

const map = new maplibregl.Map({
    container: 'map',
    style: 'https://api.maptiler.com/maps/dataviz-dark/style.json?key=MIeaKd18gACAhOFV3PZu',
    zoom: 2.2,
    center: [2, 40],
    attributionControl: false
});

const popup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 15,
    className: 'custom-popup'
});

function truncateText(text, maxLength = 500) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + ' [...]';
}

function createPopupContent(props, showNavigation = false, currentIndex = 0, totalCount = 1) {
    const tweetDate = new Date(props.date_published);
    const formattedDate = tweetDate.toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
    const formattedTime = tweetDate.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
    });

    return `
    <div class="tweet-card">
        <button onclick="window.closePopup()" class="tweet-card-close" style="display: ${popupPinned ? 'flex' : 'none'}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
        <div class="tweet-card-header">
            <div class="tweet-card-avatar">
                <img src="img/${props.author}.jpg" alt="${props.author}" 
                     onerror="this.style.display='none'; this.parentElement.textContent='${getAuthorInitials(props.author)}';">
            </div>
            <div class="tweet-card-author">${props.author}</div>
            <div class="tweet-card-time">${formattedTime} · ${formattedDate}</div>
        </div>
        <div class="tweet-card-body">${props.body}</div>
        <div class="tweet-card-actions">
            <a href="${props.url}" class="tweet-card-link" target="_blank">Voir le tweet ↗</a>
            ${showNavigation && totalCount > 1 ? `
                <div class="tweet-card-nav">
                    <span class="tweet-card-nav-count">${currentIndex + 1}/${totalCount}</span>
                    <button onclick="window.previousTweet()" class="tweet-card-nav-btn">←</button>
                    <button onclick="window.nextTweet()" class="tweet-card-nav-btn">→</button>
                </div>
            ` : ''}
        </div>
    </div>
`;
}

function showPopupAtIndex(index) {
    if (currentFeatures.length === 0) return;
    currentFeatureIndex = index;
    const feature = currentFeatures[currentFeatureIndex];
    const coordinates = feature.geometry.coordinates.slice();
    const props = feature.properties;
    const htmlContent = createPopupContent(props, popupPinned, currentFeatureIndex, currentFeatures.length);
    popup.setLngLat(coordinates).setHTML(htmlContent).addTo(map);
}

window.nextTweet = () => {
    currentFeatureIndex = (currentFeatureIndex + 1) % currentFeatures.length;
    showPopupAtIndex(currentFeatureIndex);
};

window.previousTweet = () => {
    currentFeatureIndex = (currentFeatureIndex - 1 + currentFeatures.length) % currentFeatures.length;
    showPopupAtIndex(currentFeatureIndex);
};

window.closePopup = () => {
    popupPinned = false;
    currentFeatures = [];
    currentFeatureIndex = 0;
    popup.remove();
};

let selectedLayers = new Set();
let allLayers = [
    { id: 'disputed', name: 'Zone contestée', layerIds: ['disputed_area_fill', 'disputed_area_outline'] },
    { id: 'heatmap', name: 'Événements', layerIds: ['tweets_points', 'tweets_viseur', 'tweets_hover_area', 'tweets_points_other', 'pulse-high-importance'] },
];

function renderLayerList() {
    const layerList = document.getElementById("layerList");
    layerList.innerHTML = "";
    allLayers.forEach(layer => {
        const item = document.createElement("div");
        item.className = "author-item";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = `layer_${layer.id}`;
        checkbox.checked = !selectedLayers.has(layer.id);
        checkbox.addEventListener("change", () => toggleLayer(layer.id));
        const label = document.createElement("label");
        label.htmlFor = `layer_${layer.id}`;
        const span = document.createElement("span");
        span.textContent = layer.name;
        label.appendChild(span);
        item.appendChild(checkbox);
        item.appendChild(label);
        item.addEventListener("click", (e) => {
            if (e.target === checkbox || e.target === label || e.target === span) {
                return;
            }
            checkbox.click();
        });
        layerList.appendChild(item);
    });
    updateLayerFilterButton();
}

function toggleLayer(layerId) {
    if (selectedLayers.has(layerId)) {
        selectedLayers.delete(layerId);
    } else {
        selectedLayers.add(layerId);
    }
    const layer = allLayers.find(l => l.id === layerId);
    const visibility = selectedLayers.has(layerId) ? 'none' : 'visible';
    layer.layerIds.forEach(lid => {
        map.setLayoutProperty(lid, 'visibility', visibility);
    });
    updateLayerFilterButton();
}

function updateLayerFilterButton() {
    const btn = document.getElementById("layerFilterBtn");
    const label = document.getElementById("layerFilterLabel");
    const nbVisible = allLayers.length - selectedLayers.size;
    if (selectedLayers.size === 0) {
        label.textContent = `Couches (${nbVisible})`;
        btn.classList.remove("has-selection");
    } else if (selectedLayers.size === allLayers.length) {
        label.textContent = "Couche (0)";
        btn.classList.add("has-selection");
    } else {
        label.textContent = `Couches (${nbVisible})`;
        btn.classList.add("has-selection");
    }
}

const layerFilterBtn = document.getElementById("layerFilterBtn");
const layerDropdown = document.getElementById("layerDropdown");
layerFilterBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    layerDropdown.classList.toggle("open");
    layerFilterBtn.classList.toggle("open");
});

document.addEventListener("click", (e) => {
    if (!layerDropdown.contains(e.target) && e.target !== layerFilterBtn) {
        layerDropdown.classList.remove("open");
        layerFilterBtn.classList.remove("open");
    }
});

map.on('style.load', async () => {
    map.setProjection({ type: 'globe' });

    // Créer une image de hachures
    const size = 64;
    const hatchImage = new Uint8Array(size * size * 4);

    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            const i = (y * size + x) * 4;
            // Créer des lignes diagonales
            const isDiagonal = (x + y) % 8 < 2;
            if (isDiagonal) {
                hatchImage[i] = 136;     // R (rouge foncé #880000)
                hatchImage[i + 1] = 0;   // G
                hatchImage[i + 2] = 0;   // B
                hatchImage[i + 3] = 255; // A (opaque)
            } else {
                hatchImage[i] = 0;
                hatchImage[i + 1] = 0;
                hatchImage[i + 2] = 0;
                hatchImage[i + 3] = 0;   // Transparent
            }
        }
    }

    // Ajouter l'image au style de la carte
    map.addImage('hatch-pattern', {
        width: size,
        height: size,
        data: hatchImage
    });

    map.addSource('disputed_area', {
        type: 'geojson',
        data: 'https://api-conflit-twitter.duckdns.org/api/twitter_conflicts/disputed_area.geojson'
    });

    // Utiliser le pattern pour le fill
    map.addLayer({
        id: 'disputed_area_fill',
        type: 'fill',
        source: 'disputed_area',
        paint: {
            'fill-pattern': 'hatch-pattern',
            'fill-opacity': 0.5
        }
    });

    map.addLayer({
        id: 'disputed_area_outline',
        type: 'line',
        source: 'disputed_area',
        paint: {
            'line-color': '#880000',
            'line-width': 1,
            'line-opacity': 1,
        }
    });

    // Précharger toutes les données en parallèle
    await preloadAllData();

    // Initialiser avec la période par défaut (1 jour)
    map.addSource('tweets', {
        type: 'geojson',
        data: cachedData[currentDays]
    });

    await loadAuthors();

    const tweetCount = cachedData[currentDays].features ? cachedData[currentDays].features.length : 0;
    document.getElementById("tweet-count").textContent = `${tweetCount} événement${tweetCount > 1 ? 's' : ''}`;

    // ─── Couche pulse (anneau qui pulse) ───────────────────────────────────────
    map.addLayer({
        id: 'pulse-high-importance',
        type: 'circle',
        source: 'tweets',
        filter: [
            'all',
            ['>=', ['coalesce', ['to-number', ['get', 'importance']], 0], 4]
        ],
        paint: {
            'circle-color': 'transparent',
            'circle-opacity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                2, 0.05,     // Très discret à zoom 2 (dézoom max typique)
                5, 0.15,     // Commence à être visible
                8, 0.25,
                12, 0.4      // Plus présent en zoom moyen
            ],
            'circle-radius': 20,  // ← base plus grande (sera augmentée dynamiquement)
            'circle-stroke-color': [
                'match',
                ['get', 'typology'],
                'MIL', '#ff3b5c',
                'OTHER', 'rgba(108, 172, 251, 1)',
                '#888888'
            ],
            'circle-stroke-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                2, 1.5,   // stroke fin quand dézoomé
                6, 2.5,
                10, 4     // plus épais quand zoomé
            ],
            'circle-stroke-opacity': 0   // animé dans la boucle
        },
        minzoom: 0   // ← baisse à 3 ou 2 pour voir de très loin (attention perf si trop de points !)
    });

    // Couche des points principaux (MIL rouge)
    map.addLayer({
        id: 'tweets_points',
        type: 'circle',
        source: 'tweets',
        filter: ['==', ['get', 'typology'], 'MIL'],
        paint: {
            'circle-color': '#ff3b5c',
            'circle-opacity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                3, 0.4,
                5, 0.5,
                10, 0.6,
                18, 1
            ],
            'circle-radius': [
                'interpolate',
                ['linear'],
                ['coalesce', ['to-number', ['get', 'importance']], 1],
                1, 1,
                2, 2,
                3, 3,
                4, 4,
                5, 10
            ]
        }
    });

    map.addLayer({
        id: 'tweets_heatmap_other',
        type: 'heatmap',
        source: 'tweets',
        filter: ['==', ['get', 'typology'], 'OTHER'],
        paint: {
            // Intensité basée sur l'importance
            'heatmap-weight': [
                'interpolate',
                ['linear'],
                ['get', 'importance'],
                1, 0.2,
                5, 1
            ],

            // Intensité globale en fonction du zoom
            'heatmap-intensity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                0, 1,
                9, 3
            ],

            // Gradient de couleurs (du transparent au bleu foncé)
            'heatmap-color': [
                'interpolate',
                ['linear'],
                ['heatmap-density'],
                0, 'rgba(0, 0, 0, 0)',
                0.2, 'rgba(108, 172, 251, 1)',
                0.4, '#b4cff1',
                0.6, '#b4cff1',
                0.8, '#b4cff1',
                1, '#b4cff1'
            ],

            // Rayon des points de chaleur
            'heatmap-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                0, 7,
                9, 15
            ],

            // Opacité de la heatmap selon le zoom
            'heatmap-opacity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                7, 1,
                9, 0.8
            ]
        }
    });

    map.addLayer({
        id: 'tweets_viseur',
        type: 'circle',
        source: 'tweets',
        filter: ['==', ['get', 'typology'], 'MIL'],
        paint: {
            'circle-color': '#ff3b5c',
            'circle-opacity': 0.3,
            'circle-radius': [
                'interpolate',
                ['linear'],
                ['coalesce', ['to-number', ['get', 'importance']], 1],
                1, 2,
                2, 4,
                3, 6,
                4, 10,
                5, 20
            ],
            'circle-stroke-width': 1,
            'circle-stroke-color': '#ff3b5c',
            'circle-stroke-opacity': .8
        }
    });

    // ===== POINTS INDIVIDUELS (INVISIBLES mais interactifs) =====
    map.addLayer({
        id: 'tweets_hover_area',
        type: 'circle',
        source: 'tweets',
        paint: {
            'circle-radius': 10,
            'circle-opacity': 0
        }
    });

    renderLayerList();

    // ===== INTERACTIONS =====
    map.on('mouseenter', 'tweets_hover_area', (e) => {
        if (popupPinned) return;
        map.getCanvas().style.cursor = 'pointer';
        const point = e.point;
        const features = map.queryRenderedFeatures(point, {
            layers: ['tweets_hover_area']
        });

        // Trier par importance
        features.sort((a, b) => {
            const importanceA = parseFloat(a.properties.importance) || 0;
            const importanceB = parseFloat(b.properties.importance) || 0;
            return importanceB - importanceA;
        });

        if (features.length === 0) return;
        const feature = features[0]; // Prend le plus important
        const coordinates = feature.geometry.coordinates.slice();
        const props = feature.properties;
        while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
            coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
        }
        const htmlContent = createPopupContent(props, false, 0, features.length);
        popup.setLngLat(coordinates).setHTML(htmlContent).addTo(map);
    });

    map.on('mouseleave', 'tweets_hover_area', () => {
        if (!popupPinned) {
            map.getCanvas().style.cursor = '';
            popup.remove();
        }
    });

    map.on('click', 'tweets_hover_area', (e) => {
        popupPinned = true;
        const point = e.point;
        currentFeatures = map.queryRenderedFeatures(point, {
            layers: ['tweets_hover_area']
        });

        // Trier par importance décroissante
        currentFeatures.sort((a, b) => {
            const importanceA = parseFloat(a.properties.importance) || 0;
            const importanceB = parseFloat(b.properties.importance) || 0;
            return importanceB - importanceA; // Ordre décroissant
        });

        if (currentFeatures.length === 0) return;
        currentFeatureIndex = 0;
        showPopupAtIndex(0);
    });

    rotationInterval = setInterval(() => {
        const center = map.getCenter();
        center.lng += 0.5;
        map.easeTo({ center, duration: 100, easing: (t) => t });
    }, 100);
    map.on('mousedown', () => clearInterval(rotationInterval));
    startRotation();

    // ─── Animation pulse ───────────────────────────────────────────────────────
    let animationFrameId = null;

    function animatePulse() {
        const now = performance.now() / 1000;
        const zoom = map.getZoom();


        const duration = 2.8;
        const phase = (now % duration) / duration;


        const maxOpacity = zoom < 6 ? 0.9 : zoom < 9 ? 0.85 : 0.8;


        // ─── DEAD ZONE AU DÉBUT ───
        const appearStart = 0.12; // 12% du cycle invisible


        let opacity = 0;
        if (phase > appearStart) {
            const t = (phase - appearStart) / (1 - appearStart);
            opacity = maxOpacity * (1 - t);
        }


        if (zoom < 3) opacity *= 0.6;


        const baseRadius = [
            2, 7,
            4, 6,
            6, 5,
            8, 4,
            12, 3
        ].reduce((acc, val, i, arr) => {
            if (i % 2 === 0 && zoom <= val) return arr[i + 1];
            if (i === arr.length - 2) return arr[i + 1];
            return acc;
        }, 3);


        const maxGrowFactor = zoom < 6 ? 15 : zoom < 9 ? 8 : 10;
        const maxGrow = baseRadius * maxGrowFactor;


        // Rayon démarre immédiatement
        const radius = baseRadius + (maxGrow - baseRadius) * phase;


        map.setPaintProperty('pulse-high-importance', 'circle-stroke-opacity', opacity);
        map.setPaintProperty('pulse-high-importance', 'circle-opacity', opacity);
        map.setPaintProperty('pulse-high-importance', 'circle-radius', radius);


        animationFrameId = requestAnimationFrame(animatePulse);
    }

    // Démarre l'animation
    animatePulse();

    // Arrête/reprend sur visibility change (économie batterie/CPU)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        } else {
            if (!animationFrameId) animatePulse();
        }
    });
});

['mousedown', 'touchstart', 'dragstart'].forEach(evt => {
    map.on(evt, stopRotation);
});

document.addEventListener('DOMContentLoaded', () => {
    const timeButtons = document.querySelectorAll('.time-btn');
    timeButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const days = parseInt(btn.dataset.days);
            timeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentDays = days;
            await loadAuthors();
            await loadTweets(days);
        });
    });
});

const searchInput = document.getElementById("tweet-search");
let searchTimeout = null;
searchInput.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        currentSearch = searchInput.value;
        loadTweets(currentDays);
    }, 300);
});

// Variables pour le bandeau
let pendingTweetsUpdate = null;
let isBannerVisible = true;

// Fonction pour basculer la visibilité du bandeau
function toggleBanner() {
    const banner = document.getElementById("bottomBanner");
    const toggleBtn = document.getElementById("bannerToggle");

    if (isBannerVisible) {
        banner.style.transform = 'translateY(100%)';
        toggleBtn.textContent = '▼ Afficher';
        isBannerVisible = false;
    } else {
        banner.style.transform = 'translateY(0)';
        toggleBtn.textContent = '× Fermer';
        isBannerVisible = true;
    }
}

async function fetchNewTweets() {
    try {
        const res = await fetch("https://api-conflit-twitter.duckdns.org/api/twitter_conflicts/random_tweets");
        if (!res.ok) throw new Error("Erreur fetch tweets");

        const { tweets } = await res.json();
        if (!tweets?.length) return null;

        return tweets;
    } catch (err) {
        console.warn("Impossible de récupérer les nouveaux tweets", err);
        return null;
    }
}

function generateTweetsHtml(tweets) {
    return tweets.map(tweet => {
        const timeStr = new Date(tweet.date_published).toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit'
        });

        const avatarHtml = tweet.author && tweet.author.trim()
            ? `<img src="img/${tweet.author}.jpg" class="avatar-small" alt="@${tweet.author}"
                 onerror="this.classList.add('missing'); this.src=''; this.textContent='${tweet.author.charAt(0).toUpperCase()}'">`
            : `<div class="avatar-small missing">${tweet.author?.charAt(0)?.toUpperCase() || '?'}</div>`;

        return `
            <div class="tweet-marquee-item"
                 role="link"
                 tabindex="0"
                 data-url="${tweet.url}">
                 
                ${avatarHtml}
                <span class="tweet-author">${tweet.author || '—'}</span>
                <span class="tweet-text">
                    ${escapeHtml(tweet.body.substring(0, 280))}
                    ${tweet.body.length > 280 ? '…' : ''}
                    <span class="tweet-link-indicator"> ↗</span>
                </span>
                <span class="tweet-time">${timeStr}</span>
            </div>
        `;
    }).join('');
}

async function updateMarquee() {
    const track = document.getElementById("marqueeTrack");
    if (!track || track.dataset.initialized) return;

    const tweets = await fetchNewTweets();
    if (!tweets) return;

    applyMarqueeContent(track, tweets);

    track.dataset.initialized = "true";
}

function applyMarqueeContent(track, tweets) {
    const itemsHtml = generateTweetsHtml(tweets);
    track.innerHTML = itemsHtml + itemsHtml;

    // attendre le rendu réel
    requestAnimationFrame(() => {
        const totalWidth = track.scrollWidth / 2;
        track.style.setProperty('--scroll-width', `${totalWidth}px`);
    });
}

function handleAnimationIteration() {
    if (!pendingTweetsUpdate) return;

    const track = document.getElementById("marqueeTrack");
    if (!track) return;

    applyMarqueeContent(track, pendingTweetsUpdate);
    pendingTweetsUpdate = null;
}

async function scheduleMarqueeUpdate() {
    const newTweets = await fetchNewTweets();
    if (newTweets) {
        pendingTweetsUpdate = newTweets;
    }
}

// Fonction utilitaire pour sécuriser l'affichage
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Lancement initial + refresh périodique
document.addEventListener("DOMContentLoaded", async () => {

    const toggleBtn = document.getElementById("bannerToggle");
    if (toggleBtn) {
        toggleBtn.addEventListener("click", toggleBanner);
    }

    await updateMarquee();

    const track = document.getElementById("marqueeTrack");
    if (track) {
        track.addEventListener("animationiteration", handleAnimationIteration);
    }

    setInterval(scheduleMarqueeUpdate, 30000);
});

document.addEventListener("click", (e) => {
    const item = e.target.closest(".tweet-marquee-item");
    if (!item) return;

    const url = item.dataset.url;
    if (!url) return;

    window.open(url, "_blank", "noopener,noreferrer");
});

// Fonction pour formater la date
function formatTweetTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return "À l'instant";
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;

    return date.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Fonction pour obtenir les initiales d'un auteur
function getAuthorInitials(author) {
    const parts = author.replace('@', '').split(/[_\s]/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return author.substring(0, 2).toUpperCase();
}

function getProfileImagePath(author) {
    // Nettoyer le nom d'auteur et créer le chemin
    const cleanAuthor = author.startsWith('@') ? author : `@${author}`;
    return `img/${cleanAuthor}.jpg`;
}

// Fonction pour créer le panneau avec carrousel
function createImportantTweetsPanel() {
    const panel = document.createElement('div');
    panel.className = 'important-tweets-panel';
    panel.id = 'importantTweetsPanel';

    panel.innerHTML = `

    <div class="panel-content" id="panelContent">
        <div class="no-tweets-message">Aucun événement important ces dernières 24 heures.</div>
    </div>
`;

    document.body.appendChild(panel);

    // Ajouter l'événement pour le bouton fermer


    return panel;
}

// Navigation pour les tweets importants
window.prevImportantTweet = () => {
    if (importantTweets.length > 0) {
        currentImportantIndex = (currentImportantIndex - 1 + importantTweets.length) % importantTweets.length;
        displayCurrentImportantTweet();
    }
};

window.nextImportantTweet = () => {
    if (importantTweets.length > 0) {
        currentImportantIndex = (currentImportantIndex + 1) % importantTweets.length;
        displayCurrentImportantTweet();
    }
};

// Fonction pour afficher le tweet actuel
function displayCurrentImportantTweet() {
    if (importantTweets.length === 0) return;

    const content = document.getElementById('panelContent');
    const tweet = importantTweets[currentImportantIndex];

    const hasLocation = tweet.lat && tweet.long;

    content.innerHTML = `
        <div class="important-tweet-card">
            <div class="tweet-card-header">
                <div class="tweet-card-avatar">
                    <img src="${getProfileImagePath(tweet.author)}" 
                         alt="${tweet.author}" 
                         onerror="this.style.display='none'; this.parentElement.textContent='${getAuthorInitials(tweet.author)}';">
                </div>
                <div class="tweet-card-author">${tweet.author}</div>
                <span class="important-badge">Événement important</span>
                <div class="tweet-card-time">${formatTweetTime(tweet.date_published)}</div>
            </div>
            <div class="tweet-card-body">${truncateText(tweet.body, 280)}</div>
            <div class="tweet-card-actions">
                <a href="${tweet.url}" target="_blank" rel="noopener noreferrer" class="tweet-card-link">
                    <span>Voir le tweet ↗</span>
                </a>
                ${hasLocation ? `
                <button class="tweet-map-btn" data-lat="${tweet.lat}" data-lng="${tweet.long}">
                    <span>Voir sur la carte</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                </button>
                ` : ''}
                ${importantTweets.length > 1 ? `
                <div class="tweet-nav-controls">
                    <span class="tweet-card-nav-count">${currentImportantIndex + 1}/${importantTweets.length}</span>
                    <button onclick="window.prevImportantTweet()" class="tweet-card-nav-btn">←</button>
                    <button onclick="window.nextImportantTweet()" class="tweet-card-nav-btn">→</button>
                </div>
                ` : ''}
            </div>
        </div>
    `;

    // Ajouter l'événement pour le bouton "Voir sur la carte" du tweet actuel
    const mapBtn = content.querySelector('.tweet-map-btn');
    if (mapBtn) {
        mapBtn.addEventListener('click', (e) => {
            const lat = parseFloat(e.currentTarget.getAttribute('data-lat'));
            const lng = parseFloat(e.currentTarget.getAttribute('data-lng'));
            stopRotation();

            if (map) {
                map.flyTo({
                    center: [lng, lat],
                    zoom: 6,
                    essential: true
                });
            }
        });
    }
}

// Fonction principale pour charger et afficher
async function loadImportantTweets() {
    try {
        const response = await fetch('https://api-conflit-twitter.duckdns.org/api/twitter_conflicts/important_tweets');

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Stocker les tweets
        importantTweets = data.tweets;
        currentImportantIndex = 0;

        // Créer le panneau
        createImportantTweetsPanel();

        // Afficher le premier tweet
        displayCurrentImportantTweet();

    } catch (error) {
        console.error('Erreur lors de la récupération des tweets:', error);

        // Afficher l'erreur dans le panneau si il existe
        const content = document.getElementById('panelContent');
        if (content) {
            content.innerHTML = `
                <div class="no-tweets-message">
                    Erreur de chargement<br>
                    <small style="color: #dc2626;">${error.message}</small>
                </div>
            `;
        }
    }
}

// Appeler la fonction au chargement de la page
loadImportantTweets();