import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import Papa from 'papaparse';

const DEMVisualization = () => {
    const mapContainerRef = useRef(null);
    const threeDContainerRef = useRef(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [stats, setStats] = useState(null);
    const [demPoints, setDemPoints] = useState([]);
    const [h2Points, setH2Points] = useState([]);
    const [filesUploaded, setFilesUploaded] = useState({ dem: false, h2: false });
    const mapRef = useRef(null);
    const sceneRef = useRef(null);

    // Handle file uploads
    const handleDEMUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const lines = text.trim().split('\n');
                const points = [];

                for (let i = 1; i < lines.length; i++) {
                    const parts = lines[i].trim().split(/\s+/);
                    if (parts.length === 3) {
                        points.push({
                            x: parseFloat(parts[0]),
                            y: parseFloat(parts[1]),
                            z: parseFloat(parts[2])
                        });
                    }
                }

                setDemPoints(points);
                setFilesUploaded(prev => ({ ...prev, dem: true }));
            } catch (err) {
                setError('Error parsing DEM file: ' + err.message);
            }
        };
        reader.readAsText(file);
    };

    const handleH2Upload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        Papa.parse(file, {
            delimiter: ';',
            header: false,
            skipEmptyLines: true,
            complete: (results) => {
                try {
                    const points = [];
                    for (let i = 1; i < results.data.length; i++) {
                        const row = results.data[i];
                        if (row.length === 3) {
                            points.push({
                                lat: parseFloat(row[0]),
                                lon: parseFloat(row[1]),
                                h2: parseFloat(row[2])
                            });
                        }
                    }
                    setH2Points(points);
                    setFilesUploaded(prev => ({ ...prev, h2: true }));
                } catch (err) {
                    setError('Error parsing H2 file: ' + err.message);
                }
            },
            error: (err) => {
                setError('Error reading H2 file: ' + err.message);
            }
        });
    };

    // Helper function to get color based on H2 concentration
    const getH2Color = (h2Value) => {
        const maxH2 = 27.74;
        const h2Norm = Math.min(Math.log(h2Value + 1) / Math.log(maxH2 + 1), 1);

        if (h2Norm < 0.33) {
            return '#004d99';
        } else if (h2Norm < 0.66) {
            return '#ffff00';
        } else {
            return '#ff0000';
        }
    };

    // Initialize Leaflet Map
    useEffect(() => {
        if (!mapContainerRef.current || !filesUploaded.h2 || h2Points.length === 0 || mapRef.current) return;

        const loadLeaflet = async () => {
            if (!window.L) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
                document.head.appendChild(link);

                const script = document.createElement('script');
                script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

                await new Promise((resolve) => {
                    script.onload = resolve;
                    document.head.appendChild(script);
                });
            }

            const L = window.L;

            const map = L.map(mapContainerRef.current).setView([38.5, -112.9], 10);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(map);

            mapRef.current = map;

            h2Points.forEach(point => {
                const color = getH2Color(point.h2);
                const marker = L.circleMarker([point.lat, point.lon], {
                    radius: 6,
                    fillColor: color,
                    color: '#fff',
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                }).addTo(map);

                marker.bindPopup(`H2: ${point.h2.toFixed(3)} ppm<br>Lat: ${point.lat.toFixed(4)}<br>Lon: ${point.lon.toFixed(4)}`);
            });

            const bounds = L.latLngBounds(h2Points.map(p => [p.lat, p.lon]));
            map.fitBounds(bounds, { padding: [50, 50] });
        };

        loadLeaflet();

        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, [h2Points, filesUploaded.h2]);

    // Initialize Three.js 3D Visualization
    useEffect(() => {
        if (!filesUploaded.dem || !filesUploaded.h2 || demPoints.length === 0 || h2Points.length === 0 || !threeDContainerRef.current) return;

        setLoading(true);
        let scene, camera, renderer, mesh, points;
        let isDragging = false;
        let previousMousePosition = { x: 0, y: 0 };
        let rotationSpeed = { x: 0, y: 0 };

        const init = async () => {
            try {
                // Convert lat/lon to approximate UTM
                const latToY = (lat) => (lat - 38.4) * 111000;
                const lonToX = (lon) => (lon + 112.9) * 111000 * Math.cos(38.5 * Math.PI / 180);

                const h2PointsWithXY = h2Points.map(p => ({
                    ...p,
                    x: lonToX(p.lon),
                    y: latToY(p.lat)
                }));

                // Find extents
                const xVals = demPoints.map(p => p.x);
                const yVals = demPoints.map(p => p.y);
                const zVals = demPoints.map(p => p.z);

                const minX = Math.min(...xVals);
                const maxX = Math.max(...xVals);
                const minY = Math.min(...yVals);
                const maxY = Math.max(...yVals);
                const minZ = Math.min(...zVals);
                const maxZ = Math.max(...zVals);

                // Determine grid structure
                const uniqueX = [...new Set(xVals)].sort((a, b) => a - b);
                const uniqueY = [...new Set(yVals)].sort((a, b) => a - b);
                const gridWidth = uniqueX.length;
                const gridHeight = uniqueY.length;

                // Create grid map
                const gridMap = new Map();
                demPoints.forEach(p => {
                    const key = `${p.x.toFixed(2)}_${p.y.toFixed(2)}`;
                    gridMap.set(key, p.z);
                });

                setStats({
                    demPoints: demPoints.length,
                    h2Points: h2Points.length,
                    gridSize: `${gridWidth} x ${gridHeight}`,
                    elevationRange: `${minZ.toFixed(2)} - ${maxZ.toFixed(2)}m`,
                    h2Range: `${Math.min(...h2Points.map(p => p.h2)).toFixed(3)} - ${Math.max(...h2Points.map(p => p.h2)).toFixed(2)} ppm`
                });

                // Setup Three.js
                scene = new THREE.Scene();
                scene.background = new THREE.Color(0x1a1a2e);
                sceneRef.current = { scene, camera, renderer, mesh, points };

                camera = new THREE.PerspectiveCamera(
                    60,
                    threeDContainerRef.current.clientWidth / threeDContainerRef.current.clientHeight,
                    1,
                    100000
                );

                const centerX = (minX + maxX) / 2;
                const centerY = (minY + maxY) / 2;
                const centerZ = (minZ + maxZ) / 2;
                const scale = 0.05;

                // Create geometry
                const geometry = new THREE.BufferGeometry();
                const vertices = [];
                const colors = [];
                const indices = [];

                const vertexGrid = [];
                for (let j = 0; j < gridHeight; j++) {
                    vertexGrid[j] = [];
                    for (let i = 0; i < gridWidth; i++) {
                        const x = uniqueX[i];
                        const y = uniqueY[j];
                        const key = `${x.toFixed(2)}_${y.toFixed(2)}`;
                        const z = gridMap.get(key) || centerZ;

                        const nx = (x - centerX) * scale;
                        const ny = (y - centerY) * scale;
                        const nz = (z - centerZ) * scale * 2;

                        vertices.push(nx, ny, nz);
                        vertexGrid[j][i] = vertices.length / 3 - 1;

                        // Find nearest H2
                        let minDist = Infinity;
                        let nearestH2 = 0;

                        h2PointsWithXY.forEach(h2p => {
                            const dist = Math.sqrt((h2p.x - x) ** 2 + (h2p.y - y) ** 2);
                            if (dist < minDist) {
                                minDist = dist;
                                nearestH2 = h2p.h2;
                            }
                        });

                        const maxH2 = 27.74;
                        const h2Norm = Math.min(Math.log(nearestH2 + 1) / Math.log(maxH2 + 1), 1);

                        const color = new THREE.Color();
                        if (h2Norm < 0.33) {
                            color.setRGB(0, 0.3 + h2Norm * 2, 0.8);
                        } else if (h2Norm < 0.66) {
                            const t = (h2Norm - 0.33) / 0.33;
                            color.setRGB(t * 0.9, 0.9, 0.8 - t * 0.8);
                        } else {
                            const t = (h2Norm - 0.66) / 0.34;
                            color.setRGB(0.9 + t * 0.1, 0.9 - t * 0.9, 0);
                        }

                        colors.push(color.r, color.g, color.b);
                    }
                }

                // Create faces
                for (let j = 0; j < gridHeight - 1; j++) {
                    for (let i = 0; i < gridWidth - 1; i++) {
                        const a = vertexGrid[j][i];
                        const b = vertexGrid[j][i + 1];
                        const c = vertexGrid[j + 1][i + 1];
                        const d = vertexGrid[j + 1][i];

                        indices.push(a, b, c);
                        indices.push(a, c, d);
                    }
                }

                geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
                geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
                geometry.setIndex(indices);
                geometry.computeVertexNormals();

                const material = new THREE.MeshStandardMaterial({
                    vertexColors: true,
                    flatShading: false,
                    metalness: 0.3,
                    roughness: 0.7
                });

                mesh = new THREE.Mesh(geometry, material);
                scene.add(mesh);

                // Add H2 points
                const pointsGeometry = new THREE.BufferGeometry();
                const pointsPositions = [];
                const pointsColors = [];

                h2PointsWithXY.forEach(p => {
                    const x = (p.x - centerX) * scale;
                    const y = (p.y - centerY) * scale;

                    let z = centerZ;
                    for (const [k, v] of gridMap.entries()) {
                        const [kx, ky] = k.split('_').map(Number);
                        const dist = Math.sqrt((kx - p.x) ** 2 + (ky - p.y) ** 2);
                        if (dist < 50) {
                            z = v;
                            break;
                        }
                    }
                    const nz = (z - centerZ) * scale * 2 + 0.5;

                    pointsPositions.push(x, y, nz);

                    const h2Norm = Math.min(Math.log(p.h2 + 1) / Math.log(27.74 + 1), 1);
                    const color = new THREE.Color();
                    color.setHSL(0.6 - h2Norm * 0.6, 1, 0.5);
                    pointsColors.push(color.r, color.g, color.b);
                });

                pointsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pointsPositions, 3));
                pointsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(pointsColors, 3));

                const pointsMaterial = new THREE.PointsMaterial({
                    size: 1.5,
                    vertexColors: true,
                    sizeAttenuation: true
                });

                points = new THREE.Points(pointsGeometry, pointsMaterial);
                scene.add(points);

                // Lighting
                const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
                scene.add(ambientLight);

                const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
                directionalLight1.position.set(1, 1, 1);
                scene.add(directionalLight1);

                const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
                directionalLight2.position.set(-1, -1, -0.5);
                scene.add(directionalLight2);

                camera.position.set(50, 50, 80);
                camera.lookAt(0, 0, 0);

                renderer = new THREE.WebGLRenderer({ antialias: true });
                renderer.setSize(threeDContainerRef.current.clientWidth, threeDContainerRef.current.clientHeight);
                renderer.setPixelRatio(window.devicePixelRatio);
                threeDContainerRef.current.appendChild(renderer.domElement);

                // Mouse controls
                const onMouseDown = (e) => {
                    isDragging = true;
                    previousMousePosition = { x: e.clientX, y: e.clientY };
                };

                const onMouseMove = (e) => {
                    if (isDragging) {
                        const deltaX = e.clientX - previousMousePosition.x;
                        const deltaY = e.clientY - previousMousePosition.y;

                        rotationSpeed.y = deltaX * 0.005;
                        rotationSpeed.x = deltaY * 0.005;

                        mesh.rotation.y += rotationSpeed.y;
                        mesh.rotation.x += rotationSpeed.x;
                        points.rotation.y += rotationSpeed.y;
                        points.rotation.x += rotationSpeed.x;

                        previousMousePosition = { x: e.clientX, y: e.clientY };
                    }
                };

                const onMouseUp = () => {
                    isDragging = false;
                };

                const onWheel = (e) => {
                    e.preventDefault();
                    camera.position.z += e.deltaY * 0.05;
                    camera.position.z = Math.max(20, Math.min(200, camera.position.z));
                };

                renderer.domElement.addEventListener('mousedown', onMouseDown);
                renderer.domElement.addEventListener('mousemove', onMouseMove);
                renderer.domElement.addEventListener('mouseup', onMouseUp);
                renderer.domElement.addEventListener('wheel', onWheel);

                // Animation
                const animate = () => {
                    requestAnimationFrame(animate);

                    if (!isDragging) {
                        rotationSpeed.x *= 0.95;
                        rotationSpeed.y *= 0.95;
                        mesh.rotation.y += rotationSpeed.y;
                        mesh.rotation.x += rotationSpeed.x;
                        points.rotation.y += rotationSpeed.y;
                        points.rotation.x += rotationSpeed.x;
                    }

                    renderer.render(scene, camera);
                };

                animate();
                setLoading(false);

                return () => {
                    renderer.domElement.removeEventListener('mousedown', onMouseDown);
                    renderer.domElement.removeEventListener('mousemove', onMouseMove);
                    renderer.domElement.removeEventListener('mouseup', onMouseUp);
                    renderer.domElement.removeEventListener('wheel', onWheel);
                    if (threeDContainerRef.current && renderer.domElement) {
                        threeDContainerRef.current.removeChild(renderer.domElement);
                    }
                    renderer.dispose();
                };
            } catch (err) {
                setError(err.message);
                setLoading(false);
            }
        };

        init();
    }, [demPoints, h2Points, filesUploaded]);

    return (
        <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', background: '#0f0f1e' }}>
            {/* Header */}
            <div style={{ padding: '15px 20px', background: '#1a1a2e', color: '#fff', fontFamily: 'monospace' }}>
                <h2 style={{ margin: '0 0 15px 0', fontSize: '20px' }}>DEM Surface with H2 Concentration</h2>

                {/* File Upload Section */}
                {(!filesUploaded.dem || !filesUploaded.h2) && (
                    <div style={{ marginBottom: '15px', padding: '15px', background: '#2d2d44', borderRadius: '5px' }}>
                        <div style={{ marginBottom: '10px', fontWeight: 'bold' }}>Upload Data Files:</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>
                                    DEM File (POCland_surface_vertices.csv):
                                </label>
                                <input
                                    type="file"
                                    accept=".csv"
                                    onChange={handleDEMUpload}
                                    style={{ fontSize: '11px' }}
                                />
                                {filesUploaded.dem && <span style={{ color: '#4CAF50', marginLeft: '10px' }}>✓</span>}
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>
                                    H2 File (h2_frantz.csv):
                                </label>
                                <input
                                    type="file"
                                    accept=".csv"
                                    onChange={handleH2Upload}
                                    style={{ fontSize: '11px' }}
                                />
                                {filesUploaded.h2 && <span style={{ color: '#4CAF50', marginLeft: '10px' }}>✓</span>}
                            </div>
                        </div>
                    </div>
                )}

                {loading && <p style={{ margin: '5px 0', fontSize: '12px' }}>Building visualization...</p>}
                {error && <p style={{ color: '#ff6b6b', margin: '5px 0' }}>Error: {error}</p>}

                {stats && (
                    <div style={{ fontSize: '11px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                        <div><strong>DEM Points:</strong> {stats.demPoints.toLocaleString()}</div>
                        <div><strong>H2 Measurements:</strong> {stats.h2Points}</div>
                        <div><strong>Grid Size:</strong> {stats.gridSize}</div>
                        <div><strong>Elevation Range:</strong> {stats.elevationRange}</div>
                        <div><strong>H2 Range:</strong> {stats.h2Range}</div>
                    </div>
                )}
            </div>

            {/* Map View */}
            {filesUploaded.h2 && h2Points.length > 0 && (
                <div style={{ height: '40vh', position: 'relative', borderBottom: '2px solid #2d2d44' }}>
                    <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
                    <div style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        background: 'rgba(26, 26, 46, 0.9)',
                        padding: '10px',
                        borderRadius: '5px',
                        color: '#fff',
                        fontSize: '11px',
                        fontFamily: 'monospace'
                    }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>Map View</div>
                        <div>H2 measurement locations</div>
                    </div>
                </div>
            )}

            {/* 3D View */}
            {filesUploaded.dem && filesUploaded.h2 && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '10px 20px', background: '#1a1a2e', color: '#fff', fontFamily: 'monospace', fontSize: '11px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <strong>3D Terrain View</strong> • Drag to rotate • Scroll to zoom
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span>H2 Concentration:</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ fontSize: '10px' }}>Low</span>
                                    <div style={{
                                        width: '150px',
                                        height: '12px',
                                        background: 'linear-gradient(to right, #004d99, #00ccff, #ffff00, #ff6600, #ff0000)',
                                        border: '1px solid #444',
                                        borderRadius: '3px'
                                    }} />
                                    <span style={{ fontSize: '10px' }}>High</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div ref={threeDContainerRef} style={{ flex: 1, position: 'relative' }} />
                </div>
            )}
        </div>
    );
};

