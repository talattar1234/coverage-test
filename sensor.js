/* Geometry only. Configuration and UI live in app.js. */
(() => {
  const C = Cesium;
  const v = (x, y, z) => new C.Cartesian3(x, y, z);

  function dimensions(config) {
    return {
      width: config.range * Math.tan(C.Math.toRadians(config.horizontal / 2)),
      height: config.range * Math.tan(C.Math.toRadians(config.vertical / 2)),
    };
  }

  function frame(config) {
    const origin = C.Cartesian3.fromDegrees(config.longitude, config.latitude, config.altitude);
    const h = C.Math.toRadians(config.heading), p = C.Math.toRadians(config.pitch);
    const r = C.Math.toRadians(config.roll);
    const forward = v(Math.sin(h) * Math.cos(p), Math.cos(h) * Math.cos(p), Math.sin(p));
    const right = v(Math.cos(h), -Math.sin(h), 0);
    const up = C.Cartesian3.cross(right, forward, new C.Cartesian3());
    const rolledRight = C.Cartesian3.add(
      C.Cartesian3.multiplyByScalar(right, Math.cos(r), new C.Cartesian3()),
      C.Cartesian3.multiplyByScalar(up, Math.sin(r), new C.Cartesian3()), new C.Cartesian3());
    const rolledUp = C.Cartesian3.cross(rolledRight, forward, new C.Cartesian3());
    // Local -Z is forward: CylinderGraphics' zero-radius top is at +length/2.
    const rotation = new C.Matrix3();
    C.Matrix3.setColumn(rotation, 0, rolledRight, rotation);
    C.Matrix3.setColumn(rotation, 1, rolledUp, rotation);
    C.Matrix3.setColumn(rotation, 2, C.Cartesian3.negate(forward, new C.Cartesian3()), rotation);
    const matrix = C.Matrix4.multiply(C.Transforms.eastNorthUpToFixedFrame(origin),
      C.Matrix4.fromRotationTranslation(rotation), new C.Matrix4());
    const world = (x, y, z) => C.Matrix4.multiplyByPoint(matrix, v(x, y, z), new C.Cartesian3());
    return { origin, matrix, world };
  }

  class SensorRenderer {
    constructor(viewer) {
      this.viewer = viewer;
      // A persistent collection updates line buffers in the requested render itself.
      this.wireframe = viewer.scene.primitives.add(new C.PolylineCollection());
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="#122133" stroke="white" stroke-width="2"/><circle cx="20" cy="20" r="5" fill="#43d9eb"/><path d="M20 5v8m0 14v8M5 20h8m14 0h8" stroke="#43d9eb" stroke-width="2"/></svg>';
      this.billboard = viewer.entities.add({ name: 'Sensor / coverage apex', billboard: {
        image: 'data:image/svg+xml,' + encodeURIComponent(svg), width: 32, height: 32,
        horizontalOrigin: C.HorizontalOrigin.CENTER, verticalOrigin: C.VerticalOrigin.CENTER,
        heightReference: C.HeightReference.NONE, disableDepthTestDistance: Number.POSITIVE_INFINITY,
      } });
    }

    update(config) {
      this.wireframe.removeAll();
      if (this.surface) { this.viewer.scene.primitives.remove(this.surface); this.surface = undefined; }
      const { origin, matrix, world } = frame(config);
      const { width, height } = dimensions(config);
      const color = C.Color.fromCssColorString(config.color);
      this.billboard.position = origin;
      const line = (positions) => this.wireframe.add({ positions, width: 2,
        id: 'coverage-outline', material: C.Material.fromType('Color', { color }) });
      let base;
      if (config.type === 'cone') {
        if (config.fill) {
          // Build synchronously so continuous edits cannot outrun worker geometry jobs.
          const modelMatrix = C.Matrix4.multiplyByTranslation(matrix,
            v(0, 0, -config.range / 2), new C.Matrix4());
          this.surface = this.viewer.scene.primitives.add(new C.Primitive({
            geometryInstances: new C.GeometryInstance({
              geometry: C.CylinderGeometry.createGeometry(new C.CylinderGeometry({
                length: config.range, topRadius: 0, bottomRadius: width, slices: 96,
                vertexFormat: C.PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
              })),
              modelMatrix,
              attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(color.withAlpha(0.24)) },
            }),
            appearance: new C.PerInstanceColorAppearance({ flat: true, translucent: true, closed: false,
              renderState: { depthTest: { enabled: true }, cull: { enabled: false } } }),
            asynchronous: false,
          }));
        }
        base = Array.from({ length: 96 }, (_, i) => {
          const angle = i * Math.PI * 2 / 96;
          return world(width * Math.cos(angle), width * Math.sin(angle), -config.range);
        });
        if (config.outline) {
          line([...base, base[0]]);
          for (let i = 0; i < 96; i += 12) line([origin, base[i]]);
        }
      } else {
        const local = [v(0, 0, 0), v(-width, -height, -config.range),
          v(width, -height, -config.range), v(width, height, -config.range), v(-width, height, -config.range)];
        base = local.slice(1).map(point => world(point.x, point.y, point.z));
        if (config.fill) {
          const geometry = new C.Geometry({ attributes: { position: new C.GeometryAttribute({
            componentDatatype: C.ComponentDatatype.DOUBLE, componentsPerAttribute: 3,
            values: new Float64Array(local.flatMap(point => [point.x, point.y, point.z])),
          }) }, indices: new Uint16Array([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1, 1, 3, 2, 1, 4, 3]),
          primitiveType: C.PrimitiveType.TRIANGLES, boundingSphere: C.BoundingSphere.fromPoints(local) });
          this.surface = this.viewer.scene.primitives.add(new C.Primitive({
            geometryInstances: new C.GeometryInstance({ geometry, modelMatrix: matrix,
              attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(color.withAlpha(0.24)) } }),
            appearance: new C.PerInstanceColorAppearance({ flat: true, translucent: true, closed: false,
              renderState: { depthTest: { enabled: true }, cull: { enabled: false } } }),
            asynchronous: false,
          }));
        }
        if (config.outline) {
          line([...base, base[0]]);
          for (const corner of base) line([origin, corner]);
        }
      }
      this.bounds = C.BoundingSphere.fromPoints([origin, ...base]);
      this.viewer.scene.requestRender();
    }

    focus() {
      this.viewer.camera.flyToBoundingSphere(this.bounds, { duration: 0.6,
        offset: new C.HeadingPitchRange(C.Math.toRadians(-40), C.Math.toRadians(-28), this.bounds.radius * 3.5) });
    }
  }
  window.SensorGeometry = { frame, dimensions, SensorRenderer };
})();
