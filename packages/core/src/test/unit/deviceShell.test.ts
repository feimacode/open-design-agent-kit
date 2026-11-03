import * as assert from 'node:assert';
import { prototypeShellHtml } from '../../export/collectionPrototype';
import { composeScreenSpecSection, parsePlatform } from '../../generation/screenDecisions';
import { DEVICE_CONTENT_SIZES, deviceViewports, drawsOwnFrame, mountDeviceShell, parseDevice } from '../../preview/deviceShell';

describe('device shells', () => {
  it('reads the device a screen declares on <body>', () => {
    assert.deepStrictEqual(parseDevice('<body data-od-device="iphone">'), { device: 'iphone' });
    assert.deepStrictEqual(parseDevice("<body class=x data-od-device='Android' data-od-theme=\"dark\">"), { device: 'android', theme: 'dark' });
    assert.deepStrictEqual(parseDevice('<body data-od-device="tablet" data-od-orientation="portrait">'), { device: 'tablet', orientation: 'portrait' });
    assert.deepStrictEqual(parseDevice('<body data-od-device="tablet">'), { device: 'tablet', orientation: 'landscape' });
    assert.deepStrictEqual(parseDevice('<body data-od-device="desktop-app" data-od-window="windows">'), { device: 'desktop-app', window: 'windows' });
    assert.deepStrictEqual(parseDevice('<body data-od-device="desktop-app">'), { device: 'desktop-app', window: 'mac' });
    assert.strictEqual(parseDevice('<body data-od-device="watch">'), undefined);
    assert.strictEqual(parseDevice('<body>'), undefined);
    assert.strictEqual(parseDevice('<div data-od-device="iphone"></div>'), undefined);
  });

  it('checks a device screen at its content size, a tablet in both orientations', () => {
    assert.deepStrictEqual(deviceViewports({ device: 'iphone' }), [{ name: 'iphone', width: 390, height: 763 }]);
    assert.deepStrictEqual(
      deviceViewports({ device: 'tablet', orientation: 'portrait' }).map((v) => v.name),
      ['tablet-portrait', 'tablet-landscape'],
    );
    assert.deepStrictEqual(deviceViewports({ device: 'tablet', orientation: 'landscape' })[0], { name: 'tablet-landscape', ...DEVICE_CONTENT_SIZES['tablet-landscape'] });
  });

  it('notices a device screen that draws its own frame', () => {
    assert.strictEqual(drawsOwnFrame('<body data-od-device="iphone"><div class="status-bar">9:41</div>'), true);
    assert.strictEqual(drawsOwnFrame('<body data-od-device="iphone"><div id="dynamic-island"></div>'), true);
    assert.strictEqual(drawsOwnFrame('<body data-od-device="desktop-app"><header class="app titlebar traffic-lights">'), true);
    assert.strictEqual(drawsOwnFrame('<body data-od-device="iphone"><nav class="tab-bar">'), false);
    // Without a device the kit draws nothing, so a drawn frame is the design's own business.
    assert.strictEqual(drawsOwnFrame('<body><div class="device-frame">'), false);
  });

  it('is self-contained, so it can be inlined as source', () => {
    const src = mountDeviceShell.toString();
    assert.match(src, /^function mountDeviceShell\(/);
    // Evaluating the source alone must give a working function (no outside helpers).
    const fn = new Function(`${src}; return mountDeviceShell;`)();
    assert.strictEqual(typeof fn, 'function');
  });

  it('frames device screens in the one-file prototype', () => {
    const html = prototypeShellHtml(
      'Planner',
      [
        { id: 'home', title: 'Home', html: '<!doctype html><body data-od-device="android"><h1>Home</h1></body>' },
        { id: 'web', title: 'Web', html: '<!doctype html><body><h1>Web</h1></body>' },
      ],
      'home',
    );
    assert.match(html, /var devices=\{"home":\{"device":"android"\}\};/);
    assert.match(html, /function mountDeviceShell\(/);
    assert.match(html, /mountDeviceShell\(document,frame,devices\[id\]/);
  });
});

describe('platform answers', () => {
  it('knows Android, tablets and desktop apps', () => {
    assert.strictEqual(parsePlatform('Android phone'), 'android');
    assert.strictEqual(parsePlatform('iPad'), 'tablet');
    assert.strictEqual(parsePlatform('Desktop app (Electron)'), 'desktop-app');
    assert.strictEqual(parsePlatform('Mac app'), 'desktop-app');
    assert.strictEqual(parsePlatform('Desktop web'), 'web');
  });

  it('tells the agent to declare the device and not draw the frame', () => {
    const android = composeScreenSpecSection({ platform: 'Android' });
    assert.match(android, /data-od-device="android"/);
    assert.match(android, /Don't draw any of those yourself/);
    const mac = composeScreenSpecSection({ platform: 'Desktop app' });
    assert.match(mac, /data-od-device="desktop-app"/);
    assert.match(mac, /data-od-window="windows"/);
    assert.doesNotMatch(composeScreenSpecSection({ platform: 'Web' }), /data-od-device/);
  });
});
