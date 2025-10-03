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

const MAPVisu = ({ demData, colorizedImageUrl, bounds }) => {
    const [mapBounds, setMapBounds] = useState(null);
    const renderWindowRef = useRef(null);

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
        <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* 2D Map View */}
            <div style={{ width: '100%', height: '50%', position: 'relative' }}>
                <MapContainer
                    center={[45.2, 5.8]}
                    zoom={13}
                    style={{ width: '100%', height: '100%' }}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {colorizedImageUrl && mapBounds && (
                        <>
                            <ImageOverlay
                                url={colorizedImageUrl}
                                bounds={mapBounds}
                                opacity={0.7}
                            />
                            <FitBounds bounds={mapBounds} />
                        </>
                    )}
                </MapContainer>
            </div>
        </div>
    );
};

export default MAPVisu;