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
let currentImportantIndex = 0;

// Variables pour le panneau de tweets feed
let isTweetsFeedOpen = false;
let allTweetsForFeed = [];

// Variables pour le panneau pays
let currentCountryId = null;
let currentCountryName = null;
let currentCountryTab = 'summary'; // 'summary' ou 'events'
let currentCountryPeriod = 1; // Pour le graphique dans l'onglet Résumé
let countryChart = null;

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

// Fonction pour basculer le panneau de tweets feed
function toggleTweetsFeed() {
    const panel = document.getElementById('tweets-feed-panel');
    const toggleBtn = document.getElementById('tweets-feed-toggle');

    isTweetsFeedOpen = !isTweetsFeedOpen;

    if (isTweetsFeedOpen) {
        panel.classList.add('visible');
        toggleBtn.classList.add('active');
        loadTweetsFeed();
    } else {
        panel.classList.remove('visible');
        toggleBtn.classList.remove('active');
    }
}

// Fonction pour charger les tweets dans le feed
async function loadTweetsFeed() {
    const content = document.getElementById('tweets-feed-content');
    content.innerHTML = '<div class="feed-loading">Chargement des tweets...</div>';

    try {
        const hours = currentDays * 24;
        let data;

        if (cachedData[currentDays]) {
            data = cachedData[currentDays];
        } else {
            const response = await fetch(`https://api-conflit-twitter.duckdns.org/api/twitter_conflicts/tweets.geojson?hours=${hours}`);
            data = await response.json();
        }

        // Appliquer les filtres
        const authorsToShow = allAuthors.filter(a => !selectedAuthors.has(a));
        let filteredFeatures = data.features.filter(feature => {
            const authorMatch = authorsToShow.length === 0 ||
                authorsToShow.length === allAuthors.length ||
                authorsToShow.includes(feature.properties.author);
            const searchMatch = currentSearch.trim() === "" ||
                feature.properties.body.toLowerCase().includes(currentSearch.toLowerCase());
            return authorMatch && searchMatch;
        });

        // Trier par date (plus récent en premier)
        filteredFeatures.sort((a, b) => {
            const dateA = new Date(a.properties.date_published);
            const dateB = new Date(b.properties.date_published);
            return dateB - dateA;
        });

        allTweetsForFeed = filteredFeatures;
        renderTweetsFeed(filteredFeatures);

    } catch (error) {
        console.error("Erreur lors du chargement du feed:", error);
        content.innerHTML = '<div class="feed-empty">Erreur lors du chargement des tweets</div>';
    }
}

// Fonction pour afficher les tweets dans le feed
function renderTweetsFeed(features) {
    const content = document.getElementById('tweets-feed-content');

    if (features.length === 0) {
        content.innerHTML = '<div class="feed-empty">Aucun tweet trouvé pour cette période</div>';
        return;
    }

    content.innerHTML = '';

    features.forEach((feature, index) => {
        const props = feature.properties;
        const item = createFeedTweetItem(props, feature, index);
        content.appendChild(item);
    });
}

