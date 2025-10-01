import React, { useState, useEffect } from 'react';
import './App.css';
import Kriging from './kriging';
import csvData from './h2_frantz.csv';

function App() {
    const [data, setData] = useState([]);
    const [minValue, setMinValue] = useState(0);
    const [maxValue, setMaxValue] = useState(0);
    const [error, setError] = useState(null);
    const [showInterpolation, setShowInterpolation] = useState(true);
    const [algorithm, setAlgorithm] = useState('kriging');
    const [variogramModel, setVariogramModel] = useState('exponential');
    const [krigingModel, setKrigingModel] = useState(null);
    const [krigingParams, setKrigingParams] = useState(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                const response = await fetch(csvData);
                const text = await response.text();
                //const text = DATA

                const lines = text.trim().split('\n');
                const parsedData = lines.slice(1).map(line => {
                    const [lat, lon, h2] = line.split(';').map(v => parseFloat(v.trim()));
                    return { lat, lon, h2 };
                }).filter(d => !isNaN(d.lat) && !isNaN(d.lon) && !isNaN(d.h2));

                const h2Values = parsedData.map(d => d.h2);
                const min = Math.min(...h2Values);
                const max = Math.max(...h2Values);

                setData(parsedData);
                setMinValue(min);
                setMaxValue(max);

                // Initialiser le modèle Kriging
                const kriging = new Kriging(parsedData, {
                    model: variogramModel
                });
                setKrigingModel(kriging);
                setKrigingParams(kriging.getParameters());

            } catch (err) {
                setError('Error loading data: ' + err.message);
                console.error('Error loading data:', err);
            }
        };

        loadData();
    }, [variogramModel]);

    // IDW interpolation
    const interpolateIDW = (lon, lat, points, power = 2) => {
        let weightSum = 0;
        let valueSum = 0;

        for (const point of points) {
            const distance = Math.sqrt(
                Math.pow(point.lon - lon, 2) + Math.pow(point.lat - lat, 2)
            );

            if (distance < 0.0001) {
                return point.h2;
            }

            const weight = 1 / Math.pow(distance, power);
            weightSum += weight;
            valueSum += weight * point.h2;
        }

        return valueSum / weightSum;
    };

    const getColor = (value) => {
        const normalized = (value - minValue) / (maxValue - minValue);

        if (normalized < 0.25) {
            const t = normalized / 0.25;
            return `rgb(${Math.round(0 + 68 * t)}, ${Math.round(0 + 119 * t)}, ${Math.round(255 - 74 * t)})`;
        } else if (normalized < 0.5) {
            const t = (normalized - 0.25) / 0.25;
            return `rgb(${Math.round(68 + 92 * t)}, ${Math.round(119 + 91 * t)}, ${Math.round(181 - 111 * t)})`;
        } else if (normalized < 0.75) {
            const t = (normalized - 0.5) / 0.25;
            return `rgb(${Math.round(160 + 91 * t)}, ${Math.round(210 + 35 * t)}, ${Math.round(70 - 70 * t)})`;
        } else {
            const t = (normalized - 0.75) / 0.25;
            return `rgb(${Math.round(251 + 4 * t)}, ${Math.round(245 - 58 * t)}, ${Math.round(0)})`;
        }
    };

    if (error) {
        return <div className="error">{error}</div>;
    }

    if (data.length === 0 || !krigingModel) {
        return <div className="loading">Loading data and initializing Kriging model...</div>;
    }

    const latitudes = data.map(d => d.lat);
    const longitudes = data.map(d => d.lon);
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLon = Math.min(...longitudes);
    const maxLon = Math.max(...longitudes);
    const latRange = maxLat - minLat;
    const lonRange = maxLon - minLon;

    const width = 1000;
    const height = 700;
    const padding = 60;

    const mapWidth = width - 2 * padding;
    const mapHeight = height - 2 * padding - 80;

    const lonToX = (lon) => padding + ((lon - minLon) / lonRange) * mapWidth;
    const latToY = (lat) => padding + ((maxLat - lat) / latRange) * mapHeight;

    // Create interpolation grid
    const gridResolution = 50;
    const gridCells = [];

    if (showInterpolation) {
        const cellWidth = mapWidth / gridResolution;
        const cellHeight = mapHeight / gridResolution;

        for (let i = 0; i < gridResolution; i++) {
            for (let j = 0; j < gridResolution; j++) {
                const lon = minLon + (lonRange * (i + 0.5) / gridResolution);
                const lat = maxLat - (latRange * (j + 0.5) / gridResolution);

                let interpolatedValue;
                if (algorithm === 'kriging') {
                    interpolatedValue = krigingModel.interpolate(lon, lat);
                } else {
                    interpolatedValue = interpolateIDW(lon, lat, data);
                }

                gridCells.push({
                    x: padding + i * cellWidth,
                    y: padding + j * cellHeight,
                    width: cellWidth,
                    height: cellHeight,
                    value: interpolatedValue,
                    color: getColor(interpolatedValue)
                });
            }
        }
    }

    const legendStops = 5;
    const legendWidth = 300;
    const legendHeight = 20;

    return (
        <div className="App">
            <div className="header">
                <div>
                    <h1>H₂ Concentration Map</h1>
                    <p className="subtitle">Hydrogen measurements (PPM) across sampling locations</p>
                </div>
                <div className="controls">
                    <label className="toggle-label">
                        <input
                            type="checkbox"
                            checked={showInterpolation}
                            onChange={(e) => setShowInterpolation(e.target.checked)}
                        />
                        <span>Show Interpolation</span>
                    </label>

                    <select
                        value={algorithm}
                        onChange={(e) => setAlgorithm(e.target.value)}
                        className="algorithm-select"
                        disabled={!showInterpolation}
                    >
                        <option value="kriging">Kriging</option>
                        <option value="idw">IDW</option>
                    </select>

                    {algorithm === 'kriging' && showInterpolation && (
                        <select
                            value={variogramModel}
                            onChange={(e) => setVariogramModel(e.target.value)}
                            className="algorithm-select variogram-select"
                        >
                            <option value="exponential">Exponential</option>
                            <option value="gaussian">Gaussian</option>
                            <option value="spherical">Spherical</option>
                        </select>
                    )}
                </div>
            </div>

            <svg width={width} height={height} className="map-svg">
                <rect x={padding} y={padding} width={mapWidth} height={mapHeight} fill="#f0f4f8" stroke="#d1d5db" strokeWidth="2" />

                {showInterpolation && gridCells.map((cell, i) => (
                    <rect
                        key={i}
                        x={cell.x}
                        y={cell.y}
                        width={cell.width}
                        height={cell.height}
                        fill={cell.color}
                        opacity={0.6}
                        stroke="none"
                    />
                ))}

                {data.map((point, i) => (
                    <g key={i}>
                        <circle
                            cx={lonToX(point.lon)}
                            cy={latToY(point.lat)}
                            r={5}
                            fill={getColor(point.h2)}
                            stroke="white"
                            strokeWidth="2"
                            opacity={1}
                        />
                        <title>{`Lat: ${point.lat.toFixed(5)}, Lon: ${point.lon.toFixed(5)}, H₂: ${point.h2} PPM`}</title>
                    </g>
                ))}

                <text x={padding} y={padding - 20} fontSize="14" fill="#4b5563" fontWeight="600">
                    Latitude: {maxLat.toFixed(3)}°N
                </text>
                <text x={padding} y={padding + mapHeight + 35} fontSize="14" fill="#4b5563" fontWeight="600">
                    Latitude: {minLat.toFixed(3)}°N
                </text>
                <text x={padding - 10} y={padding + mapHeight / 2} fontSize="14" fill="#4b5563" fontWeight="600" textAnchor="end" transform={`rotate(-90, ${padding - 10}, ${padding + mapHeight / 2})`}>
                    Longitude: {minLon.toFixed(3)}°W to {maxLon.toFixed(3)}°W
                </text>

                <g transform={`translate(${width / 2 - legendWidth / 2}, ${height - 60})`}>
                    <text x={legendWidth / 2} y={-10} fontSize="16" fill="#1f2937" fontWeight="600" textAnchor="middle">
                        H₂ Concentration (PPM)
                    </text>

                    <defs>
                        <linearGradient id="legendGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" style={{ stopColor: getColor(minValue), stopOpacity: 1 }} />
                            <stop offset="25%" style={{ stopColor: getColor(minValue + (maxValue - minValue) * 0.25), stopOpacity: 1 }} />
                            <stop offset="50%" style={{ stopColor: getColor(minValue + (maxValue - minValue) * 0.5), stopOpacity: 1 }} />
                            <stop offset="75%" style={{ stopColor: getColor(minValue + (maxValue - minValue) * 0.75), stopOpacity: 1 }} />
                            <stop offset="100%" style={{ stopColor: getColor(maxValue), stopOpacity: 1 }} />
                        </linearGradient>
                    </defs>

                    <rect x={0} y={0} width={legendWidth} height={legendHeight} fill="url(#legendGradient)" stroke="#9ca3af" strokeWidth="1" />

                    {[...Array(legendStops)].map((_, i) => {
                        const value = minValue + (maxValue - minValue) * (i / (legendStops - 1));
                        const x = (legendWidth * i) / (legendStops - 1);
                        return (
                            <g key={i}>
                                <line x1={x} y1={legendHeight} x2={x} y2={legendHeight + 5} stroke="#6b7280" strokeWidth="1" />
                                <text x={x} y={legendHeight + 20} fontSize="12" fill="#4b5563" textAnchor="middle">
                                    {value.toFixed(2)}
                                </text>
                            </g>
                        );
                    })}
                </g>
            </svg>

            <div className="info">
                <p><strong>Total points:</strong> {data.length}</p>
                <p><strong>Range:</strong> {minValue.toFixed(2)} - {maxValue.toFixed(2)} PPM</p>
                <p><strong>Algorithm:</strong> {algorithm === 'kriging' ? 'Kriging (Simple)' : 'IDW (Inverse Distance Weighting)'}</p>
                {algorithm === 'kriging' && krigingParams && (
                    <p><strong>Kriging params:</strong> Model={krigingParams.model}, Range={krigingParams.range.toFixed(4)}°, Sill={krigingParams.sill.toFixed(2)}, Nugget={krigingParams.nugget.toFixed(2)}</p>
                )}
                <p className="hint">Hover over points to see detailed values</p>
            </div>
        </div>
    );
}

export default App;