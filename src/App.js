// Updated App.js - Main component that integrates everything

import React, { useState, useEffect } from 'react';
import MAPVisu from './MAPVisu';
import DEMVisu from './DEMVisu';
import generateHeatmap from './generateHeatMap';

const App = () => {
    const [h2Data, setH2Data] = useState([]);
    const [heatmapImageUrl, setHeatmapImageUrl] = useState(null);
    const [bounds, setBounds] = useState(null);
    const [algorithm, setAlgorithm] = useState('kriging');
    const [opacity, setOpacity] = useState(0.6);
    const [variogramModel, setVariogramModel] = useState('exponential');

    // Load H2 data
    useEffect(() => {
        const loadH2Data = async () => {
            try {
                const filePath = `${process.env.PUBLIC_URL}/h2_frantz.csv`;
                const response = await fetch(filePath);
                const text = await response.text();
                const lines = text.trim().split('\n').slice(1);

                const data = lines.map(line => {
                    const [lat, lon, h2] = line.split(';').map(v => parseFloat(v.trim()));
                    return { lat, lon, h2 };
                }).filter(d => !isNaN(d.lat) && !isNaN(d.lon) && !isNaN(d.h2));

                setH2Data(data);

                // Calculate bounds
                const lats = data.map(d => d.lat);
                const lons = data.map(d => d.lon);
                setBounds([
                    Math.min(...lons),
                    Math.min(...lats),
                    Math.max(...lons),
                    Math.max(...lats)
                ]);
            } catch (error) {
                console.error('Error loading H2 data:', error);
            }
        };

        loadH2Data();
    }, []);

    // Generate heatmap whenever data or settings change
    useEffect(() => {
        if (h2Data.length === 0 || !bounds) {
            return;
        }
        generateHeatmap(h2Data, bounds, algorithm).then(dataUrl => {
            setHeatmapImageUrl(dataUrl);
        });
    }, [h2Data, bounds, algorithm, variogramModel]);

    return (
        <div style={{ width: '100%', height: '100vh' }}>
            {/* Controls */}
            <div style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                zIndex: 1000,
                backgroundColor: 'white',
                padding: '15px',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
            }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>
                    H2 Heatmap Controls
                </h3>

                <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>
                        Algorithm
                    </label>
                    <select
                        value={algorithm}
                        onChange={(e) => setAlgorithm(e.target.value)}
                        style={{ width: '100%', padding: '5px' }}
                    >
                        <option value="kriging">Kriging</option>
                        <option value="idw">IDW</option>
                    </select>
                </div>

                {algorithm === 'kriging' && (
                    <div style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>
                            Variogram Model
                        </label>
                        <select
                            value={variogramModel}
                            onChange={(e) => setVariogramModel(e.target.value)}
                            style={{ width: '100%', padding: '5px' }}
                        >
                            <option value="exponential">Exponential</option>
                            <option value="gaussian">Gaussian</option>
                            <option value="spherical">Spherical</option>
                        </select>
                    </div>
                )}

                <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>
                        Opacity: {opacity.toFixed(2)}
                    </label>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={opacity}
                        onChange={(e) => setOpacity(parseFloat(e.target.value))}
                        style={{ width: '100%' }}
                    />
                </div>

                <div style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                    {h2Data.length} data points loaded
                </div>
            </div>

            {/* Map with Heatmap Overlay */}
            <MAPVisu
                colorizedImageUrl={heatmapImageUrl}
                bounds={bounds}
                opacity={opacity}
            />
            <DEMVisu
                colorizedImageUrl={heatmapImageUrl}
                bounds={bounds}
                opacity={opacity}
            />
        </div>
    );
};

export default App;