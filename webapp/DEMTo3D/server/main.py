from fastapi import FastAPI, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from dotenv import load_dotenv
import psycopg2
import os
import json
import geojson
from datetime import datetime, timedelta
from typing import Optional, List
import requests
import io
import numpy as np
import trimesh
import rasterio
from rasterio.io import MemoryFile
import tempfile

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/DEMTo3D/get_polygon_coordinates") 
async def get_polygon_coordinates(request: Request):
    data = await request.json()
    coordinates = data.get('coordinates')[0]
    api_south = coordinates[2][1]
    api_north = coordinates[0][1]
    api_west = coordinates[0][0]
    api_east = coordinates[1][0]
    elevation_url = get_elevation_api(api_south, api_north, api_west, api_east)
    
    return {
        "url": elevation_url,
        "coordinates": coordinates,
        "bounds": {
            "south": api_south,
            "north": api_north,
            "west": api_west,
            "east": api_east
        }
    }

@app.get("/api/DEMTo3D/proxy_geotiff")
async def proxy_geotiff(url: str):
    """Proxy pour éviter les problèmes CORS avec OpenTopography"""
    response = requests.get(url, stream=True)
    return StreamingResponse(
        io.BytesIO(response.content),
        media_type="image/tiff",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Content-Disposition": "inline"
        }
    )

