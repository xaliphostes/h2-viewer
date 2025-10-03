import React, { useEffect, useRef, useState } from 'react';
import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkPoints from '@kitware/vtk.js/Common/Core/Points';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import Delaunator from 'delaunator';

const DEMVisu = () => {
    const vtkContainerRef = useRef(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [stats, setStats] = useState(null);

    useEffect(() => {
        const loadAndVisualize = async () => {
            try {
                setLoading(true);
                
                 // Auto-load the DEM file
                // Use process.env.PUBLIC_URL to handle both development and production paths
                const filePath = `${process.env.PUBLIC_URL}/POC-land_surface_vertices.xyz`;
                const response = await fetch(filePath);
                
                if (!response.ok) {
                    throw new Error(`Failed to load file: ${response.statusText}`);
                }
                
                const text = await response.text();
                
                // Parse XYZ file
                const lines = text.trim().split('\n');
                const points = [];
                const coords2D = []; // For Delaunator (X, Y only)
                const zValues = [];
                
                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (trimmedLine.length === 0 || trimmedLine.startsWith('#')) continue;
                    
                    const values = trimmedLine.split(/\s+/).map(parseFloat);
                    if (values.length >= 3 && values.every(v => !isNaN(v))) {
                        const [x, y, z] = values;
                        points.push(x, y, z);
                        coords2D.push(x, y); // For Delaunator
                        zValues.push(z);
                    }
                }
                
                if (points.length === 0) {
                    throw new Error('No valid data points found in file');
                }

                let minZ = Infinity;
                let maxZ = -Infinity;
                zValues.forEach(z => {
                    if (z < minZ) minZ = z;
                    if (z > maxZ) maxZ = z;
                });
                
                const numPoints = points.length / 3;
                
                console.log(`Loaded ${numPoints} points from POC-land_surface_vertices.xyz`);
                console.log(`Z range: ${minZ.toFixed(2)} to ${maxZ.toFixed(2)}`);
                
                // Perform Delaunay triangulation using delaunator
                const delaunay = Delaunator.from(
                    coords2D.reduce((acc, val, i) => {
                        if (i % 2 === 0) acc.push([val, coords2D[i + 1]]);
                        return acc;
                    }, [])
                );
                
                console.log(`Created ${delaunay.triangles.length / 3} triangles`);
                
                setStats({
                    numPoints,
                    numTriangles: delaunay.triangles.length / 3,
                    minZ,
                    maxZ
                });
                
                // Create VTK visualization
                if (!vtkContainerRef.current) return;
                
                // Clear container
                vtkContainerRef.current.innerHTML = '';
                
                // Create full screen render window
                const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
                    rootContainer: vtkContainerRef.current,
                    containerStyle: {
                        height: '600px',
                        width: '100%',
                        position: 'relative'
                    }
                });
                
                const renderer = fullScreenRenderer.getRenderer();
                const renderWindow = fullScreenRenderer.getRenderWindow();
                
                // Create polydata
                const polydata = vtkPolyData.newInstance();
                
                // Add points
                const vtkPoints_instance = vtkPoints.newInstance();
                vtkPoints_instance.setData(Float32Array.from(points), 3);
                polydata.setPoints(vtkPoints_instance);
                
                // Create triangles from delaunator output
                // delaunator.triangles is a flat array where each triplet defines a triangle
                const numTriangles = delaunay.triangles.length / 3;
                const triangles = new Uint32Array(numTriangles * 4);
                
                for (let i = 0; i < numTriangles; i++) {
                    triangles[i * 4] = 3; // Number of points in this polygon (triangle)
                    triangles[i * 4 + 1] = delaunay.triangles[i * 3];     // First vertex
                    triangles[i * 4 + 2] = delaunay.triangles[i * 3 + 1]; // Second vertex
                    triangles[i * 4 + 3] = delaunay.triangles[i * 3 + 2]; // Third vertex
                }
                
                const triangleCells = vtkCellArray.newInstance({ values: triangles });
                polydata.setPolys(triangleCells);
                
                // Add Z values as scalars for coloring
                const scalars = vtkDataArray.newInstance({
                    name: 'Elevation',
                    values: Float32Array.from(zValues)
                });
                polydata.getPointData().setScalars(scalars);
                
                // Create mapper
                const mapper = vtkMapper.newInstance();
                mapper.setInputData(polydata);
                mapper.setScalarModeToUsePointData();
                mapper.setScalarRange(minZ, maxZ);
                
                // Create color transfer function
                const lookupTable = vtkColorTransferFunction.newInstance();
                lookupTable.addRGBPoint(minZ, 0.0, 0.0, 1.0);          // Blue for low
                lookupTable.addRGBPoint(minZ + (maxZ - minZ) * 0.25, 0.0, 1.0, 1.0); // Cyan
                lookupTable.addRGBPoint(minZ + (maxZ - minZ) * 0.5, 0.0, 1.0, 0.0);  // Green
                lookupTable.addRGBPoint(minZ + (maxZ - minZ) * 0.75, 1.0, 1.0, 0.0); // Yellow
                lookupTable.addRGBPoint(maxZ, 1.0, 0.0, 0.0);          // Red for high
                
                mapper.setLookupTable(lookupTable);
                
                // Create actor
                const actor = vtkActor.newInstance();
                actor.setMapper(mapper);
                
                // Add actor to renderer
                renderer.addActor(actor);
                renderer.resetCamera();
                renderer.getActiveCamera().elevation(-30);
                renderer.getActiveCamera().azimuth(45);
                renderer.resetCameraClippingRange();
                
                // Set background
                renderer.setBackground(0.95, 0.95, 0.97);
                
                // Render
                renderWindow.render();
                
                setLoading(false);
                setError(null);
                
                // Cleanup function
                return () => {
                    fullScreenRenderer.delete();
                };
                
            } catch (err) {
                setError(`Error loading DEM file: ${err.message}`);
                setLoading(false);
                console.error('Error in DEMVisu:', err);
            }
        };
        
        loadAndVisualize();
    }, []);

    return (
        <div style={{ 
            backgroundColor: '#f9fafb', 
            padding: '2rem',
            minHeight: '100vh'
        }}>
            <div style={{ marginBottom: '1.5rem' }}>
                <h1 style={{ 
                    fontSize: '2rem', 
                    fontWeight: 'bold', 
                    marginBottom: '0.5rem',
                    color: '#1f2937'
                }}>
                    DEM Visualization with VTK.js + Delaunator
                </h1>
                <p style={{ 
                    color: '#6b7280', 
                    marginBottom: '1rem',
                    fontSize: '1rem'
                }}>
                    POC-land_surface_vertices.xyz - 3D Terrain Surface
                </p>
                
                {stats && (
                    <div style={{ 
                        fontSize: '0.875rem', 
                        color: '#4b5563',
                        backgroundColor: 'white',
                        padding: '1rem',
                        borderRadius: '0.5rem',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }}>
                        <p style={{ margin: '0.25rem 0' }}>
                            <strong>File:</strong> POC-land_surface_vertices.xyz (auto-loaded)
                        </p>
                        <p style={{ margin: '0.25rem 0' }}>
                            <strong>Total points:</strong> {stats.numPoints}
                        </p>
                        <p style={{ margin: '0.25rem 0' }}>
                            <strong>Triangles:</strong> {stats.numTriangles}
                        </p>
                        <p style={{ margin: '0.25rem 0' }}>
                            <strong>Elevation range:</strong> {stats.minZ.toFixed(2)} - {stats.maxZ.toFixed(2)}
                        </p>
                        <p style={{ 
                            margin: '0.75rem 0 0 0', 
                            fontSize: '0.75rem', 
                            fontStyle: 'italic',
                            color: '#6b7280'
                        }}>
                            Use mouse to rotate, zoom, and pan the 3D view
                        </p>
                    </div>
                )}
            </div>
            
            {loading && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '600px',
                    fontSize: '1.25rem',
                    color: '#4b5563',
                    backgroundColor: 'white',
                    borderRadius: '0.5rem'
                }}>
                    Loading POC-land_surface_vertices.xyz and creating 3D visualization...
                </div>
            )}
            
            {error && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '600px',
                    fontSize: '1.25rem',
                    color: '#dc2626',
                    backgroundColor: 'white',
                    borderRadius: '0.5rem'
                }}>
                    {error}
                </div>
            )}
            
            <div 
                ref={vtkContainerRef}
                style={{
                    width: '100%',
                    height: '600px',
                    backgroundColor: 'white',
                    borderRadius: '0.5rem',
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
                    display: loading || error ? 'none' : 'block'
                }}
            />
        </div>
    );
};

export default DEMVisu;