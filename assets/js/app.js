/* ============================================================
   Wunvit Stamp Book
   Static, no build step, no runtime CDN. See context.md.
   ============================================================ */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     THE BASES
     `id` is the exact string encoded in the printed QR code (verified by
     decoding qr code/*.png). The map is 1:1 — one code stamps one base and
     can never satisfy another.
     NOTE: `travel_qrcode` had no Thai name in the brief; the name below is
     an assumption and is safe to edit here alone.
     ------------------------------------------------------------------ */
  var BASES = [
    { id: 'food_qrcode',        name: 'ฐานอาหาร',            icon: '🍜' },
    { id: 'health_qrcode',      name: 'ฐานสุขภาพการแพทย์',    icon: '🏥' },
    { id: 'energy_qrcode',      name: 'ฐานพลังงานและวัสดุ',    icon: '⚡' },
    { id: 'environment_qrcode', name: 'ฐานสิ่งแวดล้อม',        icon: '♻️' },
    { id: 'agriculture_qrcode', name: 'ฐานการเกษตร',          icon: '🌱' },
    { id: 'space_qrcode',       name: 'ฐานเทคโนโลยีอวกาศ',    icon: '🚀' },
    { id: 'travel_qrcode',      name: 'ฐานการเดินทางและขนส่ง', icon: '✈️' }
  ];
  var TOTAL = BASES.length;

  var BY_ID = {};
  BASES.forEach(function (b) { BY_ID[b.id.toLowerCase()] = b; });

  var $ = function (id) { return document.getElementById(id); };

  /* ==================================================================
     STORAGE — per device, survives reload and offline.
     Degrades to in-memory if localStorage throws (private mode).
     ================================================================== */
  var STORE_KEY = 'wunvit_stampbook_v1';
  var memoryFallback = null;

  function readStore() {
    if (memoryFallback) return memoryFallback;
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return { v: 1, stamps: {} };
      var data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || typeof data.stamps !== 'object') {
        return { v: 1, stamps: {} };
      }
      return { v: 1, stamps: data.stamps || {} };
    } catch (e) {
      return { v: 1, stamps: {} };
    }
  }

  function writeStore(data) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
      memoryFallback = null;
    } catch (e) {
      // Private mode / quota — keep the session alive in memory instead of dying.
      memoryFallback = data;
    }
  }

  function isStamped(id) { return !!readStore().stamps[id]; }
  function stampedCount() {
    var stamps = readStore().stamps, n = 0;
    BASES.forEach(function (b) { if (stamps[b.id]) n++; });
    return n;
  }
  function addStamp(id) {
    var data = readStore();
    data.stamps[id] = new Date().toISOString();
    writeStore(data);
  }
  function clearStamps() { writeStore({ v: 1, stamps: {} }); }

  /* ==================================================================
     TOAST
     ================================================================== */
  var toastEl = $('toast');
  var toastTimer = null;
  function toast(msg, tone) {
    toastEl.textContent = msg;
    toastEl.setAttribute('data-tone', tone || 'neutral');
    toastEl.hidden = false;
    requestAnimationFrame(function () { toastEl.classList.add('is-open'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('is-open');
      setTimeout(function () { toastEl.hidden = true; }, 240);
    }, 2600);
  }

  /* ==================================================================
     FEEDBACK — short beep + haptics on a decode.
     ================================================================== */
  var audioCtx = null;
  function beep(freq, ms) {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.16, audioCtx.currentTime + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + ms / 1000);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(); osc.stop(audioCtx.currentTime + ms / 1000 + 0.02);
    } catch (e) { /* audio is a nicety, never a blocker */ }
  }
  function buzz(pattern) {
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) {} }
  }

  /* ==================================================================
     LANDING — orbital hero
     Six panels, the two card types alternating three times each, so the
     ring reads full the way the reference's does.
     ================================================================== */
  var CARDS = {
    scan: {
      kicker: 'SCAN QR CODE',
      sub: 'สแกนตราประทับประจำฐาน',
      img: 'assets/img/card-scan.webp',
      href: '#/scan'
    },
    progress: {
      kicker: 'MY PROGRESS',
      sub: 'ดูว่าสะสมไปกี่ฐานแล้ว',
      img: 'assets/img/card-progress.webp',
      href: '#/progress'
    }
  };
  var PANELS = ['scan', 'progress', 'scan', 'progress', 'scan', 'progress'];

  var RADIUS_DESKTOP = 250;
  var RADIUS_MOBILE = 158;
  var BREAKPOINT = 720;
  var DRAG_SENS = 0.32;
  var WHEEL_SENS = 0.05;
  var MAX_VELOCITY = 7;
  var FRICTION = 0.94;
  var DRAG_THRESHOLD = 6;   // px before a press counts as a drag, not a tap
  var TILT_RANGE_X = 18;
  var TILT_RANGE_Y = 22;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  var panelEls = [];
  var landingTally = $('landing-tally');

  function buildRing() {
    var ring = $('orbit-ring');
    ring.innerHTML = '';
    panelEls = [];
    PANELS.forEach(function (type) {
      var c = CARDS[type];
      var a = document.createElement('a');
      a.className = 'orbit-panel';
      a.href = c.href;
      a.setAttribute('aria-label', c.kicker + ' — ' + c.sub);
      a.innerHTML =
        '<img src="' + c.img + '" alt="" draggable="false" />' +
        '<span class="orbit-scrim" aria-hidden="true"></span>' +
        (type === 'progress' ? '<span class="orbit-badge mono" data-role="badge">0/' + TOTAL + '</span>' : '') +
        '<span class="orbit-cap" aria-hidden="true">' +
          '<span class="orbit-kicker">' + c.kicker + '</span>' +
          '<span class="orbit-sub">' + c.sub + '</span>' +
        '</span>';
      ring.appendChild(a);
      panelEls.push(a);
    });
    positionPanels();
  }

  function positionPanels() {
    var r = window.innerWidth <= BREAKPOINT ? RADIUS_MOBILE : RADIUS_DESKTOP;
    var count = panelEls.length;
    panelEls.forEach(function (el, i) {
      var angle = (360 / count) * i;
      var tilt = Math.sin((i / count) * Math.PI * 2) * 6;
      el.style.setProperty('--ry', angle + 'deg');
      el.style.setProperty('--tz', r + 'px');
      el.style.setProperty('--rz', tilt.toFixed(2) + 'deg');
    });
  }

  function initOrbit() {
    var stage = $('orbit-stage');
    var ring = $('orbit-ring');
    var parallax = $('orbit-parallax');
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    buildRing();

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(positionPanels, 200);
    });

    var rotation = 0, velocity = 0;
    var baseDrift = reduced ? 0 : 0.1;
    var dragging = false, lastX = 0, dragDist = 0, wasDrag = false;

    stage.addEventListener('pointerdown', function (e) {
      dragging = true; dragDist = 0; wasDrag = false;
      lastX = e.clientX; velocity = 0;
      stage.classList.add('is-dragging');
    });
    window.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - lastX;
      lastX = e.clientX;
      dragDist += Math.abs(dx);
      if (dragDist > DRAG_THRESHOLD) wasDrag = true;
      var step = dx * DRAG_SENS;
      rotation += step;
      velocity = clamp(step, -MAX_VELOCITY, MAX_VELOCITY);
    });
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      stage.classList.remove('is-dragging');
    }
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    // A spin shouldn't also navigate.
    stage.addEventListener('click', function (e) {
      if (wasDrag) { e.preventDefault(); e.stopPropagation(); wasDrag = false; }
    }, true);

    stage.addEventListener('wheel', function (e) {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        velocity = clamp(velocity + e.deltaX * WHEEL_SENS, -MAX_VELOCITY, MAX_VELOCITY);
      }
    }, { passive: false });

    var targetX = 0, targetY = 0, curX = 0, curY = 0;
    if (!reduced) {
      window.addEventListener('mousemove', function (e) {
        var mx = e.clientX / window.innerWidth - 0.5;
        var my = e.clientY / window.innerHeight - 0.5;
        targetY = mx * TILT_RANGE_Y;
        targetX = -my * TILT_RANGE_X;
      });
    }

    (function frame() {
      if (!dragging) {
        rotation += baseDrift + velocity;
        velocity *= FRICTION;
        if (Math.abs(velocity) < 0.0015) velocity = 0;
      }
      ring.style.transform = 'rotateY(' + rotation.toFixed(3) + 'deg)';
      if (!reduced) {
        curX += (targetX - curX) * 0.06;
        curY += (targetY - curY) * 0.06;
        parallax.style.transform = 'rotateX(' + curX.toFixed(2) + 'deg) rotateY(' + curY.toFixed(2) + 'deg)';
      }
      requestAnimationFrame(frame);
    })();
  }

  /* ==================================================================
     PROGRESS VIEW
     ================================================================== */
  var RING_CIRCUMFERENCE = 2 * Math.PI * 52; // r=52 in the SVG

  function buildStampList() {
    var list = $('stamp-list');
    list.innerHTML = '';
    BASES.forEach(function (b, i) {
      var li = document.createElement('li');
      li.className = 'stamp';
      li.id = 'stamp-' + b.id;
      li.innerHTML =
        '<span class="stamp__icon" aria-hidden="true">' + b.icon + '</span>' +
        '<span class="stamp__main">' +
          '<span class="stamp__name">' + b.name +
            '<svg class="stamp__check" viewBox="0 0 20 20" fill="none" role="img" aria-label="สแกนแล้ว">' +
              '<circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.6"/>' +
              '<path d="M5.8 10.3 8.7 13.1l5.5-6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>' +
            '</svg>' +
          '</span>' +
          '<span class="stamp__meta">' + String(i + 1).padStart(2, '0') + ' · ' + b.id + '</span>' +
        '</span>';
      list.appendChild(li);
    });
  }

  function renderProgress(freshId) {
    var stamps = readStore().stamps;
    var n = stampedCount();

    BASES.forEach(function (b) {
      var li = $('stamp-' + b.id);
      if (!li) return;
      var done = !!stamps[b.id];
      li.classList.toggle('is-done', done);
      var check = li.querySelector('.stamp__check');
      if (check) check.setAttribute('aria-hidden', done ? 'false' : 'true');
      if (done && b.id === freshId) {
        li.classList.remove('is-fresh');
        void li.offsetWidth; // restart the pop
        li.classList.add('is-fresh');
      }
    });

    var pct = n / TOTAL;
    var ring = $('ring-fill');
    if (ring) {
      ring.style.strokeDasharray = RING_CIRCUMFERENCE.toFixed(1);
      ring.style.strokeDashoffset = (RING_CIRCUMFERENCE * (1 - pct)).toFixed(1);
    }
    $('tally-count').textContent = String(n);
    $('tally-total').textContent = '/' + TOTAL;
    document.querySelector('.tally').classList.toggle('is-done', n === TOTAL);
    $('tally-done').hidden = n !== TOTAL;

    // Once every base is collected "สแกนฐานต่อไป" would be a lie, so the primary
    // action becomes the way back out.
    var cta = $('tally-cta');
    if (n === TOTAL) {
      cta.href = '#/';
      cta.textContent = 'กลับหน้าแรก';
    } else {
      cta.href = '#/scan';
      cta.textContent = 'สแกนฐานต่อไป';
    }

    var pmode = $('progress-mode');
    pmode.setAttribute('data-mode', n === TOTAL ? 'ok' : 'live');
    $('progress-mode-label').textContent = n === TOTAL ? 'COMPLETE' : 'IN PROGRESS';

    // shared counters
    $('scan-count').textContent = String(n);
    $('scan-total').textContent = String(TOTAL);
    $('scan-meter').style.width = (pct * 100).toFixed(1) + '%';
    if (landingTally) landingTally.textContent = String(n);
    $('landing-total').textContent = String(TOTAL);
    Array.prototype.forEach.call(document.querySelectorAll('[data-role="badge"]'), function (el) {
      el.textContent = n + '/' + TOTAL;
    });
  }

  /* ==================================================================
     SCANNER
     ================================================================== */
  var video = $('video');
  var camEl = $('cam');
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d', { willReadFrequently: true });

  var stream = null;
  var track = null;
  var detector = null;          // native BarcodeDetector when available
  var detectorBusy = false;
  var running = false;
  var rafId = null;
  var lastTick = 0;
  var cooldownUntil = 0;
  var digitalZoom = 1;          // used only when the camera has no native zoom
  var nativeZoom = false;
  var torchOn = false;

  function setMode(mode, label) {
    var el = $('scan-mode');
    el.setAttribute('data-mode', mode);
    $('scan-mode-label').textContent = label;
  }

  function setResult(state, icon, title, text) {
    $('result').setAttribute('data-state', state);
    $('result-icon').textContent = icon;
    $('result-title').textContent = title;
    $('result-text').textContent = text;
  }

  async function initDetector() {
    if (detector !== null) return;
    try {
      if ('BarcodeDetector' in window) {
        var formats = await window.BarcodeDetector.getSupportedFormats();
        if (formats && formats.indexOf('qr_code') !== -1) {
          detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          return;
        }
      }
    } catch (e) { /* fall through to jsQR */ }
    detector = false; // explicit "no native detector"
  }

  async function startCamera() {
    if (running) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMode('error', 'NO CAMERA');
      setResult('bad', '⚠', 'เบราว์เซอร์นี้เปิดกล้องไม่ได้',
        'ลองเปิดด้วย Chrome หรือ Safari และตรวจว่าเว็บเปิดผ่าน https:// หรือ localhost');
      return;
    }

    var btn = $('btn-camera');
    btn.disabled = true;
    btn.textContent = 'กำลังเปิดกล้อง…';
    setMode('live', 'STARTING');

    try {
      await initDetector();
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          // Ask high: reach on a far-away code is limited by source detail, not
          // by zoom. The browser drops to whatever the camera actually offers.
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });
      video.srcObject = stream;
      await video.play();

      track = stream.getVideoTracks()[0];
      setupZoom();
      setupTorch();

      camEl.classList.add('is-live');
      running = true;
      lastTick = 0;
      cooldownUntil = 0;
      btn.disabled = false;
      btn.textContent = 'ปิดกล้อง';
      setMode('live', 'SCANNING');
      setResult('idle', '◎', 'กำลังสแกน…', 'เล็ง QR code ของฐานให้อยู่ในกรอบ ถ้าอยู่ไกลให้เลื่อนซูมเข้ามา');
      rafId = requestAnimationFrame(tick);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'เปิดกล้อง';
      setMode('error', 'DENIED');
      var name = err && err.name ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setResult('bad', '⚠', 'ยังไม่ได้อนุญาตให้ใช้กล้อง',
          'กดอนุญาตการใช้กล้องในเบราว์เซอร์ แล้วกดเปิดกล้องอีกครั้ง (เว็บต้องเปิดผ่าน https:// หรือ localhost)');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setResult('bad', '⚠', 'ไม่พบกล้องบนอุปกรณ์นี้', 'ลองใช้อุปกรณ์ที่มีกล้องหลัง');
      } else {
        setResult('bad', '⚠', 'เปิดกล้องไม่สำเร็จ', 'ลองปิดแอปอื่นที่ใช้กล้องอยู่ แล้วลองใหม่อีกครั้ง');
      }
    }
  }

  function stopCamera() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (stream) {
      stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
      stream = null;
    }
    track = null;
    torchOn = false;
    video.srcObject = null;
    camEl.classList.remove('is-live');
    $('zoom-wrap').hidden = true;
    $('btn-torch').hidden = true;
    $('btn-camera').disabled = false;
    $('btn-camera').textContent = 'เปิดกล้อง';
    setMode('idle', 'STANDBY');
  }

  /* ---- zoom: native optical where the track exposes it, digital crop
     otherwise. The digital path crops the decode region too, so zooming
     actually enlarges the QR the decoder sees — not just the picture. ---- */
  function setupZoom() {
    var wrap = $('zoom-wrap');
    var range = $('zoom');
    nativeZoom = false;
    digitalZoom = 1;
    video.style.transform = 'scale(1)';

    var caps = null;
    try { caps = track.getCapabilities ? track.getCapabilities() : null; } catch (e) {}

    if (caps && caps.zoom && caps.zoom.max > caps.zoom.min) {
      nativeZoom = true;
      range.min = caps.zoom.min;
      range.max = caps.zoom.max;
      range.step = caps.zoom.step || (caps.zoom.max - caps.zoom.min) / 40;
      var settings = {};
      try { settings = track.getSettings ? track.getSettings() : {}; } catch (e) {}
      range.value = settings.zoom != null ? settings.zoom : caps.zoom.min;
    } else {
      range.min = 1; range.max = 4; range.step = 0.1; range.value = 1;
    }
    wrap.hidden = false;
    applyZoom();
  }

  function applyZoom() {
    var range = $('zoom');
    var v = parseFloat(range.value);
    if (nativeZoom) {
      var min = parseFloat(range.min) || 1;
      $('zoom-value').textContent = (v / (min || 1)).toFixed(1) + '×';
      try { track.applyConstraints({ advanced: [{ zoom: v }] }); } catch (e) {}
    } else {
      digitalZoom = v;
      video.style.transform = 'scale(' + v + ')';
      $('zoom-value').textContent = v.toFixed(1) + '×';
    }
  }

  function setupTorch() {
    var btn = $('btn-torch');
    var caps = null;
    try { caps = track.getCapabilities ? track.getCapabilities() : null; } catch (e) {}
    if (caps && caps.torch) {
      btn.hidden = false;
      btn.textContent = 'เปิดไฟฉาย';
    } else {
      btn.hidden = true;
    }
  }

  function toggleTorch() {
    if (!track) return;
    torchOn = !torchOn;
    try {
      track.applyConstraints({ advanced: [{ torch: torchOn }] });
      $('btn-torch').textContent = torchOn ? 'ปิดไฟฉาย' : 'เปิดไฟฉาย';
    } catch (e) {
      torchOn = false;
    }
  }

  /* Source rectangle to decode from: what the viewport actually shows
     (object-fit: cover crop) narrowed by the digital zoom factor. */
  function sourceRect() {
    var vw = video.videoWidth, vh = video.videoHeight;
    var box = camEl.getBoundingClientRect();
    var sw = vw, sh = vh;
    if (box.width > 0 && box.height > 0) {
      var scale = Math.max(box.width / vw, box.height / vh);
      sw = Math.min(vw, box.width / scale);
      sh = Math.min(vh, box.height / scale);
    }
    sw = sw / digitalZoom;
    sh = sh / digitalZoom;
    return { sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw: sw, sh: sh };
  }

  function drawFrame() {
    var r = sourceRect();
    if (!(r.sw > 0 && r.sh > 0)) return false;
    // Big enough not to throw away source detail on a 1080p stream (which is
 // what actually decides whether a distant code reads), small enough that the
 // jsQR fallback still keeps up on an older phone.
    var maxDim = 900;
    var k = Math.min(1, maxDim / Math.max(r.sw, r.sh));
    canvas.width = Math.max(2, Math.round(r.sw * k));
    canvas.height = Math.max(2, Math.round(r.sh * k));
    ctx.drawImage(video, r.sx, r.sy, r.sw, r.sh, 0, 0, canvas.width, canvas.height);
    return true;
  }

  function tick(now) {
    if (!running) return;
    rafId = requestAnimationFrame(tick);

    if (now - lastTick < 110) return;    // ~9 decode attempts / second
    lastTick = now;
    if (now < cooldownUntil) return;
    if (video.readyState < 2 || !video.videoWidth) return;
    if (!drawFrame()) return;

    if (detector) {
      if (detectorBusy) return;
      detectorBusy = true;
      detector.detect(canvas).then(function (codes) {
        detectorBusy = false;
        if (codes && codes.length) handleCode(codes[0].rawValue);
      }).catch(function () {
        detectorBusy = false;
        detector = false;            // native path failed — fall back for good
      });
      return;
    }

    if (typeof jsQR !== 'function') return;
    var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var res = jsQR(img.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
    if (res && res.data) handleCode(res.data);
  }

  var lastHandled = '';
  function handleCode(raw) {
    var text = String(raw || '').trim();
    if (!text) return;

    // Pause so one code can't fire twice inside a frame burst.
    cooldownUntil = performance.now() + 1500;

    var base = BY_ID[text.toLowerCase()];

    if (!base) {
      if (text !== lastHandled) buzz([40, 60, 40]);
      lastHandled = text;
      setMode('error', 'NO MATCH');
      setResult('bad', '✕', 'QR code นี้ไม่ใช่ของฐานกิจกรรม',
        'ที่อ่านได้คือ “' + (text.length > 40 ? text.slice(0, 40) + '…' : text) + '” — กรุณาสแกน QR code ประจำฐานอีกครั้ง');
      toast('ไม่ใช่ QR code ของฐาน — สแกนใหม่อีกครั้ง', 'bad');
      beep(200, 160);
      return;
    }

    if (isStamped(base.id)) {
      lastHandled = text;
      setMode('warn', 'DUPLICATE');
      setResult('dup', '↺', base.name + ' — สแกนไปแล้ว',
        'ฐานนี้ถูกประทับตราเรียบร้อยแล้ว ไปสแกนฐานอื่นที่ยังไม่ได้เก็บได้เลย');
      toast(base.name + ' สแกนไปแล้ว', 'warn');
      beep(340, 140);
      buzz(60);
      return;
    }

    addStamp(base.id);
    lastHandled = text;
    renderProgress(base.id);
    var n = stampedCount();
    camEl.classList.remove('is-hit');
    void camEl.offsetWidth;
    camEl.classList.add('is-hit');
    setMode('ok', 'STAMPED');
    if (n === TOTAL) {
      setResult('ok', '★', base.name + ' — ครบทุกฐานแล้ว!',
        'เก็บครบทั้ง ' + TOTAL + ' ฐานเรียบร้อย เก่งมาก 🎉');
      toast('เก็บครบทั้ง ' + TOTAL + ' ฐานแล้ว 🎉', 'ok');
      beep(660, 120); setTimeout(function () { beep(880, 180); }, 130);
      buzz([60, 50, 60, 50, 120]);
    } else {
      setResult('ok', '✓', base.name + ' — ประทับตราแล้ว',
        'สะสมแล้ว ' + n + ' จาก ' + TOTAL + ' ฐาน เหลืออีก ' + (TOTAL - n) + ' ฐาน');
      toast('ประทับตรา ' + base.name + ' แล้ว', 'ok');
      beep(760, 130);
      buzz(80);
    }
  }

  /* ==================================================================
     ROUTER
     ================================================================== */
  var VIEWS = { '/': 'view-landing', '/scan': 'view-scan', '/progress': 'view-progress' };

  function route() {
    var hash = (location.hash || '#/').replace(/^#/, '');
    if (!VIEWS[hash]) hash = '/';

    Object.keys(VIEWS).forEach(function (path) {
      $(VIEWS[path]).hidden = path !== hash;
    });
    document.body.setAttribute('data-route', hash === '/' ? 'landing' : 'page');
    window.scrollTo(0, 0);

    if (hash !== '/scan' && running) stopCamera();
    renderProgress();

    if (hash === '/scan') {
      setMode('idle', 'STANDBY');
      maybeAutoStart();
    }
  }

  /* Once a kid has allowed the camera at the first base, coming back to scan
     the next one shouldn't make them press the button again. Only auto-starts
     when the permission is already granted — otherwise the button supplies the
     user gesture browsers require before prompting. */
  function maybeAutoStart() {
    if (running) return;
    if (!navigator.permissions || !navigator.permissions.query) return;
    navigator.permissions.query({ name: 'camera' }).then(function (status) {
      if (status.state === 'granted' && !running && location.hash === '#/scan') {
        startCamera();
      }
    }).catch(function () { /* Firefox/Safari don't expose it — button it is */ });
  }

  /* ==================================================================
     BOOT
     ================================================================== */
  buildStampList();
  initOrbit();

  $('btn-camera').addEventListener('click', function () {
    if (running) stopCamera(); else startCamera();
  });
  $('zoom').addEventListener('input', applyZoom);
  $('btn-torch').addEventListener('click', toggleTorch);

  $('btn-reset').addEventListener('click', function () {
    if (stampedCount() === 0) { toast('ยังไม่มีตราประทับให้ล้าง', 'warn'); return; }
    if (!window.confirm('ล้างตราประทับทั้งหมดของเครื่องนี้ใช่ไหม? การกระทำนี้ย้อนกลับไม่ได้')) return;
    clearStamps();
    lastHandled = '';
    renderProgress();
    toast('ล้างความคืบหน้าเรียบร้อย', 'warn');
  });

  // Don't leave the camera running in a backgrounded tab.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && running) stopCamera();
  });

  window.addEventListener('hashchange', route);
  route();
})();
