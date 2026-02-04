const map = new maplibregl.Map({
    container: 'map',
    style: 'https://api.maptiler.com/maps/satellite-v4/style.json?key=MIeaKd18gACAhOFV3PZu',
    zoom: 3,
    center: [20, 50],
    attributionControl: false
});

// Variables pour le dessin
let isDrawingMode = false;
let isDrawing = false;
let startPoint = null;
let rectangles = [];

map.on('load', () => {
    map.addSource('rectangles', {
        type: 'geojson',
        data: {
            type: 'FeatureCollection',
            features: []
        }
    });

    map.addLayer({
        id: 'rectangles-fill',
        type: 'fill',
        source: 'rectangles',
        paint: {
            'fill-color': '#fbb03b',
            'fill-opacity': 0.1
        }
    });

    map.addLayer({
        id: 'rectangles-outline',
        type: 'line',
        source: 'rectangles',
        paint: {
            'line-color': '#fbb03b',
            'line-width': 1
        }
    });
});

// Créer le bouton
const button = document.createElement('button');
button.className = 'maplibregl-ctrl-icon';
button.title = 'Dessiner un rectangle (clic, déplacer, clic)';
button.innerHTML = '⬜';
button.style.fontSize = '20px';
button.style.fontWeight = 'bold';

const buttonContainer = document.createElement('div');
buttonContainer.className = 'maplibregl-ctrl maplibregl-ctrl-group';
buttonContainer.appendChild(button);

map.addControl({
    onAdd: function () {
        return buttonContainer;
    },
    onRemove: function () { }
}, 'top-left');

// Créer le bouton de suppression
const deleteButton = document.createElement('button');
deleteButton.className = 'maplibregl-ctrl-icon';
deleteButton.title = 'Supprimer tous les rectangles';
deleteButton.innerHTML = '🗑️';
deleteButton.style.fontSize = '16px';

const deleteContainer = document.createElement('div');
deleteContainer.className = 'maplibregl-ctrl maplibregl-ctrl-group';
deleteContainer.appendChild(deleteButton);

map.addControl({
    onAdd: function () {
        return deleteContainer;
    },
    onRemove: function () { }
}, 'top-left');

// Activer le mode dessin
button.addEventListener('click', () => {
    isDrawingMode = !isDrawingMode;
    if (isDrawingMode) {
        button.style.backgroundColor = '#fbb03b';
        map.getCanvas().style.cursor = 'crosshair';
    } else {
        button.style.backgroundColor = '';
        map.getCanvas().style.cursor = '';
        isDrawing = false;
        startPoint = null;
        const permanentRectangles = rectangles.filter(r => !r.properties.temp);
        rectangles = permanentRectangles;
        map.getSource('rectangles').setData({
            type: 'FeatureCollection',
            features: rectangles
        });
    }
});

// Supprimer tous les rectangles
deleteButton.addEventListener('click', () => {
    rectangles = [];
    map.getSource('rectangles').setData({
        type: 'FeatureCollection',
        features: rectangles
    });
    console.log('Tous les rectangles supprimés');
});

// Fonction pour charger et afficher le GeoTIFF
async function loadGeoTIFF(url, bounds) {
    try {
        console.log('Chargement du GeoTIFF depuis:', url);

        // Utiliser le proxy pour éviter les problèmes CORS
        const proxyUrl = `http://127.0.0.1:8000/api/DEMTo3D/proxy_geotiff?url=${encodeURIComponent(url)}`;

        const response = await fetch(proxyUrl);
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        console.log('ArrayBuffer reçu, taille:', arrayBuffer.byteLength);

        // Lire le GeoTIFF avec geotiff.js
        const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
        const image = await tiff.getImage();
        const width = image.getWidth();
        const height = image.getHeight();

        console.log(`Image GeoTIFF: ${width}x${height} pixels`);

        const rasters = await image.readRasters();
        const elevationData = rasters[0]; // Premier canal (élévation)

        // Créer un canvas pour visualiser les données
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(width, height);

        // Trouver min/max pour la normalisation
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < elevationData.length; i++) {
            const val = elevationData[i];
            if (val !== -32768) { // Ignorer les valeurs "no data" SRTM
                if (val < min) min = val;
                if (val > max) max = val;
            }
        }

        console.log(`Élévation: min=${min}m, max=${max}m`);

        // Convertir en image avec dégradé de gris
        for (let i = 0; i < elevationData.length; i++) {
            const value = elevationData[i];
            let colorValue = 0;

            if (value === -32768) {
                // Valeur "no data" -> transparent
                imageData.data[i * 4 + 3] = 0;
            } else {
                const normalized = (value - min) / (max - min);
                colorValue = Math.floor(normalized * 255);

                imageData.data[i * 4] = colorValue;     // R
                imageData.data[i * 4 + 1] = colorValue; // G
                imageData.data[i * 4 + 2] = colorValue; // B
                imageData.data[i * 4 + 3] = 255;        // A
            }
        }

        ctx.putImageData(imageData, 0, 0);

        // Ajouter comme source image sur MapLibre
        const sourceId = `geotiff-${Date.now()}`;

        map.addSource(sourceId, {
            type: 'image',
            url: canvas.toDataURL(),
            coordinates: [
                [bounds.west, bounds.north],  // top-left
                [bounds.east, bounds.north],  // top-right
                [bounds.east, bounds.south],  // bottom-right
                [bounds.west, bounds.south]   // bottom-left
            ]
        });

        map.addLayer({
            id: `${sourceId}-layer`,
            type: 'raster',
            source: sourceId,
            paint: {
                'raster-opacity': 1
            }
        });

        console.log('✅ GeoTIFF affiché sur la carte');

        // Zoomer sur la zone
        map.fitBounds([
            [bounds.west, bounds.south],
            [bounds.east, bounds.north]
        ], { padding: 50 });

    } catch (error) {
        console.error('❌ Erreur lors du chargement du GeoTIFF:', error);
    }
}

