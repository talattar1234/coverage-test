(() => {
  const status = document.getElementById('status');
  try {
    if (!window.Cesium) throw new Error('Cesium could not load. Check your internet connection and reload.');
    const defaults = { type: 'cone', longitude: 34.8, latitude: 32.1, altitude: 2500,
      range: 6000, horizontal: 45, vertical: 30, heading: 45, pitch: 15, roll: 0,
      fill: true, outline: true, color: '#43d9eb' };
    const config = { ...defaults };
    const viewer = new Cesium.Viewer('globe', {
      baseLayer: false, baseLayerPicker: false, geocoder: false, terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      animation: false, timeline: false, sceneModePicker: false, navigationHelpButton: false,
      homeButton: false, infoBox: false, selectionIndicator: false, fullscreenButton: false,
      requestRenderMode: true, maximumRenderTimeChange: Infinity,
    });
    const osm = new Cesium.OpenStreetMapImageryProvider({
      url: 'https://tile.openstreetmap.org/',
      maximumLevel: 19,
      credit: new Cesium.Credit('&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>', true),
    });
    osm.errorEvent.addEventListener(() => {
      status.textContent = 'OpenStreetMap tiles unavailable; geometry is still usable.';
    });
    viewer.imageryLayers.addImageryProvider(osm);
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#263b50');
    viewer.scene.globe.depthTestAgainstTerrain = true;
    const renderer = new SensorGeometry.SensorRenderer(viewer);
    const inputs = [];
    const fields = [
      ['range', 'Maximum range (m)', 100, 50000, 100],
      ['horizontal', 'Horizontal FOV (°)', 1, 120, 1],
      ['vertical', 'Vertical FOV (°)', 1, 120, 1],
      ['heading', 'Heading (°)', 0, 360, 1],
      ['pitch', 'Pitch (°)', -90, 90, 1],
      ['roll', 'Roll (°)', -180, 180, 1],
      ['longitude', 'Longitude (°)', -180, 180, 0.001],
      ['latitude', 'Latitude (°)', -90, 90, 0.001],
      ['altitude', 'Altitude (m)', 0, 100000, 100],
    ];
    let pendingUpdate;
    function scheduleUpdate() {
      if (pendingUpdate === undefined) pendingUpdate = requestAnimationFrame(update);
    }
    function update() {
      cancelAnimationFrame(pendingUpdate);
      pendingUpdate = undefined;
      document.getElementById('field-vertical').hidden = config.type === 'cone';
      renderer.update(config);
      const d = SensorGeometry.dimensions(config);
      status.textContent = config.type === 'cone' ? `Base radius: ${Math.round(d.width).toLocaleString()} m`
        : `Base: ${Math.round(d.width * 2).toLocaleString()} × ${Math.round(d.height * 2).toLocaleString()} m`;
    }
    for (const [key, title, min, max, step] of fields) {
      const label = document.createElement('label');
      label.className = 'parameter'; label.id = `field-${key}`;
      const caption = document.createElement('span'); caption.textContent = title; label.append(caption);
      const number = document.createElement('input');
      number.type = 'number'; number.min = min; number.max = max; number.step = 'any';
      number.setAttribute('aria-label', title); number.value = config[key]; label.append(number);
      const isPosition = ['longitude', 'latitude', 'altitude'].includes(key);
      let slider;
      if (!isPosition) {
        slider = document.createElement('input'); slider.type = 'range'; slider.min = min;
        slider.max = max; slider.step = step; slider.value = config[key];
        slider.setAttribute('aria-label', `${title} slider`); label.append(slider);
        slider.addEventListener('input', () => { config[key] = Number(slider.value); number.value = slider.value; scheduleUpdate(); });
      }
      number.addEventListener('input', () => {
        if (!number.validity.valid || number.value === '') return;
        config[key] = Number(number.value); if (slider) slider.value = number.value; scheduleUpdate();
      });
      number.addEventListener('change', () => { number.value = config[key]; });
      document.getElementById(isPosition ? 'position' : 'parameters').append(label);
      inputs.push({ key, number, slider });
    }
    for (const key of ['type', 'fill', 'outline', 'color']) {
      const input = document.getElementById(key);
      input.addEventListener('input', () => {
        config[key] = input.type === 'checkbox' ? input.checked : input.value; scheduleUpdate();
      });
    }
    document.getElementById('controls').addEventListener('submit', event => event.preventDefault());
    document.getElementById('focus').addEventListener('click', () => { update(); renderer.focus(); });
    document.getElementById('reset').addEventListener('click', () => {
      Object.assign(config, defaults);
      for (const { key, number, slider } of inputs) { number.value = config[key]; if (slider) slider.value = config[key]; }
      for (const key of ['type', 'fill', 'outline', 'color']) {
        const input = document.getElementById(key);
        if (input.type === 'checkbox') input.checked = config[key]; else input.value = config[key];
      }
      update(); renderer.focus();
    });
    viewer.scene.renderError.addEventListener((_scene, error) => { status.textContent = `Render error: ${error.message}`; });
    update(); renderer.focus();
  } catch (error) { status.textContent = error.message; console.error(error); }
})();
