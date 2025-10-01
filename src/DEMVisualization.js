import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const DEMVisualization = () => {
    const containerRef = useRef(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [stats, setStats] = useState(null);

    useEffect(() => {
        let scene, camera, renderer, mesh;
        let isDragging = false;
        let previousMousePosition = { x: 0, y: 0 };
        let rotationSpeed = { x: 0, y: 0 };

        const init = async () => {
            try {
                // Read and parse the DEM data
                const demData = await window.fs.readFile('POCland_surface_vertices.csv', { encoding: 'utf8' });
                const demLines = demData.trim().split('\n');
                const demPoints = [];

                for (let i = 1; i < demLines.length; i++) {
                    const parts = demLines[i].trim().split(/\s+/);
                    if (parts.length === 3) {
                        demPoints.push({
                            x: parseFloat(parts[0]),
                            y: parseFloat(parts[1]),
                            z: parseFloat(parts[2])
                        });
                    }
                }

                // Read and parse H2 data
                const h2Data = await window.fs.readFile('h2_frantz.csv', { encoding: 'utf8' });
                const h2Lines = h2Data.trim().split('\n');
                const h2Points = [];

                for (let i = 1; i < h2Lines.length; i++) {
                    const parts = h2Lines[i].trim().split(';');
                    if (parts.length === 3) {
                        h2Points.push({
                            lat: parseFloat(parts[0]),
                            lon: parseFloat(parts[1]),
                            h2: parseFloat(parts[2])
                        });
                    }
                }

                // Convert lat/lon to approximate UTM (simplified conversion)
                const latToY = (lat) => (lat - 38.4) * 111000;
                const lonToX = (lon) => (lon + 112.9) * 111000 * Math.cos(38.5 * Math.PI / 180);

                h2Points.forEach(p => {
                    p.x = lonToX(p.lon);
                    p.y = latToY(p.lat);
                });

                // Find extents and create grid
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

                // Create grid map for quick lookup
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

                // Setup Three.js scene
                scene = new THREE.Scene();
                scene.background = new THREE.Color(0x1a1a2e);

                camera = new THREE.PerspectiveCamera(
                    60,
                    containerRef.current.clientWidth / containerRef.current.clientHeight,
                    1,
                    100000
                );

                // Normalize coordinates for visualization
                const centerX = (minX + maxX) / 2;
                const centerY = (minY + maxY) / 2;
                const centerZ = (minZ + maxZ) / 2;
                const scale = 0.05;

                // Create geometry
                const geometry = new THREE.BufferGeometry();
                const vertices = [];
                const colors = [];
                const indices = [];

                // Build vertex grid
                const vertexGrid = [];
                for (let j = 0; j < gridHeight; j++) {
                    vertexGrid[j] = [];
                    for (let i = 0; i < gridWidth; i++) {
                        const x = uniqueX[i];
                        const y = uniqueY[j];
                        const key = `${x.toFixed(2)}_${y.toFixed(2)}`;
                        const z = gridMap.get(key) || centerZ;

                        // Normalize positions
                        const nx = (x - centerX) * scale;
                        const ny = (y - centerY) * scale;
                        const nz = (z - centerZ) * scale * 2;

                        vertices.push(nx, ny, nz);
                        vertexGrid[j][i] = vertices.length / 3 - 1;

                        // Find nearest H2 measurement for color
                        let minDist = Infinity;
                        let nearestH2 = 0;

                        h2Points.forEach(h2p => {
                            const dist = Math.sqrt((h2p.x - x) ** 2 + (h2p.y - y) ** 2);
                            if (dist < minDist) {
                                minDist = dist;
                                nearestH2 = h2p.h2;
                            }
                        });

                        // Color based on H2 concentration (log scale for better visualization)
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

                // Add H2 measurement points
                const pointsGeometry = new THREE.BufferGeometry();
                const pointsPositions = [];
                const pointsColors = [];

                h2Points.forEach(p => {
                    const x = (lonToX(p.lon) - centerX) * scale;
                    const y = (latToY(p.lat) - centerY) * scale;

                    const key = `${lonToX(p.lon).toFixed(2)}_${latToY(p.lat).toFixed(2)}`;
                    let z = centerZ;
                    for (const [k, v] of gridMap.entries()) {
                        const [kx, ky] = k.split('_').map(Number);
                        const dist = Math.sqrt((kx - lonToX(p.lon)) ** 2 + (ky - latToY(p.lat)) ** 2);
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

                const points = new THREE.Points(pointsGeometry, pointsMaterial);
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

                // Position camera
                camera.position.set(50, 50, 80);
                camera.lookAt(0, 0, 0);

                // Renderer
                renderer = new THREE.WebGLRenderer({ antialias: true });
                renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
                renderer.setPixelRatio(window.devicePixelRatio);
                containerRef.current.appendChild(renderer.domElement);

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

                // Animation loop
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

                // Cleanup
                return () => {
                    renderer.domElement.removeEventListener('mousedown', onMouseDown);
                    renderer.domElement.removeEventListener('mousemove', onMouseMove);
                    renderer.domElement.removeEventListener('mouseup', onMouseUp);
                    renderer.domElement.removeEventListener('wheel', onWheel);
                    if (containerRef.current && renderer.domElement) {
                        containerRef.current.removeChild(renderer.domElement);
                    }
                    renderer.dispose();
                };
            } catch (err) {
                setError(err.message);
                setLoading(false);
            }
        };

        init();
    }, []);

    return (
        <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', background: '#0f0f1e' }}>
            <div style={{ padding: '20px', background: '#1a1a2e', color: '#fff', fontFamily: 'monospace' }}>
                <h2 style={{ margin: '0 0 10px 0' }}>DEM Surface with H2 Concentration Map</h2>
                {loading && <p>Loading data and building visualization...</p>}
                {error && <p style={{ color: '#ff6b6b' }}>Error: {error}</p>}
                {stats && (
                    <div style={{ fontSize: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div><strong>DEM Points:</strong> {stats.demPoints.toLocaleString()}</div>
                        <div><strong>H2 Measurements:</strong> {stats.h2Points}</div>
                        <div><strong>Grid Size:</strong> {stats.gridSize}</div>
                        <div><strong>Elevation Range:</strong> {stats.elevationRange}</div>
                        <div style={{ gridColumn: '1 / -1' }}><strong>H2 Range:</strong> {stats.h2Range}</div>
                    </div>
                )}
                <div style={{ marginTop: '10px', fontSize: '11px', color: '#aaa' }}>
                    <strong>Controls:</strong> Drag to rotate • Scroll to zoom
                </div>
                <div style={{ marginTop: '10px', display: 'flex', gap: '20px', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px' }}>H2 Concentration:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ fontSize: '10px' }}>Low</span>
                        <div style={{
                            width: '200px',
                            height: '15px',
                            background: 'linear-gradient(to right, #004d99, #00ccff, #ffff00, #ff6600, #ff0000)',
                            border: '1px solid #444',
                            borderRadius: '3px'
                        }} />
                        <span style={{ fontSize: '10px' }}>High</span>
                    </div>
                </div>
            </div>
            <div ref={containerRef} style={{ flex: 1, position: 'relative' }} />
        </div>
    );
};

export default DEMVisualization;