export default DEMVisualization;

// import React, { useEffect, useRef, useState } from 'react';
// import * as THREE from 'three';
// //import DEM from './POC-land_surface_vertices.csv';

// const DEMVisualization = () => {
//     const mapContainerRef = useRef(null);
//     const threeDContainerRef = useRef(null);
//     const [loading, setLoading] = useState(true);
//     const [error, setError] = useState(null);
//     const [stats, setStats] = useState(null);
//     const [demPoints, setDemPoints] = useState([]);
//     const [h2Points, setH2Points] = useState([]);
//     const mapRef = useRef(null);

//     // Initialize Leaflet Map
//     useEffect(() => {
//         if (!mapContainerRef.current || mapRef.current) return;

//         // Load Leaflet CSS and JS
//         const loadLeaflet = async () => {
//             if (!window.L) {
//                 const link = document.createElement('link');
//                 link.rel = 'stylesheet';
//                 link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
//                 document.head.appendChild(link);

//                 const script = document.createElement('script');
//                 script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

//                 await new Promise((resolve) => {
//                     script.onload = resolve;
//                     document.head.appendChild(script);
//                 });
//             }

//             const L = window.L;

//             // Create map centered around the data area
//             const map = L.map(mapContainerRef.current).setView([38.5, -112.9], 10);