// Fonction pour créer un élément de tweet dans le feed
function createFeedTweetItem(props, feature, index) {
    const item = document.createElement('div');
    item.className = 'feed-tweet-item';

    const tweetDate = new Date(props.date_published);
    const formattedDate = formatTweetTime(props.date_published);

    // Avatar
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'feed-tweet-avatar';
    const avatarImg = document.createElement('img');
    avatarImg.src = `img/${props.author}.jpg`;
    avatarImg.alt = props.author;
    avatarImg.onerror = () => {
        avatarImg.style.display = 'none';
        avatarDiv.textContent = getAuthorInitials(props.author);
    };
    avatarDiv.appendChild(avatarImg);

    // Header
    const header = document.createElement('div');
    header.className = 'feed-tweet-header';

    const authorSpan = document.createElement('div');
    authorSpan.className = 'feed-tweet-author';
    authorSpan.textContent = props.author;

    const timeSpan = document.createElement('div');
    timeSpan.className = 'feed-tweet-time';
    timeSpan.textContent = formattedDate;

    header.appendChild(avatarDiv);
    header.appendChild(authorSpan);
    header.appendChild(timeSpan);

    // Body
    const body = document.createElement('div');
    body.className = 'feed-tweet-body';
    body.textContent = props.body;

    // Images
    const imagesContainer = document.createElement('div');
    let images = props.images;

    // Parser les images si c'est une string JSON
    if (typeof images === 'string') {
        try {
            images = JSON.parse(images);
        } catch (e) {
            images = [];
        }
    }

    if (images && Array.isArray(images) && images.length > 0) {
        const imageCount = images.length;

        if (imageCount === 1) {
            imagesContainer.className = 'tweet-card-images single';
            imagesContainer.innerHTML = `
                <img src="${images[0]}" alt="Image du tweet" loading="lazy" 
                     onerror="this.parentElement.style.display='none'">
            `;
        } else if (imageCount === 2) {
            imagesContainer.className = 'tweet-card-images double';
            imagesContainer.innerHTML = images.map(img => `
                <img src="${img}" alt="Image du tweet" loading="lazy" 
                     onerror="this.style.display='none'">
            `).join('');
        } else if (imageCount === 3) {
            imagesContainer.className = 'tweet-card-images triple';
            imagesContainer.innerHTML = `
                <img src="${images[0]}" alt="Image du tweet" loading="lazy" class="main-img"
                     onerror="this.style.display='none'">
                <div class="secondary-imgs">
                    <img src="${images[1]}" alt="Image du tweet" loading="lazy"
                         onerror="this.style.display='none'">
                    <img src="${images[2]}" alt="Image du tweet" loading="lazy"
                         onerror="this.style.display='none'">
                </div>
            `;
        } else {
            const displayImages = images.slice(0, 4);
            const remainingCount = imageCount - 4;
            imagesContainer.className = 'tweet-card-images quad';
            imagesContainer.innerHTML = displayImages.map((img, idx) => `
                <div class="img-wrapper ${idx === 3 && remainingCount > 0 ? 'has-more' : ''}">
                    <img src="${img}" alt="Image du tweet" loading="lazy"
                         onerror="this.style.display='none'">
                    ${idx === 3 && remainingCount > 0 ? `
                        <div class="more-overlay">+${remainingCount}</div>
                    ` : ''}
                </div>
            `).join('');
        }
    }

    // Footer
    const footer = document.createElement('div');
    footer.className = 'feed-tweet-footer';

    const typologySpan = document.createElement('span');
    typologySpan.className = `feed-tweet-typology ${props.typology}`;
    typologySpan.textContent = props.typology;

    // Actions
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'feed-tweet-actions';

    // Vérifier si le tweet a une géolocalisation
    const hasGeolocation = feature.geometry && feature.geometry.coordinates &&
        Array.isArray(feature.geometry.coordinates) &&
        feature.geometry.coordinates.length >= 2;

    // Bouton "Voir le tweet"
    const tweetLink = document.createElement('a');
    tweetLink.href = props.url;
    tweetLink.target = '_blank';
    tweetLink.className = 'tweet-card-link';
    tweetLink.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
        Voir le tweet
    `;
    tweetLink.onclick = (e) => {
        e.stopPropagation();
    };

    actionsDiv.appendChild(tweetLink);

    // Bouton "Voir sur la carte" - seulement si géolocalisation disponible
    if (hasGeolocation) {
        const mapBtn = document.createElement('button');
        mapBtn.className = 'feed-tweet-btn feed-tweet-btn-secondary';
        mapBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
            </svg>
            Voir sur la carte
        `;
        mapBtn.onclick = (e) => {
            e.stopPropagation();
            stopRotation();
            const coordinates = feature.geometry.coordinates.slice();

            // Centrer la carte
            map.flyTo({
                center: coordinates,
                zoom: Math.max(map.getZoom(), 5),
                duration: 1000
            });

            // Afficher la popup
            popupPinned = true;
            currentFeatures = [feature];
            currentFeatureIndex = 0;

            // Parser les images si nécessaire
            let popupProps = { ...props };
            if (typeof popupProps.images === 'string') {
                try {
                    popupProps.images = JSON.parse(popupProps.images);
                } catch (e) {
                    popupProps.images = [];
                }
            }

            showPopupAtIndex(0);

            // Fermer le panneau de feed si sur mobile
            if (window.innerWidth <= 640) {
                toggleTweetsFeed();
            }
        };

        actionsDiv.appendChild(mapBtn);
    }

    // Assemblage
    item.appendChild(header);
    item.appendChild(body);
    if (imagesContainer.className) {
        item.appendChild(imagesContainer);
    }
    item.appendChild(footer);
    item.appendChild(actionsDiv);

    return item;
}

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

