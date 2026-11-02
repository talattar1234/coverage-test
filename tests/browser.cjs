// Run with PLAYWRIGHT_MODULE pointing to an installed playwright package.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('http://localhost:8080');
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Base radius:'), { timeout: 60000 });
    await page.waitForTimeout(3000);
    // Keep sending input events without committing a change or blurring the control.
    const liveFrames = await page.evaluate(async () => {
      let renderer;
      const originalUpdate = SensorGeometry.SensorRenderer.prototype.update;
      SensorGeometry.SensorRenderer.prototype.update = function (config) {
        renderer = this;
        return originalUpdate.call(this, config);
      };
      const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
      const frames = [];
      let cameraPosition;
      try {
        for (const type of ['cone', 'pyramid']) {
          const select = document.querySelector('#type');
          select.value = type;
          select.dispatchEvent(new Event('input', { bubbles: true }));
          const slider = document.querySelector('#field-range input[type=range]');
          slider.focus();
          for (let value = 6100; value <= 7000; value += 100) {
            slider.value = value;
            slider.dispatchEvent(new Event('input', { bubbles: true }));
            await nextFrame();
            await nextFrame();
            const C = Cesium, scene = renderer.viewer.scene;
            cameraPosition ??= C.Cartesian3.clone(renderer.viewer.camera.positionWC);
            let pickedOutline = false;
            for (let i = 1; i < renderer.wireframe.length; i++) {
              const positions = renderer.wireframe.get(i).positions;
              const midpoint = C.Cartesian3.midpoint(positions[0], positions[1], new C.Cartesian3());
              const pixel = C.SceneTransforms.worldToWindowCoordinates(scene, midpoint);
              if (pixel && scene.pick(pixel, 5, 5)?.id === 'coverage-outline') pickedOutline = true;
            }
            frames.push({ type, ready: renderer.surface.ready, radius: renderer.bounds.radius,
              pickedOutline, lineCount: renderer.wireframe.length,
              cameraUnchanged: C.Cartesian3.equals(cameraPosition, renderer.viewer.camera.positionWC),
              focused: document.activeElement === slider });
          }
        }
      } finally {
        SensorGeometry.SensorRenderer.prototype.update = originalUpdate;
        document.querySelector('#reset').click();
      }
      return frames;
    });
    assert(liveFrames.every(frame => frame.ready && frame.focused), 'Surfaces render before input is committed');
    assert(liveFrames.every(frame => frame.pickedOutline && frame.cameraUnchanged &&
      frame.lineCount === (frame.type === 'cone' ? 9 : 5)),
    `Wireframes render during edits without zooming: ${JSON.stringify(liveFrames)}`);
    for (let i = 1; i < liveFrames.length; i++) {
      if (liveFrames[i].type === liveFrames[i - 1].type)
        assert(liveFrames[i].radius !== liveFrames[i - 1].radius,
          `Geometry follows every live range edit: ${JSON.stringify(liveFrames)}`);
    }
    const math = await page.evaluate(() => {
      const C = Cesium, G = SensorGeometry;
      const base = { longitude: 34.8, latitude: 32.1, altitude: 2500, range: 6000, horizontal: 60, vertical: 40 };
      let apexError = 0, lengthError = 0, orthogonalityError = 0;
      for (const heading of [0, 90, 180, 270]) for (const pitch of [-90, -30, 0, 40, 90]) for (const roll of [-180, 0, 73]) {
        const f = G.frame({ ...base, heading, pitch, roll });
        const rotation = C.Matrix4.getMatrix3(f.matrix, new C.Matrix3());
        const center = f.world(0, 0, -base.range / 2);
        const topOffset = C.Matrix3.multiplyByVector(rotation, new C.Cartesian3(0, 0, base.range / 2), new C.Cartesian3());
        const apex = C.Cartesian3.add(center, topOffset, new C.Cartesian3());
        apexError = Math.max(apexError, C.Cartesian3.distance(apex, f.origin));
        lengthError = Math.max(lengthError, Math.abs(C.Cartesian3.distance(f.origin, f.world(0, 0, -base.range)) - base.range));
        orthogonalityError = Math.max(orthogonalityError, Math.abs(C.Matrix3.determinant(rotation) - 1));
      }
      const north = G.frame({ ...base, heading: 0, pitch: 0, roll: 0 });
      const inverse = C.Matrix4.inverseTransformation(C.Transforms.eastNorthUpToFixedFrame(north.origin), new C.Matrix4());
      const end = C.Matrix4.multiplyByPoint(inverse, north.world(0, 0, -base.range), new C.Cartesian3());
      return { apexError, lengthError, orthogonalityError, northError: Math.hypot(end.x, end.y - base.range, end.z), width: G.dimensions(base).width };
    });
    for (const key of ['apexError', 'lengthError', 'orthogonalityError', 'northError']) assert(math[key] < 1e-7, `${key}: ${math[key]}`);
    assert(Math.abs(math.width - 6000 * Math.tan(Math.PI / 6)) < 1e-8);
    await page.screenshot({ path: 'tests/cone.png' });
    await page.selectOption('#type', 'pyramid');
    await page.locator('#field-vertical').waitFor({ state: 'visible' });
    for (const [key, value] of [['heading', '120'], ['pitch', '40'], ['roll', '35'], ['range', '9000'], ['horizontal', '65'], ['vertical', '40']]) {
      await page.locator(`#field-${key} input[type=number]`).fill(value);
    }
    await page.click('#focus');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'tests/pyramid.png' });
    for (const key of ['fill', 'outline']) { await page.uncheck(`#${key}`); await page.waitForTimeout(150); await page.check(`#${key}`); }
    await page.locator('#color').fill('#ff9933');
    await page.locator('summary').click();
    await page.locator('#field-altitude input').fill('5000');
    await page.locator('#field-longitude input').fill('35');
    await page.locator('#field-latitude input').fill('32.5');
    await page.click('#focus');
    for (let i = 0; i < 8; i++) await page.selectOption('#type', i % 2 ? 'cone' : 'pyramid');
    await page.click('#reset');
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('#type').inputValue(), 'cone');
    assert.equal(await page.locator('#field-altitude input').inputValue(), '2500');
    assert(!(await page.locator('#field-vertical').isVisible()));
    assert(!(await page.locator('#status').textContent()).includes('error'));
    assert.deepEqual(errors.filter(error => !error.includes('favicon.ico')), []);
    console.log('PASS: browser rendering, live controls, shape switching, reset, and 60 orientation/apex cases.', math);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