//             L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
//                 attribution: '© OpenStreetMap contributors',
//                 maxZoom: 19
//             }).addTo(map);

//             mapRef.current = map;

//             // Add markers for H2 points when data is loaded
//             if (h2Points.length > 0) {
//                 h2Points.forEach(point => {
//                     const color = getH2Color(point.h2);
//                     const marker = L.circleMarker([point.lat, point.lon], {
//                         radius: 6,
//                         fillColor: color,
//                         color: '#fff',
//                         weight: 1,
//                         opacity: 1,
//                         fillOpacity: 0.8
//                     }).addTo(map);

//                     marker.bindPopup(`H2: ${point.h2.toFixed(3)} ppm<br>Lat: ${point.lat.toFixed(4)}<br>Lon: ${point.lon.toFixed(4)}`);
//                 });

//                 // Fit map to show all points
//                 const bounds = L.latLngBounds(h2Points.map(p => [p.lat, p.lon]));
//                 map.fitBounds(bounds, { padding: [50, 50] });
//             }
//         };

//         loadLeaflet();

//         return () => {
//             if (mapRef.current) {
//                 mapRef.current.remove();
//                 mapRef.current = null;
//             }
//         };
//     }, [h2Points]);

//     // Helper function to get color based on H2 concentration
//     const getH2Color = (h2Value) => {
//         const maxH2 = 27.74;
//         const h2Norm = Math.min(Math.log(h2Value + 1) / Math.log(maxH2 + 1), 1);