document.getElementById("rotationToggleBtn").addEventListener("click", toggleRotation);

// Event listener pour le bouton de toggle du feed
document.getElementById("tweets-feed-toggle").addEventListener("click", toggleTweetsFeed);
document.getElementById("close-tweets-feed").addEventListener("click", toggleTweetsFeed);

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
        const authorPromises = periods.map(async (days) => {
            const hours = days * 24;
            const response = await fetch(`https://api-conflit-twitter.duckdns.org/api/twitter_conflicts/authors?hours=${hours}`);
            const data = await response.json();
            cachedAuthors[days] = data.authors || [];
        });

        const tweetPromises = periods.map(async (days) => {
            const hours = days * 24;
            const response = await fetch(`https://api-conflit-twitter.duckdns.org/api/twitter_conflicts/tweets.geojson?hours=${hours}`);
            const data = await response.json();
            cachedData[days] = data;
        });

        await Promise.all([...authorPromises, ...tweetPromises]);

        isInitialLoadComplete = true;
    } catch (error) {
        console.error("Erreur lors du préchargement des données:", error);
    }
}

async function loadAuthors() {
    try {
        const hours = currentDays * 24;

        if (cachedAuthors[currentDays]) {
            allAuthors = cachedAuthors[currentDays];
        } else {
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

    if (isTweetsFeedOpen) {
        loadTweetsFeed();
    }
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
    const hours = days * 24;

    if (cachedData[days]) {
        data = cachedData[days];
    } else {
        const params = new URLSearchParams({ hours: hours });
        const response = await fetch(
            `https://api-conflit-twitter.duckdns.org/api/twitter_conflicts/tweets.geojson?${params.toString()}`
        );
        data = await response.json();
        cachedData[days] = data;
    }

    let filteredData = { ...data };

    const authorsToShow = allAuthors.filter(a => !selectedAuthors.has(a));

    if (selectedAuthors.size === allAuthors.length) {
        filteredData.features = [];
    } else {
        filteredData.features = data.features.filter(feature => {
            const authorMatch = authorsToShow.length === 0 ||
                authorsToShow.length === allAuthors.length ||
                authorsToShow.includes(feature.properties.author);

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

    if (isTweetsFeedOpen) {
        loadTweetsFeed();
    }
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

    let imagesHtml = '';
    if (props.images && Array.isArray(props.images) && props.images.length > 0) {
        const imageCount = props.images.length;

        if (imageCount === 1) {
            imagesHtml = `
                <div class="tweet-card-images single">
                    <img src="${props.images[0]}" alt="Image du tweet" loading="lazy" 
                         onerror="this.parentElement.style.display='none'">
                </div>
            `;
        } else if (imageCount === 2) {
            imagesHtml = `
                <div class="tweet-card-images double">
                    ${props.images.map(img => `
                        <img src="${img}" alt="Image du tweet" loading="lazy" 
                             onerror="this.style.display='none'">
                    `).join('')}
                </div>
            `;
        } else if (imageCount === 3) {
            imagesHtml = `
                <div class="tweet-card-images triple">
                    <img src="${props.images[0]}" alt="Image du tweet" loading="lazy" class="main-img"
                         onerror="this.style.display='none'">
                    <div class="secondary-imgs">
                        <img src="${props.images[1]}" alt="Image du tweet" loading="lazy"
                             onerror="this.style.display='none'">
                        <img src="${props.images[2]}" alt="Image du tweet" loading="lazy"
                             onerror="this.style.display='none'">
                    </div>
                </div>
            `;
        } else {
            const displayImages = props.images.slice(0, 4);
            const remainingCount = imageCount - 4;

            imagesHtml = `
                <div class="tweet-card-images quad">
                    ${displayImages.map((img, idx) => `
                        <div class="img-wrapper ${idx === 3 && remainingCount > 0 ? 'has-more' : ''}">
                            <img src="${img}" alt="Image du tweet" loading="lazy"
                                 onerror="this.style.display='none'">
                            ${idx === 3 && remainingCount > 0 ? `
                                <div class="more-overlay">+${remainingCount}</div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            `;
        }
    }

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
        ${imagesHtml}
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

showPopupAtIndex = function (index) {
    if (currentFeatures.length === 0) return;
    currentFeatureIndex = index;
    const feature = currentFeatures[currentFeatureIndex];
    const coordinates = feature.geometry.coordinates.slice();

    let props = feature.properties;

    if (typeof props.images === 'string') {
        try {
            props.images = JSON.parse(props.images);
        } catch (e) {
            props.images = [];
        }
    }

    const htmlContent = createPopupContent(props, popupPinned, currentFeatureIndex, currentFeatures.length);
    popup.setLngLat(coordinates).setHTML(htmlContent).addTo(map);
};

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

    const size = 64;
    const hatchImage = new Uint8Array(size * size * 4);

    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            const i = (y * size + x) * 4;
            const isDiagonal = (x + y) % 8 < 2;
            if (isDiagonal) {
                hatchImage[i] = 136;
                hatchImage[i + 1] = 0;
                hatchImage[i + 2] = 0;
                hatchImage[i + 3] = 255;
            } else {
                hatchImage[i] = 0;
                hatchImage[i + 1] = 0;
                hatchImage[i + 2] = 0;
                hatchImage[i + 3] = 0;
            }
        }
    }

    map.addImage('hatch-pattern', {
        width: size,
        height: size,
        data: hatchImage
    });

    map.addSource('disputed_area', {
        type: 'geojson',
        data: 'https://api-conflit-twitter.duckdns.org/api/twitter_conflicts/disputed_area.geojson'
    });

    map.addSource('world_countries', {
        type: 'geojson',
        data: 'https://api-conflit-twitter.duckdns.org/api/twitter_conflicts/world_countries.geojson',
        generateId: true
    });

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

    map.addLayer({
        id: 'world_countries_fill',
        type: 'fill',
        source: 'world_countries',
        paint: {
            'fill-color': [
                'case',
                ['boolean', ['feature-state', 'hover'], false],
                'rgba(123, 123, 123, 0.2)',
                'rgba(0,0,0,0)'
            ],
        }
    });

    let hoveredCountryId = null;

    map.on('mousemove', 'world_countries_fill', (e) => {
        if (e.features.length > 0) {
            const feature = e.features[0];

            if (hoveredCountryId !== null && hoveredCountryId !== feature.id) {
                map.setFeatureState(
                    { source: 'world_countries', id: hoveredCountryId },
                    { hover: false }
                );
            }

            map.setFeatureState(
                { source: 'world_countries', id: feature.id },
                { hover: true }
            );

            hoveredCountryId = feature.id;
            map.getCanvas().style.cursor = 'pointer';
        }
    });

    map.on('mouseleave', 'world_countries_fill', () => {
        if (hoveredCountryId !== null) {
            map.setFeatureState(
                { source: 'world_countries', id: hoveredCountryId },
                { hover: false }
            );
        }
        hoveredCountryId = null;
        map.getCanvas().style.cursor = '';
    });

    await preloadAllData();

    map.addSource('tweets', {
        type: 'geojson',
        data: cachedData[currentDays]
    });

    await loadAuthors();

    const tweetCount = cachedData[currentDays].features ? cachedData[currentDays].features.length : 0;
    document.getElementById("tweet-count").textContent = `${tweetCount} événement${tweetCount > 1 ? 's' : ''}`;

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
                2, 0.05,
                5, 0.15,
                8, 0.25,
                12, 0.4
            ],
            'circle-radius': 20,
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
                2, 1.5,
                6, 2.5,
                10, 4
            ],
            'circle-stroke-opacity': 0
        },
        minzoom: 0
    });

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
            'heatmap-weight': [
                'interpolate',
                ['linear'],
                ['get', 'importance'],
                1, 0.2,
                5, 1
            ],

            'heatmap-intensity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                0, 1,
                9, 3
            ],

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

            'heatmap-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                0, 7,
                9, 15
            ],

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

    map.on('mouseenter', 'tweets_hover_area', (e) => {
        if (popupPinned) return;
        map.getCanvas().style.cursor = 'pointer';
        const point = e.point;
        const features = map.queryRenderedFeatures(point, {
            layers: ['tweets_hover_area']
        });

        features.sort((a, b) => {
            const importanceA = parseFloat(a.properties.importance) || 0;
            const importanceB = parseFloat(b.properties.importance) || 0;
            return importanceB - importanceA;
        });

        if (features.length === 0) return;
        const feature = features[0];
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
        e.preventDefault();

        popupPinned = true;
        popup.remove();

        const point = e.point;
        currentFeatures = map.queryRenderedFeatures(point, {
            layers: ['tweets_hover_area']
        });

        currentFeatures.sort((a, b) => {
            const importanceA = parseFloat(a.properties.importance) || 0;
            const importanceB = parseFloat(b.properties.importance) || 0;
            return importanceB - importanceA;
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

    let animationFrameId = null;

    function animatePulse() {
        const now = performance.now() / 1000;
        const zoom = map.getZoom();

        const duration = 2.8;
        const phase = (now % duration) / duration;

        const maxOpacity = zoom < 6 ? 0.9 : zoom < 9 ? 0.85 : 0.8;

        const appearStart = 0.12;

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

        const radius = baseRadius + (maxGrow - baseRadius) * phase;

        map.setPaintProperty('pulse-high-importance', 'circle-stroke-opacity', opacity);
        map.setPaintProperty('pulse-high-importance', 'circle-opacity', opacity);
        map.setPaintProperty('pulse-high-importance', 'circle-radius', radius);

        animationFrameId = requestAnimationFrame(animatePulse);
    }

    animatePulse();

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

// ======================================
// ======================================
// GESTION DU COUNTRY PANEL
// ======================================

// Gestion des onglets Résumé / Événements
document.addEventListener('DOMContentLoaded', () => {
    const panelTabs = document.querySelectorAll('.panel-tab[data-tab]');

    panelTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;

            // Mettre à jour les onglets actifs
            panelTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Mettre à jour le contenu visible
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });

            const targetTab = document.getElementById(`${tabName}-tab`);
            if (targetTab) {
                targetTab.classList.add('active');
            }

            // Sauvegarder l'onglet actuel
            currentCountryTab = tabName;

            // Charger les données appropriées (toujours 30j)
            if (currentCountryName) {
                if (tabName === 'summary') {
                    loadCountryHeatmap(currentCountryName);
                } else if (tabName === 'events') {
                    loadCountryEvents(currentCountryName, 30);
                }
            }
        });
    });
});

