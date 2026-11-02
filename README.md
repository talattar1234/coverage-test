# Cesium sensor coverage POC

Run `node serve.mjs`, then open **http://localhost:8080**. Alternatively, serve this directory with any static HTTP server. No installation, build, token, database, or application backend is needed. Internet access is required for the pinned CesiumJS 1.130 CDN scripts, workers, and OpenStreetMap tiles. A WebGL-capable browser is required.

The globe uses OpenStreetMap street imagery with visible contributor attribution, via Cesium's [OpenStreetMapImageryProvider](https://cesium.com/learn/cesiumjs/ref-doc/OpenStreetMapImageryProvider.html). Tiles are requested directly from `https://tile.openstreetmap.org/` up to zoom level 19.

Use the dropdown for cone/pyramid, sliders or numeric inputs for dimensions and orientation, and independent fill/outline toggles. Expand **Sensor position** to edit longitude, latitude, and altitude. **Frame coverage** recenters after a large position or range change; **Reset** restores the sample.

## Coordinates and geometry

- Billboard center and volume apex share the same WGS84 Cartesian position. Altitude is meters above the WGS84 ellipsoid, not terrain. No pixel offset or ground clamping is applied. The icon remains visible through geometry for easy identification.
- Heading is clockwise from north: 0° north, 90° east. Pitch is elevation: 0° horizontal, +90° straight up. Roll rotates the local right axis toward the local up axis about the viewing axis. Cone roll has no effect on the circular filled surface, but rotates its outline spokes.
- FOV values are **full angles**. Cone radius is `range * tan(horizontalFov / 2)`. Pyramid half-width/half-height use horizontal/vertical FOV respectively.
- Range is the **axial distance to a flat base**, not a spherical distance limit. Base corners/rim are farther from the apex than the axial range.
- The sensor frame uses local X right, Y up, and -Z forward. The same frame drives both shapes and all straight outline segments.
- Cone center is translated forward by half its length. Its zero-radius top then lands precisely on the sensor, even after heading/pitch/roll changes. Both shapes use synchronous primitives so their filled surfaces update during continuous input; rapid edits are grouped into one update per animation frame.
- Pyramid has four triangular sides plus two base triangles, with eight outline edges. Translucent surfaces use 24% opacity. Outlines use non-ground-clamped, non-geodesic polylines.

## API investigation and choices

| Approach | Assessment |
| --- | --- |
| [Cesium CylinderGeometry](https://cesium.com/learn/cesiumjs/ref-doc/CylinderGeometry.html) | Selected for the cone with a synchronous primitive: `topRadius = 0`, `bottomRadius > 0`. An explicit half-length offset aligns its tip with the sensor. |
| [Cesium Geometry](https://cesium.com/learn/cesiumjs/ref-doc/Geometry.html) and [Primitive](https://cesium.com/learn/cesiumjs/ref-doc/Primitive.html) | Selected for the pyramid: five local vertices, six triangles, one translucent primitive; exact flat rectangular base without an extra library. |
| [IonSdkSensors.ConicSensor](https://cesium.com/learn/ion-sdk/ref-doc/ConicSensor.html) | Supports conic sensors plus occlusion and dome surfaces. More capability than this geometry-only POC needs. |
| [IonSdkSensors.RectangularSensor](https://cesium.com/learn/ion-sdk/ref-doc/RectangularSensor.html) | Supports model-matrix orientation, half-angles, and radius limits. Its principal direction is +Z and its range cap is a dome; it is not a direct substitute for the requested flat base. |

The [ion SDK requires separate licensing/access](https://cesium.com/learn/cesiumjs-learn/cesium-ion-sdk/); no SDK installation or license was supplied in this empty workspace. The POC therefore uses only public CesiumJS APIs. A future licensed SDK implementation would be useful for actual sensor analysis, ellipsoid intersections, or viewsheds.

Native cylinder outlines were evaluated, but Cesium documents that outline width is ignored on major Windows browsers. Explicit 2 px polylines keep both shapes' edges legible. A persistent `PolylineCollection` updates the wireframe in the requested frame without waiting for entity geometry processing or a camera movement. The pyramid's outlines omit the base's internal triangulation diagonal.

## Files and scope

- `app.js`: sample configuration, viewer setup, input validation, and UI bindings.
- `sensor.js`: local frame math and geometry renderer, independent of UI controls.
- `index.html`, `style.css`: standalone interface.
- `serve.mjs`: optional dependency-free local static server.

This is visual geometry only. No detection, physics, terrain, line-of-sight, or sensor/globe intersection computation. The globe naturally hides below-surface geometry. Use positive altitude/upward pitch to inspect a complete volume. Both appearance toggles may be off simultaneously, leaving just the sensor icon. Position edits update immediately but do not move the camera automatically.

## Validation

Verified in headless Chrome with WebGL: both shapes render without console/render errors; live dimension/orientation/position controls, appearance toggles, repeated shape switching, and reset work. Frame math checks cover 60 heading/pitch/roll combinations, cone tip alignment, axial length, orthonormality, north orientation, and FOV dimensions. Screenshots are in `tests/cone.png` and `tests/pyramid.png`.

To repeat, start the static server and run `node tests/browser.cjs` with Playwright installed in your test environment. Alternatively set `PLAYWRIGHT_MODULE` to an existing Playwright package path. Chrome must be installed. Playwright is only a development test tool and is not a dependency of the POC.