//         if (h2Norm < 0.33) {
//             return '#004d99';
//         } else if (h2Norm < 0.66) {
//             return '#ffff00';
//         } else {
//             return '#ff0000';
//         }
//     };

//     // Initialize Three.js 3D Visualization
//     useEffect(() => {
//         let scene, camera, renderer, mesh, points;
//         let isDragging = false;
//         let previousMousePosition = { x: 0, y: 0 };
//         let rotationSpeed = { x: 0, y: 0 };

//         const init = async () => {
//             try {
//                 // Read and parse the DEM data
//                 const demData = await window.fs.readFile('POCland_surface_vertices.csv', { encoding: 'utf8' });
//                 const demLines = demData.trim().split('\n');
//                 const demPointsData = [];

//                 for (let i = 1; i < demLines.length; i++) {
//                     const parts = demLines[i].trim().split(/\s+/);
//                     if (parts.length === 3) {
//                         demPointsData.push({
//                             x: parseFloat(parts[0]),
//                             y: parseFloat(parts[1]),
//                             z: parseFloat(parts[2])
//                         });
//                     }
//                 }

//                 // Read and parse H2 data
//                 const h2Data = await window.fs.readFile('h2_frantz.csv', { encoding: 'utf8' });
//                 const h2Lines = h2Data.trim().split('\n');
//                 const h2PointsData = [];

