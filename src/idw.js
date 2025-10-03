
export default function interpolateIDW(lon, lat, points, power = 2, minDistance = 0.0001) {
    let weightSum = 0;
    let valueSum = 0;

    for (const point of points) {
        const distance = Math.sqrt(
            Math.pow(point.lon - lon, 2) + Math.pow(point.lat - lat, 2)
        );

        if (distance < minDistance) {
            return point.h2;
        }

        const weight = 1 / Math.pow(distance, power);
        weightSum += weight;
        valueSum += weight * point.h2;
    }

    return valueSum / weightSum;
};