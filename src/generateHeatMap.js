import Kriging from "./kriging";
import interpolateIDW from "./idw";

export default function generateHeatmap(h2Data, bounds, algorithm='kriging', variogramModel='exponential') {
    const canvas = document.createElement('canvas');
    const width = 800;
    const height = 600;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const [minLon, minLat, maxLon, maxLat] = bounds;
    const lonRange = maxLon - minLon;
    const latRange = maxLat - minLat;

    // Get H2 value range
    const h2Values = h2Data.map(d => d.h2);
    const minH2 = Math.min(...h2Values);
    const maxH2 = Math.max(...h2Values);

    // Initialize interpolation model
    let krigingModel = null;
    if (algorithm === 'kriging') {
        krigingModel = new Kriging(h2Data, { model: variogramModel });
    }

    // Color mapping function
    const getColor = (value) => {
        const normalized = (value - minH2) / (maxH2 - minH2);
        let r, g, b;

        if (normalized < 0.25) {
            const t = normalized / 0.25;
            r = Math.round(0 + 68 * t);
            g = Math.round(0 + 119 * t);
            b = Math.round(255 - 74 * t);
        } else if (normalized < 0.5) {
            const t = (normalized - 0.25) / 0.25;
            r = Math.round(68 + 92 * t);
            g = Math.round(119 + 91 * t);
            b = Math.round(181 - 111 * t);
        } else if (normalized < 0.75) {
            const t = (normalized - 0.5) / 0.25;
            r = Math.round(160 + 91 * t);
            g = Math.round(210 + 35 * t);
            b = Math.round(70 - 70 * t);
        } else {
            const t = (normalized - 0.75) / 0.25;
            r = Math.round(251 + 4 * t);
            g = Math.round(245 - 58 * t);
            b = Math.round(0);
        }

        return `rgb(${r}, ${g}, ${b})`;
    };

    // Generate grid
    const gridSize = 50;
    const cellWidth = width / gridSize;
    const cellHeight = height / gridSize;

    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            const lon = minLon + lonRange * (i + 0.5) / gridSize;
            const lat = maxLat - latRange * (j + 0.5) / gridSize;

            let value;
            if (algorithm === 'kriging') {
                value = krigingModel.interpolate(lon, lat);
            } else {
                value = interpolateIDW(lon, lat);
            }

            const color = getColor(value);
            ctx.fillStyle = color;
            ctx.fillRect(i * cellWidth, j * cellHeight, cellWidth, cellHeight);
        }
    }

    // Convert canvas to data URL
    return canvas.toDataURL()
};