//                 for (let i = 1; i < h2Lines.length; i++) {
//                     const parts = h2Lines[i].trim().split(';');
//                     if (parts.length === 3) {
//                         h2PointsData.push({
//                             lat: parseFloat(parts[0]),
//                             lon: parseFloat(parts[1]),
//                             h2: parseFloat(parts[2])
//                         });
//                     }
//                 }

//                 // Convert lat/lon to approximate UTM (simplified conversion)
//                 const latToY = (lat) => (lat - 38.4) * 111000;
//                 const lonToX = (lon) => (lon + 112.9) * 111000 * Math.cos(38.5 * Math.PI / 180);

//                 h2PointsData.forEach(p => {
//                     p.x = lonToX(p.lon);
//                     p.y = latToY(p.lat);
//                 });

//                 setDemPoints(demPointsData);
//                 setH2Points(h2PointsData);

//                 // Find extents and create grid
//                 const xVals = demPointsData.map(p => p.x);
//                 const yVals = demPointsData.map(p => p.y);
//                 const zVals = demPointsData.map(p => p.z);

//                 const minX = Math.min(...xVals);
//                 const maxX = Math.max(...xVals);
//                 const minY = Math.min(...yVals);
//                 const maxY = Math.max(...yVals);
//                 const minZ = Math.min(...zVals);
//                 const maxZ = Math.max(...zVals);