// Événement de clic
map.on('click', (e) => {
    if (!isDrawingMode) return;

    if (!isDrawing) {
        isDrawing = true;
        startPoint = [e.lngLat.lng, e.lngLat.lat];
    } else {
        const endPoint = [e.lngLat.lng, e.lngLat.lat];

        const rectangle = {
            type: 'Feature',
            geometry: {
                type: 'Polygon',
                coordinates: [[
                    startPoint,
                    [endPoint[0], startPoint[1]],
                    endPoint,
                    [startPoint[0], endPoint[1]],
                    startPoint
                ]]
            },
            properties: {
                temp: false,
                id: Date.now()
            }
        };

        const permanentRectangles = rectangles.filter(r => !r.properties.temp);
        permanentRectangles.push(rectangle);
        rectangles = permanentRectangles;

        map.getSource('rectangles').setData({
            type: 'FeatureCollection',
            features: rectangles
        });

        // Envoyer au serveur
        fetch('http://127.0.0.1:8000/api/DEMTo3D/get_polygon_coordinates', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                coordinates: rectangle.geometry.coordinates
            })
        })
            .then(response => {
                if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
                return response.json();
            })
            .then(data => {
                console.log('Réponse du serveur:', data);

                if (data.url && data.bounds) {
                    loadGeoTIFF(data.url, data.bounds);

                    // Générer le modèle 3D côté serveur
                    generate3DModelServer(data.url);
                } else {
                    console.error('Données manquantes dans la réponse');
                }
            })

        // Réinitialiser
        isDrawing = false;
        startPoint = null;
        isDrawingMode = false;
        button.style.backgroundColor = '';
        map.getCanvas().style.cursor = '';
    }
});

// Mouvement de la souris
map.on('mousemove', (e) => {
    if (isDrawing && startPoint) {
        const endPoint = [e.lngLat.lng, e.lngLat.lat];

        const tempRectangle = {
            type: 'Feature',
            geometry: {
                type: 'Polygon',
                coordinates: [[
                    startPoint,
                    [endPoint[0], startPoint[1]],
                    endPoint,
                    [startPoint[0], endPoint[1]],
                    startPoint
                ]]
            },
            properties: { temp: true }
        };

        const permanentRectangles = rectangles.filter(r => !r.properties.temp);

        map.getSource('rectangles').setData({
            type: 'FeatureCollection',
            features: [...permanentRectangles, tempRectangle]
        });
    }
});

async function generate3DModelServer(geotiffUrl) {
    try {
        console.log('🔄 Génération du modèle 3D sur le serveur...');

        const response = await fetch('http://127.0.0.1:8000/api/DEMTo3D/generate_3d_model', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                geotiff_url: geotiffUrl,
                format: 'glb',  // ou 'stl', 'obj', 'gltf'
                exaggeration: 2.0
            })
        });

        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }

        const blob = await response.blob();

        // Télécharger automatiquement le fichier
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'terrain_3d.glb';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        console.log('✅ Modèle 3D téléchargé !');

        // Optionnel: afficher dans Three.js
        display3DModel(blob);

    } catch (error) {
        console.error('❌ Erreur lors de la génération 3D:', error);
    }
}

// Optionnel: Afficher le modèle GLB dans Three.js
function display3DModel(blob) {
    const viewer = document.getElementById('viewer3d');
    viewer.style.display = 'block';

    // Nettoyer
    while (viewer.children.length > 1) {
        viewer.removeChild(viewer.lastChild);
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    const camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    viewer.appendChild(renderer.domElement);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Lumières
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // Charger le modèle GLB
    const loader = new THREE.GLTFLoader();
    const url = URL.createObjectURL(blob);

    loader.load(url, (gltf) => {
        const model = gltf.scene;
        scene.add(model);

        // Centrer et ajuster la caméra
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 1.5;

        camera.position.set(center.x + cameraZ, center.y + cameraZ, center.z + cameraZ);
        camera.lookAt(center);

        controls.target.copy(center);
        controls.update();

        console.log('✅ Modèle 3D chargé dans la vue');
    });

    // Animation
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    // Bouton fermer
    document.getElementById('close3d').onclick = () => {
        viewer.style.display = 'none';
        URL.revokeObjectURL(url);
    };
}