@app.post("/api/DEMTo3D/generate_3d_model")
async def generate_3d_model(request: Request):
    try:
        data = await request.json()
        geotiff_url = data.get('geotiff_url')
        output_format = data.get('format', 'glb')
        exaggeration = data.get('exaggeration', 3.0)
        
        print(f"Génération du modèle 3D au format {output_format}...")
        print(f"Exagération demandée: {exaggeration}")
        
        # Télécharger le GeoTIFF
        response = requests.get(geotiff_url)
        geotiff_data = response.content
        
        # Lire le GeoTIFF avec rasterio
        with MemoryFile(geotiff_data) as memfile:
            with memfile.open() as dataset:
                elevation_data = dataset.read(1)
                height, width = elevation_data.shape
                
                # Obtenir la résolution géographique réelle (en mètres)
                transform = dataset.transform
                pixel_size_x = abs(transform[0])  # degrés
                pixel_size_y = abs(transform[4])  # degrés
                
                # Convertir les degrés en mètres (approximation à la latitude moyenne)
                bounds = dataset.bounds
                lat_center = (bounds.bottom + bounds.top) / 2
                
                # 1 degré de longitude ≈ 111320 * cos(lat) mètres
                # 1 degré de latitude ≈ 111320 mètres
                meters_per_deg_lon = 111320 * np.cos(np.radians(lat_center))
                meters_per_deg_lat = 111320
                
                pixel_width_meters = pixel_size_x * meters_per_deg_lon
                pixel_height_meters = pixel_size_y * meters_per_deg_lat
                
                # Dimensions réelles du terrain en mètres
                terrain_width_meters = width * pixel_width_meters
                terrain_height_meters = height * pixel_height_meters
                
                print(f"Dimensions: {width}x{height} pixels")
                print(f"Résolution: {pixel_width_meters:.2f}m x {pixel_height_meters:.2f}m par pixel")
                print(f"Taille réelle du terrain: {terrain_width_meters:.2f}m x {terrain_height_meters:.2f}m")
                
                # Remplacer les valeurs no-data
                elevation_data = np.where(elevation_data == -32768, np.nan, elevation_data)
                
                # Calculer min/max en ignorant les NaN
                min_elev = np.nanmin(elevation_data)
                max_elev = np.nanmax(elevation_data)
                elevation_range = max_elev - min_elev
                
                print(f"Élévation min: {min_elev:.2f}m, max: {max_elev:.2f}m, range: {elevation_range:.2f}m")
                
                if elevation_range == 0:
                    elevation_range = 1
                
                # Remplacer NaN par min_elev
                elevation_data = np.where(np.isnan(elevation_data), min_elev, elevation_data)
                
                # Créer la grille de vertices
                vertices = []
                faces = []
                colors = []
                
                # CORRECTION MAJEURE: Utiliser les vraies proportions
                # On veut que le modèle fasse 100 unités de large
                target_size = 100.0
                max_terrain_dim = max(terrain_width_meters, terrain_height_meters)
                
                # Échelle identique pour X et Y pour garder les proportions
                scale_xy = target_size / max_terrain_dim
                
                # CRUCIAL: scale_z doit être IDENTIQUE à scale_xy pour avoir les vraies proportions
                # L'exagération est un multiplicateur simple
                scale_z = scale_xy * exaggeration
                
                print(f"Échelles: XY={scale_xy:.6f}, Z={scale_z:.6f}")
                print(f"Exagération: {exaggeration}x")
                
                actual_model_width = terrain_width_meters * scale_xy
                actual_model_height = terrain_height_meters * scale_xy
                actual_model_z = elevation_range * scale_z
                
                print(f"Dimensions du modèle 3D: {actual_model_width:.2f} x {actual_model_height:.2f} x {actual_model_z:.2f} unités")
                print(f"Ratio hauteur/largeur: {(actual_model_z / actual_model_width) * 100:.2f}%")
                
                # Générer les vertices avec les vraies coordonnées en mètres
                for i in range(height):
                    for j in range(width):
                        # Position réelle en mètres
                        x_meters = j * pixel_width_meters
                        y_meters = i * pixel_height_meters
                        z_meters = elevation_data[i, j] - min_elev
                        
                        # Appliquer l'échelle
                        x = x_meters * scale_xy
                        y = y_meters * scale_xy
                        z = z_meters * scale_z
                        
                        vertices.append([x, y, z])
                        
                        # Couleur basée sur l'altitude normalisée
                        normalized = (elevation_data[i, j] - min_elev) / elevation_range
                        color = get_terrain_color(normalized)
                        colors.append(color)
                
                # Générer les faces (triangles)
                for i in range(height - 1):
                    for j in range(width - 1):
                        top_left = i * width + j
                        top_right = i * width + (j + 1)
                        bottom_left = (i + 1) * width + j
                        bottom_right = (i + 1) * width + (j + 1)
                        
                        faces.append([top_left, bottom_left, top_right])
                        faces.append([top_right, bottom_left, bottom_right])
                
                vertices = np.array(vertices)
                faces = np.array(faces)
                colors = np.array(colors)
                
                print(f"Vertices range - X: [{vertices[:,0].min():.2f}, {vertices[:,0].max():.2f}]")
                print(f"Vertices range - Y: [{vertices[:,1].min():.2f}, {vertices[:,1].max():.2f}]")
                print(f"Vertices range - Z: [{vertices[:,2].min():.2f}, {vertices[:,2].max():.2f}]")
                
                # Créer le mesh
                mesh = trimesh.Trimesh(
                    vertices=vertices,
                    faces=faces,
                    vertex_colors=colors,
                    process=False
                )
                
                print(f"Mesh créé: {len(vertices)} vertices, {len(faces)} faces")
                
                # Exporter
                with tempfile.NamedTemporaryFile(delete=False, suffix=f'.{output_format}') as tmp:
                    if output_format == 'glb':
                        mesh.export(tmp.name, file_type='glb')
                        media_type = 'model/gltf-binary'
                    elif output_format == 'gltf':
                        mesh.export(tmp.name, file_type='gltf')
                        media_type = 'model/gltf+json'
                    elif output_format == 'stl':
                        mesh.export(tmp.name, file_type='stl')
                        media_type = 'application/vnd.ms-pki.stl'
                    elif output_format == 'obj':
                        mesh.export(tmp.name, file_type='obj')
                        media_type = 'text/plain'
                    else:
                        mesh.export(tmp.name, file_type='glb')
                        media_type = 'model/gltf-binary'
                    
                    tmp_path = tmp.name
                
                print(f"✅ Modèle 3D généré: {tmp_path}")
                
                return FileResponse(
                    tmp_path,
                    media_type=media_type,
                    filename=f'terrain_3d.{output_format}',
                    headers={
                        "Access-Control-Allow-Origin": "*"
                    }
                )
                
    except Exception as e:
        print(f"❌ Erreur: {str(e)}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}

def get_terrain_color(normalized_height):
    """
    Retourne une couleur RGB basée sur l'altitude normalisée (0-1)
    Dégradé: vert foncé -> vert clair -> jaune -> marron -> gris -> blanc
    """
    if normalized_height < 0.3:
        # Vert foncé -> vert clair
        r = int(34 + normalized_height * 200)
        g = int(139 + normalized_height * 200)
        b = 34
    elif normalized_height < 0.6:
        # Vert -> jaune/marron
        r = int(139 + (normalized_height - 0.3) * 200)
        g = 139
        b = int(34 - (normalized_height - 0.3) * 100)
    elif normalized_height < 0.85:
        # Marron -> gris
        r = int(139 + (normalized_height - 0.6) * 200)
        g = int(90 + (normalized_height - 0.6) * 200)
        b = int(43 + (normalized_height - 0.6) * 200)
    else:
        # Gris -> blanc (neige)
        snow_factor = (normalized_height - 0.85) / 0.15
        r = int(180 + snow_factor * 75)
        g = int(180 + snow_factor * 75)
        b = int(180 + snow_factor * 75)
    
    return [r, g, b, 255]

def get_elevation_api(south, north, west, east):
    api_def = f"https://portal.opentopography.org/API/globaldem?demtype=SRTMGL3&south={south}&north={north}&west={west}&east={east}&outputFormat=GTiff&API_Key=107d15b72dbb2d345a43b89d76e732fc"
    return api_def