//                 // Determine grid structure
//                 const uniqueX = [...new Set(xVals)].sort((a, b) => a - b);
//                 const uniqueY = [...new Set(yVals)].sort((a, b) => a - b);
//                 const gridWidth = uniqueX.length;
//                 const gridHeight = uniqueY.length;

//                 // Create grid map for quick lookup
//                 const gridMap = new Map();
//                 demPointsData.forEach(p => {
//                     const key = `${p.x.toFixed(2)}_${p.y.toFixed(2)}`;
//                     gridMap.set(key, p.z);
//                 });

//                 setStats({
//                     demPoints: demPointsData.length,
//                     h2Points: h2PointsData.length,
//                     gridSize: `${gridWidth} x ${gridHeight}`,
//                     elevationRange: `${minZ.toFixed(2)} - ${maxZ.toFixed(2)}m`,
//                     h2Range: `${Math.min(...h2PointsData.map(p => p.h2)).toFixed(3)} - ${Math.max(...h2PointsData.map(p => p.h2)).toFixed(2)} ppm`
//                 });

//                 // Setup Three.js scene
//                 scene = new THREE.Scene();
//                 scene.background = new THREE.Color(0x1a1a2e);

//                 camera = new THREE.PerspectiveCamera(
//                     60,
//                     threeDContainerRef.current.clientWidth / threeDContainerRef.current.clientHeight,
//                     1,
//                     100000
//                 );

//                 // Normalize coordinates for visualization
//                 const centerX = (minX + maxX) / 2;
//                 const centerY = (minY + maxY) / 2;
//                 const centerZ = (minZ + maxZ) / 2;
//                 const scale = 0.05;

//                 // Create geometry
//                 const geometry = new THREE.BufferGeometry();
//                 const vertices = [];
//                 const colors = [];
//                 const indices = [];

//                 // Build vertex grid
//                 const vertexGrid = [];
//                 for (let j = 0; j < gridHeight; j++) {
//                     vertexGrid[j] = [];
//                     for (let i = 0; i < gridWidth; i++) {
//                         const x = uniqueX[i];
//                         const y = uniqueY[j];
//                         const key = `${x.toFixed(2)}_${y.toFixed(2)}`;
//                         const z = gridMap.get(key) || centerZ;

//                         // Normalize positions
//                         const nx = (x - centerX) * scale;
//                         const ny = (y - centerY) * scale;
//                         const nz = (z - centerZ) * scale * 2;

//                         vertices.push(nx, ny, nz);
//                         vertexGrid[j][i] = vertices.length / 3 - 1;

//                         // Find nearest H2 measurement for color
//                         let minDist = Infinity;
//                         let nearestH2 = 0;

//                         h2PointsData.forEach(h2p => {
//                             const dist = Math.sqrt((h2p.x - x) ** 2 + (h2p.y - y) ** 2);
//                             if (dist < minDist) {
//                                 minDist = dist;
//                                 nearestH2 = h2p.h2;
//                             }
//                         });

//                         // Color based on H2 concentration (log scale for better visualization)
//                         const maxH2 = 27.74;
//                         const h2Norm = Math.min(Math.log(nearestH2 + 1) / Math.log(maxH2 + 1), 1);

//                         const color = new THREE.Color();
//                         if (h2Norm < 0.33) {
//                             color.setRGB(0, 0.3 + h2Norm * 2, 0.8);
//                         } else if (h2Norm < 0.66) {
//                             const t = (h2Norm - 0.33) / 0.33;
//                             color.setRGB(t * 0.9, 0.9, 0.8 - t * 0.8);
//                         } else {
//                             const t = (h2Norm - 0.66) / 0.34;
//                             color.setRGB(0.9 + t * 0.1, 0.9 - t * 0.9, 0);
//                         }

//                         colors.push(color.r, color.g, color.b);
//                     }
//                 }

