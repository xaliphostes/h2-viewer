import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, ImageOverlay, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Component to fit map bounds
function FitBounds({ bounds }) {
    const map = useMap();

    useEffect(() => {
        if (bounds) {
            map.fitBounds(bounds);
        }
    }, [bounds, map]);

    return null;
}

const MAPVisu = ({ demData, colorizedImageUrl, bounds, opacity = 0.7 }) => {
    const [mapBounds, setMapBounds] = useState(null);
    // const renderWindowRef = useRef(null);

    // Set up 2D map bounds
    useEffect(() => {
        if (bounds && bounds.length === 4) {
            const leafletBounds = [
                [bounds[1], bounds[0]], // Southwest corner [lat, lng]
                [bounds[3], bounds[2]]  // Northeast corner [lat, lng]
            ];
            setMapBounds(leafletBounds);
        }
    }, [bounds]);

    return (
        <div style={{ width: '70%', height: '70%', display: 'flex', flexDirection: 'column' }}>
            {/* 2D Map View with Heatmap Overlay */}
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                <MapContainer
                    center={[45.2, 5.8]}
                    zoom={13}
                    style={{ width: '100%', height: '100%' }}
                >
                    {/* Base Map Layer - OpenStreetMap */}
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {/* Heatmap Overlay with Transparency */}
                    {colorizedImageUrl && mapBounds && (
                        <>
                            <ImageOverlay
                                url={colorizedImageUrl}
                                bounds={mapBounds}
                                opacity={opacity}
                                zIndex={10}
                            />
                            <FitBounds bounds={mapBounds} />
                        </>
                    )}
                </MapContainer>

                {/* Legend */}
                {colorizedImageUrl && (
                    <div style={{
                        position: 'absolute',
                        bottom: '30px',
                        left: '10px',
                        backgroundColor: 'white',
                        padding: '10px',
                        borderRadius: '5px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        zIndex: 1000
                    }}>
                        <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>
                            H₂ Concentration (PPM)
                        </div>
                        <div style={{
                            width: '200px',
                            height: '20px',
                            background: 'linear-gradient(to right, rgb(0,0,255), rgb(0,255,255), rgb(0,255,0), rgb(255,255,0), rgb(255,0,0))',
                            border: '1px solid #ccc'
                        }} />
                        <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between',
                            fontSize: '10px',
                            marginTop: '2px'
                        }}>
                            <span>Low</span>
                            <span>High</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MAPVisu;