// Click sur un pays
map.on('click', 'world_countries_fill', (e) => {
    if (!e.features || e.features.length === 0) return;

    // Vérifier s'il y a un tweet au même endroit
    const tweetsAtPoint = map.queryRenderedFeatures(e.point, {
        layers: ['tweets_hover_area']
    });

    if (tweetsAtPoint && tweetsAtPoint.length > 0) {
        return;
    }

    const feature = e.features[0];
    const countryName = feature.properties.name || feature.properties.SOVEREIGNT || feature.properties.NAME || 'Pays inconnu';
    const countryId = feature.id || feature.properties.id;

    // Mettre à jour le titre
    document.getElementById('country-title').textContent = "Vue générale : " + countryName;

    // Réinitialiser à l'onglet Résumé
    document.querySelectorAll('.panel-tab[data-tab]').forEach(tab => {
        if (tab.dataset.tab === 'summary') {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById('summary-tab').classList.add('active');

    currentCountryTab = 'summary';
    currentCountryId = countryId;
    currentCountryName = countryName;

    // Charger la heatmap
    loadCountryHeatmap(countryName);

    // Ouvrir le panneau
    const panel = document.getElementById('country-panel');
    panel.classList.add('visible');
});

// Fermeture du panneau
document.getElementById('close-panel').addEventListener('click', () => {
    document.getElementById('country-panel').classList.remove('visible');
    currentCountryId = null;
    currentCountryName = null;
});

// Fermer si on clique ailleurs sur la map
map.on('click', (e) => {
    const tweetsAtPoint = map.queryRenderedFeatures(e.point, {
        layers: ['tweets_hover_area']
    });

    if (tweetsAtPoint && tweetsAtPoint.length > 0) {
        return;
    }

    const features = map.queryRenderedFeatures(e.point, { layers: ['world_countries_fill'] });
    if (features.length === 0) {
        document.getElementById('country-panel').classList.remove('visible');
        currentCountryId = null;
        currentCountryName = null;
    }
});

// Curseur au survol
map.on('mouseenter', 'world_countries_fill', () => {
    map.getCanvas().style.cursor = 'pointer';
});
map.on('mouseleave', 'world_countries_fill', () => {
    map.getCanvas().style.cursor = '';
});

// ======================================
// HEATMAP CALENDRIER (30 JOURS)
// ======================================

async function loadCountryHeatmap(countryName) {
    const countryInfo = document.getElementById('country-info');
    countryInfo.innerHTML = '<div class="feed-loading">Chargement des données...</div>';

    try {
        // Calculer le début du mois actuel
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const daysSinceStart = Math.ceil((now - firstDayOfMonth) / (1000 * 60 * 60 * 24)) + 1;
        const hours = daysSinceStart * 24;

        const response = await fetch(
            `https://api-conflit-twitter.duckdns.org/api/twitter_conflicts/tweets.geojson?country=${encodeURIComponent(countryName)}&hours=${hours}`
        );
        const data = await response.json();

        createHeatmap(data.features, countryName);

    } catch (error) {
        console.error("Erreur lors du chargement des données:", error);
        countryInfo.innerHTML = 
'<div class="feed-empty">Aucun événement</div>';
        
    }
}


function createHeatmap(features, countryName) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    // --- RECTIFICATION DES CLÉS DE DATE (Locale au lieu de UTC) ---
    const getDateKey = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const monthName = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Premier jour du mois
    const firstDay = new Date(year, month, 1);
    // Ajustement pour commencer la semaine (0=Dimanche, 1=Lundi...)
    // Si vous voulez que la heatmap commence par Lundi, utilisez : (firstDay.getDay() + 6) % 7
    const startDayOfWeek = firstDay.getDay();

    const dayData = {};

    // Initialiser tous les jours du mois à 0
    for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(year, month, i);
        const dateKey = getDateKey(date);
        dayData[dateKey] = 0;
    }

    // Compter les événements par jour
    features.forEach(feature => {
        const date = new Date(feature.properties.date_published);
        const dateKey = getDateKey(date); // Utilisation de la même fonction de clé
        if (dayData.hasOwnProperty(dateKey)) {
            dayData[dateKey]++;
        }
    });

    const values = Object.values(dayData);
    const totalEvents = values.reduce((a, b) => a + b, 0);
    const maxEvents = values.length ? Math.max(...values) : 0;
    const avgEvents = daysInMonth ? totalEvents / daysInMonth : 0;

    function getLevel(count) {
        if (count === 0 || maxEvents === 0) return 0;
        const ratio = count / maxEvents;
        if (ratio <= 0.25) return 1;
        if (ratio <= 0.50) return 2;
        if (ratio <= 0.75) return 3;
        return 4;
    }

    // ─────────────────────────────────────────────
    // Construction du calendrier semaine par semaine
    // ─────────────────────────────────────────────
    const dates = Object.keys(dayData).sort();
    const weeks = [];
    let currentWeek = [];

    // Remplir les jours vides au début
    for (let i = 0; i < startDayOfWeek; i++) {
        currentWeek.push(null);
    }

    dates.forEach(dateKey => {
        currentWeek.push({
            date: dateKey,
            count: dayData[dateKey],
            level: getLevel(dayData[dateKey])
        });

        if (currentWeek.length === 7) {
            weeks.push(currentWeek);
            currentWeek = [];
        }
    });

    if (currentWeek.length > 0) {
        while (currentWeek.length < 7) {
            currentWeek.push(null);
        }
        weeks.push(currentWeek);
    }

    // Génération HTML
    let html = `
        <div class="heatmap-container">
            <div class="heatmap-title">Activité de ${monthName}</div>
            <div class="heatmap-calendar">
    `;

    weeks.forEach((week, weekIndex) => {
        html += `<div class="heatmap-week-label">S${weekIndex + 1}</div>`;

        week.forEach(day => {
            if (day === null) {
                html += `<div class="heatmap-day empty"></div>`;
            } else {
                const dateObj = new Date(day.date);
                const formattedDate = dateObj.toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short'
                });

                html += `
                    <div class="heatmap-day level-${day.level}" 
                         data-date="${day.date}"
                         data-count="${day.count}">
                    </div>
                `;
            }
        });
    });

    html += `
            </div>

            <div class="heatmap-stats">
                <div class="heatmap-stat">
                    <div class="heatmap-stat-value">${totalEvents}</div>
                    <div class="heatmap-stat-label">Total événements</div>
                </div>
                <div class="heatmap-stat">
                    <div class="heatmap-stat-value">${maxEvents}</div>
                    <div class="heatmap-stat-label">Pic journalier</div>
                </div>
                <div class="heatmap-stat">
                    <div class="heatmap-stat-value">${avgEvents.toFixed(1)}</div>
                    <div class="heatmap-stat-label">Moyenne / jour</div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('country-info').innerHTML = html;

    // Ajouter les tooltips
    setTimeout(() => {
        const days = document.querySelectorAll('.heatmap-day[data-date]');

        // Fonction utilitaire pour mettre la première lettre en majuscule
        const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

        days.forEach(day => {
            day.addEventListener('mouseenter', (e) => {
                // Nettoyage de sécurité pour éviter les doublons
                const existing = document.querySelectorAll('.heatmap-tooltip');
                existing.forEach(t => t.remove());

                const rect = e.target.getBoundingClientRect();

                // On récupère la date locale (en évitant le décalage UTC)
                const dateParts = day.dataset.date.split('-');
                const date = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);

                // Formatage des segments séparément pour les manipuler
                const weekday = capitalize(date.toLocaleDateString('fr-FR', { weekday: 'long' }));
                const dayNum = date.getDate();
                const month = capitalize(date.toLocaleDateString('fr-FR', { month: 'long' }));

                const formattedDate = `${weekday} ${dayNum} ${month}`;
                const count = day.dataset.count;

                const tooltip = document.createElement('div');
                tooltip.className = 'heatmap-tooltip';
                tooltip.style.display = 'block';
                tooltip.style.left = rect.left + 'px';
                tooltip.style.top = (rect.top - 35) + 'px'; // Légèrement plus haut pour le confort

                // Utilisation de innerHTML ou remplacement du \n par une balise <br> si besoin
                tooltip.style.whiteSpace = 'pre-line'; // Pour que le \n soit pris en compte
                tooltip.textContent = `${formattedDate}\n${count} événement${count > 1 ? 's' : ''}`;

                document.body.appendChild(tooltip);
                day._tooltip = tooltip;
            });

            day.addEventListener('mouseleave', () => {
                if (day._tooltip) {
                    day._tooltip.remove();
                    day._tooltip = null;
                }
            });
        });
    }, 100);
}

async function loadCountryEvents(countryName, period) {
    const eventsList = document.getElementById('country-events-list');
    eventsList.innerHTML = '<div class="feed-loading">Chargement des événements...</div>';

    try {
        // Calculer le début du mois actuel
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const daysSinceStart = Math.ceil((now - firstDayOfMonth) / (1000 * 60 * 60 * 24)) + 1;
        const hours = daysSinceStart * 24;

        const response = await fetch(
            `https://api-conflit-twitter.duckdns.org/api/twitter_conflicts/tweets.geojson?country=${encodeURIComponent(countryName)}&hours=${hours}`
        );
        const data = await response.json();

        if (!data.features || data.features.length === 0) {
            eventsList.innerHTML = '<div class="feed-empty">Aucun événement</div>';
            return;
        }

        // Trier par date (plus récent en premier)
        data.features.sort((a, b) => {
            const dateA = new Date(a.properties.date_published);
            const dateB = new Date(b.properties.date_published);
            return dateB - dateA;
        });

        eventsList.innerHTML = '';

        data.features.forEach((feature, index) => {
            const props = feature.properties;
            const item = createFeedTweetItem(props, feature, index);
            eventsList.appendChild(item);
        });

    } catch (error) {
        console.error("Erreur lors du chargement des événements:", error);
        eventsList.innerHTML = '<div class="feed-empty">Erreur lors du chargement des événements</div>';
    }
}