//                 // Create faces
//                 for (let j = 0; j < gridHeight - 1; j++) {
//                     for (let i = 0; i < gridWidth - 1; i++) {
//                         const a = vertexGrid[j][i];
//                         const b = vertexGrid[j][i + 1];
//                         const c = vertexGrid[j + 1][i + 1];
//                         const d = vertexGrid[j + 1][i];

//                         indices.push(a, b, c);
//                         indices.push(a, c, d);
//                     }
//                 }

//                 geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
//                 geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
//                 geometry.setIndex(indices);
//                 geometry.computeVertexNormals();

//                 const material = new THREE.MeshStandardMaterial({
//                     vertexColors: true,
//                     flatShading: false,
//                     metalness: 0.3,
//                     roughness: 0.7
//                 });

//                 mesh = new THREE.Mesh(geometry, material);
//                 scene.add(mesh);

//                 // Add H2 measurement points
//                 const pointsGeometry = new THREE.BufferGeometry();
//                 const pointsPositions = [];
//                 const pointsColors = [];

//                 h2PointsData.forEach(p => {
//                     const x = (lonToX(p.lon) - centerX) * scale;
//                     const y = (latToY(p.lat) - centerY) * scale;

//                     const key = `${lonToX(p.lon).toFixed(2)}_${latToY(p.lat).toFixed(2)}`;
//                     let z = centerZ;
//                     for (const [k, v] of gridMap.entries()) {
//                         const [kx, ky] = k.split('_').map(Number);
//                         const dist = Math.sqrt((kx - lonToX(p.lon)) ** 2 + (ky - latToY(p.lat)) ** 2);
//                         if (dist < 50) {
//                             z = v;
//                             break;
//                         }
//                     }
//                     const nz = (z - centerZ) * scale * 2 + 0.5;

//                     pointsPositions.push(x, y, nz);

//                     const h2Norm = Math.min(Math.log(p.h2 + 1) / Math.log(27.74 + 1), 1);
//                     const color = new THREE.Color();
//                     color.setHSL(0.6 - h2Norm * 0.6, 1, 0.5);
//                     pointsColors.push(color.r, color.g, color.b);
//                 });

//                 pointsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pointsPositions, 3));
//                 pointsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(pointsColors, 3));

//                 const pointsMaterial = new THREE.PointsMaterial({
//                     size: 1.5,
//                     vertexColors: true,
//                     sizeAttenuation: true
//                 });

//                 points = new THREE.Points(pointsGeometry, pointsMaterial);
//                 scene.add(points);

//                 // Lighting
//                 const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
//                 scene.add(ambientLight);

//                 const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
//                 directionalLight1.position.set(1, 1, 1);
//                 scene.add(directionalLight1);

//                 const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
//                 directionalLight2.position.set(-1, -1, -0.5);
//                 scene.add(directionalLight2);

//                 // Position camera
//                 camera.position.set(50, 50, 80);
//                 camera.lookAt(0, 0, 0);

//                 // Renderer
//                 renderer = new THREE.WebGLRenderer({ antialias: true });
//                 renderer.setSize(threeDContainerRef.current.clientWidth, threeDContainerRef.current.clientHeight);
//                 renderer.setPixelRatio(window.devicePixelRatio);
//                 threeDContainerRef.current.appendChild(renderer.domElement);

//                 // Mouse controls
//                 const onMouseDown = (e) => {
//                     isDragging = true;
//                     previousMousePosition = { x: e.clientX, y: e.clientY };
//                 };

//                 const onMouseMove = (e) => {
//                     if (isDragging) {
//                         const deltaX = e.clientX - previousMousePosition.x;
//                         const deltaY = e.clientY - previousMousePosition.y;

//                         rotationSpeed.y = deltaX * 0.005;
//                         rotationSpeed.x = deltaY * 0.005;

//                         mesh.rotation.y += rotationSpeed.y;
//                         mesh.rotation.x += rotationSpeed.x;
//                         points.rotation.y += rotationSpeed.y;
//                         points.rotation.x += rotationSpeed.x;

//                         previousMousePosition = { x: e.clientX, y: e.clientY };
//                     }
//                 };

//                 const onMouseUp = () => {
//                     isDragging = false;
//                 };

//                 const onWheel = (e) => {
//                     e.preventDefault();
//                     camera.position.z += e.deltaY * 0.05;
//                     camera.position.z = Math.max(20, Math.min(200, camera.position.z));
//                 };

