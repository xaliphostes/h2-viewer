import proj4 from 'proj4';

// Utah State Plane Coordinate Systems (NAD83, in meters)
proj4.defs("EPSG:26942", "+proj=lcc +lat_1=40.71666666666667 +lat_2=41.78333333333333 +lat_0=40.33333333333334 +lon_0=-111.5 +x_0=500000.00001016 +y_0=999999.9999898399 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"); // Utah North
proj4.defs("EPSG:26943", "+proj=lcc +lat_1=39.01666666666667 +lat_2=40.65 +lat_0=38.33333333333334 +lon_0=-111.5 +x_0=500000.00001016 +y_0=1999999.999983998 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"); // Utah Central
proj4.defs("EPSG:26944", "+proj=lcc +lat_1=37.21666666666667 +lat_2=38.35 +lat_0=36.66666666666666 +lon_0=-111.5 +x_0=500000.00001016 +y_0=2999999.999975997 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"); // Utah South

// WGS84 (standard lat/lon) - same as NAD83 for practical purposes
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");

/**
 * Convert Utah State Plane coordinates to Lat/Lon
 * @param {number} x - Easting in meters
 * @param {number} y - Northing in meters
 * @param {string} zone - 'north', 'central', or 'south'
 * @returns {{lat: number, lon: number}}
 */
export function utahToLatLon(x, y, zone = 'central') {
    const epsgCode = {
        'north': 'EPSG:26942',
        'central': 'EPSG:26943',
        'south': 'EPSG:26944'
    }[zone.toLowerCase()] || 'EPSG:26943';
    
    const [lon, lat] = proj4(epsgCode, 'EPSG:4326', [x, y]);
    return { lat, lon };
}

/**
 * Auto-detect Utah zone based on Y coordinate (Northing)
 * @param {number} y - Northing in meters
 * @returns {string} - 'north', 'central', or 'south'
 */
export function detectUtahZone(y) {
    if (y < 1500000) return 'north';
    if (y < 2500000) return 'central';
    return 'south';
}

/**
 * Generic UTM to Lat/Lon conversion
 * @param {number} x - Easting
 * @param {number} y - Northing  
 * @param {number} zone - UTM zone number (1-60)
 * @param {boolean} isNorth - true for northern hemisphere
 * @returns {{lat: number, lon: number}}
 */
export function utmToLatLon(x, y, zone = 31, isNorth = true) {
    const hemisphere = isNorth ? '' : ' +south';
    const utmProj = `+proj=utm +zone=${zone}${hemisphere} +datum=WGS84 +units=m +no_defs`;
    
    const [lon, lat] = proj4(utmProj, 'EPSG:4326', [x, y]);
    return { lat, lon };
}