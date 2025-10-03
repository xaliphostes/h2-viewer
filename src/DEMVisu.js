import React, { useEffect, useRef, useState } from 'react';
import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkPlaneSource from '@kitware/vtk.js/Filters/Sources/PlaneSource';
import vtkTexture from '@kitware/vtk.js/Rendering/Core/Texture';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';

const DEMVisu = ({ demData, colorizedImageUrl, bounds }) => {
    const vtkContainerRef = useRef(null);
    const renderWindowRef = useRef(null);

    // Set up 3D visualization with vtk.js
    useEffect(() => {
        if (!demData || !vtkContainerRef.current) return;

        // Clear any existing render window
        if (renderWindowRef.current) {
            renderWindowRef.current.delete();
        }

        // Create full screen render window
        const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
            container: vtkContainerRef.current,
            background: [0.1, 0.1, 0.1],
        });

        const renderer = fullScreenRenderer.getRenderer();
        const renderWindow = fullScreenRenderer.getRenderWindow();
        renderWindowRef.current = fullScreenRenderer;

        // Create plane source for the terrain
        const planeSource = vtkPlaneSource.newInstance({
            xResolution: demData.width - 1,
            yResolution: demData.height - 1,
            origin: [0, 0, 0],
            point1: [demData.width, 0, 0],
            point2: [0, demData.height, 0],
        });

        // Get the polydata from plane
        const polydata = planeSource.getOutputData();
        const points = polydata.getPoints();
        const pointData = points.getData();

        // Apply elevation from DEM data
        const elevationScale = 0.5; // Adjust this to exaggerate/reduce terrain height
        for (let j = 0; j < demData.height; j++) {
            for (let i = 0; i < demData.width; i++) {
                const idx = (j * demData.width + i) * 3;
                const demIdx = j * demData.width + i;
                pointData[idx + 2] = demData.data[demIdx] * elevationScale;
            }
        }

        points.modified();

        // Create mapper and actor
        const mapper = vtkMapper.newInstance();
        mapper.setInputData(polydata);

        const actor = vtkActor.newInstance();
        actor.setMapper(mapper);

        // If we have a colorized image, apply it as texture
        if (colorizedImageUrl) {
            const image = new Image();
            image.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = image.width;
                canvas.height = image.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(image, 0, 0);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                // Create VTK image data
                const vtkImage = vtkImageData.newInstance();
                vtkImage.setDimensions(canvas.width, canvas.height, 1);

                const scalars = vtkDataArray.newInstance({
                    numberOfComponents: 4,
                    values: imageData.data,
                });

                vtkImage.getPointData().setScalars(scalars);

                // Create and apply texture
                const texture = vtkTexture.newInstance();
                texture.setInputData(vtkImage);
                actor.addTexture(texture);

                renderWindow.render();
            };
            image.src = colorizedImageUrl;
        }

        renderer.addActor(actor);
        renderer.resetCamera();
        renderWindow.render();

        // Handle window resize
        const handleResize = () => {
            if (renderWindow) {
                renderWindow.render();
            }
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            if (renderWindowRef.current) {
                renderWindowRef.current.delete();
                renderWindowRef.current = null;
            }
        };
    }, [demData, colorizedImageUrl]);

    return (
        <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ width: '100%', height: '50%', position: 'relative' }}>
                <div
                    ref={vtkContainerRef}
                    style={{
                        width: '100%',
                        height: '100%',
                        background: '#1a1a1a'
                    }}
                />
                {demData && (
                    <div style={{
                        position: 'absolute',
                        top: 10,
                        left: 10,
                        background: 'rgba(0,0,0,0.7)',
                        color: 'white',
                        padding: '10px',
                        borderRadius: '4px',
                        fontSize: '12px'
                    }}>
                        <div><strong>3D Terrain View</strong></div>
                        <div>Width: {demData.width}px</div>
                        <div>Height: {demData.height}px</div>
                        <div>Use mouse to rotate, zoom</div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DEMVisu;