//                 renderer.domElement.addEventListener('mousedown', onMouseDown);
//                 renderer.domElement.addEventListener('mousemove', onMouseMove);
//                 renderer.domElement.addEventListener('mouseup', onMouseUp);
//                 renderer.domElement.addEventListener('wheel', onWheel);

//                 // Animation loop
//                 const animate = () => {
//                     requestAnimationFrame(animate);

//                     if (!isDragging) {
//                         rotationSpeed.x *= 0.95;
//                         rotationSpeed.y *= 0.95;
//                         mesh.rotation.y += rotationSpeed.y;
//                         mesh.rotation.x += rotationSpeed.x;
//                         points.rotation.y += rotationSpeed.y;
//                         points.rotation.x += rotationSpeed.x;
//                     }

//                     renderer.render(scene, camera);
//                 };

//                 animate();
//                 setLoading(false);

//                 // Cleanup
//                 return () => {
//                     renderer.domElement.removeEventListener('mousedown', onMouseDown);
//                     renderer.domElement.removeEventListener('mousemove', onMouseMove);
//                     renderer.domElement.removeEventListener('mouseup', onMouseUp);
//                     renderer.domElement.removeEventListener('wheel', onWheel);
//                     if (threeDContainerRef.current && renderer.domElement) {
//                         threeDContainerRef.current.removeChild(renderer.domElement);
//                     }
//                     renderer.dispose();
//                 };
//             } catch (err) {
//                 setError(err.message);
//                 setLoading(false);
//             }
//         };

//         init();
//     }, []);

//     return (
//         <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', background: '#0f0f1e' }}>
//             {/* Header */}
//             <div style={{ padding: '15px 20px', background: '#1a1a2e', color: '#fff', fontFamily: 'monospace' }}>
//                 <h2 style={{ margin: '0 0 10px 0', fontSize: '20px' }}>DEM Surface with H2 Concentration</h2>
//                 {loading && <p style={{ margin: '5px 0', fontSize: '12px' }}>Loading data and building visualization...</p>}
//                 {error && <p style={{ color: '#ff6b6b', margin: '5px 0' }}>Error: {error}</p>}
//                 {stats && (
//                     <div style={{ fontSize: '11px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
//                         <div><strong>DEM Points:</strong> {stats.demPoints.toLocaleString()}</div>
//                         <div><strong>H2 Measurements:</strong> {stats.h2Points}</div>
//                         <div><strong>Grid Size:</strong> {stats.gridSize}</div>
//                         <div><strong>Elevation Range:</strong> {stats.elevationRange}</div>
//                         <div><strong>H2 Range:</strong> {stats.h2Range}</div>
//                     </div>
//                 )}
//             </div>

//             {/* Map View */}
//             <div style={{ height: '40vh', position: 'relative', borderBottom: '2px solid #2d2d44' }}>
//                 <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
//                 <div style={{
//                     position: 'absolute',
//                     top: '10px',
//                     right: '10px',
//                     background: 'rgba(26, 26, 46, 0.9)',
//                     padding: '10px',
//                     borderRadius: '5px',
//                     color: '#fff',
//                     fontSize: '11px',
//                     fontFamily: 'monospace'
//                 }}>
//                     <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>Map View</div>
//                     <div>H2 measurement locations</div>
//                 </div>
//             </div>

//             {/* 3D View */}
//             <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
//                 <div style={{ padding: '10px 20px', background: '#1a1a2e', color: '#fff', fontFamily: 'monospace', fontSize: '11px' }}>
//                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                         <div>
//                             <strong>3D Terrain View</strong> • Drag to rotate • Scroll to zoom
//                         </div>
//                         <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
//                             <span>H2 Concentration:</span>
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
//                                 <span style={{ fontSize: '10px' }}>Low</span>
//                                 <div style={{
//                                     width: '150px',
//                                     height: '12px',
//                                     background: 'linear-gradient(to right, #004d99, #00ccff, #ffff00, #ff6600, #ff0000)',
//                                     border: '1px solid #444',
//                                     borderRadius: '3px'
//                                 }} />
//                                 <span style={{ fontSize: '10px' }}>High</span>
//                             </div>
//                         </div>
//                     </div>
//                 </div>
//                 <div ref={threeDContainerRef} style={{ flex: 1, position: 'relative' }} />
//             </div>
//         </div>
//     );
// };

// export default DEMVisualization;