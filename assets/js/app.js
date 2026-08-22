/* ============================================================
   Wunvit PASSPORT
   Static, no build step, no runtime CDN. See context.md.
   ============================================================ */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     THE STATIONS
     `id` is the exact string encoded in the printed QR code (every one of
     them verified by decoding `qr code/*.png`). The map is 1:1 — one code
     stamps one station and can never satisfy another.

     Two groups, each with its own threshold, exactly as the passport states:
       - ฐานกิจกรรมวิชาเอก              ต้องได้อย่างน้อย 5 แสตมป์
       - ฐานนวัตกรรมและนิทรรศการ        ต้องได้อย่างน้อย 3 แสตมป์
     Change `need` here and every counter, meter and rule text follows.
     ------------------------------------------------------------------ */
  var GROUPS = [
    { key: 'major',      label: 'ฐานกิจกรรมวิชาเอก',            need: 5 },
    { key: 'innovation', label: 'ฐานนวัตกรรมและนิทรรศการแสดงผลงาน', need: 3 }
  ];

  var BASES = [
    // ---- ฐานกิจกรรมวิชาเอก (11) ----
    { id: 'gh_qrcode',   group: 'major', code: 'GH',   name: 'ฐานกิจกรรมวิชาเอก GH' },
    { id: 'gi_qrcode',   group: 'major', code: 'GI',   name: 'ฐานกิจกรรมวิชาเอก GI' },
    { id: 'sg_qrcode',   group: 'major', code: 'SG',   name: 'ฐานกิจกรรมวิชาเอก SG' },
    { id: 'sa_qrcode',   group: 'major', code: 'SA',   name: 'ฐานกิจกรรมวิชาเอก SA' },
    { id: 'ht_qrcode',   group: 'major', code: 'HT',   name: 'ฐานกิจกรรมวิชาเอก HT' },
    { id: 'hs_qrcode',   group: 'major', code: 'HS',   name: 'ฐานกิจกรรมวิชาเอก HS' },
    { id: 'hp_qrcode',   group: 'major', code: 'HP',   name: 'ฐานกิจกรรมวิชาเอก HP' },
    { id: 'ha_qrcode',   group: 'major', code: 'HA',   name: 'ฐานกิจกรรมวิชาเอก HA' },
    { id: 'da_qrcode',   group: 'major', code: 'DA',   name: 'ฐานกิจกรรมวิชาเอก DA' },
    { id: 'hdci_qrcode', group: 'major', code: 'HDCI', name: 'ฐานกิจกรรมวิชาเอก HDCI' },
    { id: 'spb_qrcode',  group: 'major', code: 'SPB',  name: 'ฐานกิจกรรมวิชาเอก SPB' },

    // ---- ฐานนวัตกรรมและนิทรรศการแสดงผลงาน (8) ----
    { id: 'space_qrcode',       group: 'innovation', icon: '🚀', name: 'ฐานนวัตกรรมด้านเทคโนโลยีและอวกาศ' },
    { id: 'environment_qrcode', group: 'innovation', icon: '♻️', name: 'ฐานนวัตกรรมด้านสิ่งแวดล้อม' },
    { id: 'agriculture_qrcode', group: 'innovation', icon: '🌱', name: 'ฐานนวัตกรรมด้านการเกษตร' },
    { id: 'energy_qrcode',      group: 'innovation', icon: '⚡', name: 'ฐานนวัตกรรมด้านพลังงานและวัสดุ' },
    { id: 'health_qrcode',      group: 'innovation', icon: '🏥', name: 'ฐานนวัตกรรมด้านสุขภาพและการแพทย์' },
    { id: 'travel_qrcode',      group: 'innovation', icon: '✈️', name: 'ฐานการท่องเที่ยว' },
    { id: 'food_qrcode',        group: 'innovation', icon: '🍜', name: 'ฐานนวัตกรรมด้านอาหาร' },
    { id: 'exhibition_qrcode',  group: 'innovation', icon: '🏛️', name: 'นิทรรศการแสดงผลงาน' }
  ];
  var TOTAL = BASES.length;

  var BY_ID = {};
  BASES.forEach(function (b) { BY_ID[b.id.toLowerCase()] = b; });

  function groupBases(key) {
    return BASES.filter(function (b) { return b.group === key; });
  }
  function groupDef(key) {
    for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i].key === key) return GROUPS[i];
    return null;
  }

  var $ = function (id) { return document.getElementById(id); };

  /* ==================================================================
     STORAGE — per device, survives reload and offline.
     Degrades to in-memory if localStorage throws (private mode).
     ================================================================== */
  var STORE_KEY = 'wunvit_stampbook_v1';   // key kept so existing devices carry over
  var memoryFallback = null;

  function readStore() {
    if (memoryFallback) return memoryFallback;
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return { v: 2, stamps: {} };
      var data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || typeof data.stamps !== 'object') {
        return { v: 2, stamps: {} };
      }
      return { v: 2, stamps: data.stamps || {} };
    } catch (e) {
      return { v: 2, stamps: {} };
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

  function countIn(key) {
    var stamps = readStore().stamps, n = 0;
    groupBases(key).forEach(function (b) { if (stamps[b.id]) n++; });
    return n;
  }
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
  /* Every group at or above its threshold. */
  function isEligible() {
    return GROUPS.every(function (g) { return countIn(g.key) >= g.need; });
  }

  /* ==================================================================
     NOTIFICATIONS
     A LINE/Discord-style card that slides in at the top of the screen and
     leaves on its own. Several can stack; the oldest is dropped so a burst
     of scans can never bury the page.
     ================================================================== */
  var notifHost = $('notif-host');
  var NOTIF_MAX = 3;
  var NOTIF_MS = 3400;

  var NOTIF_ICON = { ok: '✓', warn: '↺', bad: '✕', neutral: '•' };

  /* Holding the camera on a code the kid already scanned re-fires every time
     the cooldown lapses. Messaging apps don't restack an identical card, so
     the same message inside this window is swallowed. */
  var NOTIF_DEDUPE_MS = 6000;
  var lastNotifKey = '';
  var lastNotifAt = 0;

  function notify(title, body, tone) {
    tone = tone || 'neutral';

    var key = tone + '|' + title + '|' + (body || '');
    var now = Date.now();
    if (key === lastNotifKey && now - lastNotifAt < NOTIF_DEDUPE_MS) return null;
    lastNotifKey = key;
    lastNotifAt = now;

    var el = document.createElement('div');
    el.className = 'notif';
    el.setAttribute('data-tone', tone);
    el.innerHTML =
      '<span class="notif__icon" aria-hidden="true">' + (NOTIF_ICON[tone] || '•') + '</span>' +
      '<span class="notif__main">' +
        '<span class="notif__title"></span>' +
        (body ? '<span class="notif__body"></span>' : '') +
      '</span>' +
      '<button class="notif__x" type="button" aria-label="ปิดการแจ้งเตือน">×</button>' +
      '<span class="notif__bar" aria-hidden="true"></span>';

    // textContent, not innerHTML — a decoded QR payload is untrusted input and
    // goes straight into the body of the "no match" notification.
    el.querySelector('.notif__title').textContent = title;
    if (body) el.querySelector('.notif__body').textContent = body;

    var timer = null;
    function dismiss() {
      if (!el.parentNode) return;
      clearTimeout(timer);
      el.classList.add('is-out');
      el.addEventListener('transitionend', function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, { once: true });
      // transitionend never fires if the element is already display:none
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 400);
    }
    el.querySelector('.notif__x').addEventListener('click', dismiss);

    notifHost.appendChild(el);
    while (notifHost.children.length > NOTIF_MAX) {
      notifHost.removeChild(notifHost.firstChild);
    }

    // next frame, so the entry transition actually runs
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { el.classList.add('is-in'); });
    });

    timer = setTimeout(dismiss, NOTIF_MS);
    return el;
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
     TIME HELPERS
     ================================================================== */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hhmm(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '-';
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /* ==================================================================
     LANDING — orbital hero
     Six panels, the three card types twice each, so the ring reads full
     the way the reference's does.
     ================================================================== */
  var CARDS = {
    scan: {
      kicker: 'SCAN QR CODE',
      sub: 'แสกน QR ประจำฐาน',
      img: 'assets/img/card-scan.webp',
      href: '#/scan'
    },
    progress: {
      kicker: 'MY PROGRESS',
      sub: 'ดูว่าสะสมไปกี่แสตมป์แล้ว',
      img: 'assets/img/card-progress.webp',
      href: '#/progress'
    },
    reward: {
      kicker: 'REWARD',
      sub: 'กติกาการรับรางวัล',
      img: 'assets/img/card-reward.webp',
      href: '#/reward'
    },
    event: {
      kicker: 'EVENT',
      sub: 'รายละเอียดกิจกรรม',
      img: 'assets/img/card-schedule.webp',
      href: '#/event'
    }
  };
  // Four types across eight panels, each type twice — same trick as before, the
  // ring just needs more panels now to keep reading full.
  var PANELS = ['scan', 'progress', 'reward', 'event', 'scan', 'progress', 'reward', 'event'];

  // Eight panels need a wider ring than six did: at r=250 the arc per panel
  // (~196px) was narrower than the panel itself (172px), so they overlapped.
  var RADIUS_DESKTOP = 325;
  var RADIUS_MOBILE = 200;
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
        (type === 'reward' ? '<span class="orbit-badge mono" data-role="reward-badge" hidden>ผ่านเกณฑ์</span>' : '') +
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
     STATIC LISTS — built once
     ================================================================== */
  var RING_CIRCUMFERENCE = 2 * Math.PI * 52; // r=52 in the SVG

  var CHECK_SVG =
    '<svg class="stamp__check" viewBox="0 0 20 20" fill="none" role="img" aria-label="สแกนแล้ว">' +
      '<circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.6"/>' +
      '<path d="M5.8 10.3 8.7 13.1l5.5-6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';

  function buildStampGroups() {
    var host = $('stamp-groups');
    host.innerHTML = '';
    GROUPS.forEach(function (g) {
      var wrap = document.createElement('section');
      wrap.className = 'grp';
      var rows = groupBases(g.key).map(function (b) {
        var badge = b.code
          ? '<span class="stamp__icon stamp__icon--code mono" aria-hidden="true">' + b.code + '</span>'
          : '<span class="stamp__icon" aria-hidden="true">' + b.icon + '</span>';
        return '<li class="stamp" id="stamp-' + b.id + '">' +
          badge +
          '<span class="stamp__main"><span class="stamp__name">' + b.name + CHECK_SVG + '</span></span>' +
        '</li>';
      }).join('');
      wrap.innerHTML =
        '<header class="grp__head">' +
          '<p class="kicker">' + g.label + '</p>' +
          '<span class="grp__count mono" data-role="grp-count" data-group="' + g.key + '">0/' + g.need + '</span>' +
        '</header>' +
        '<ul class="stamp-list">' + rows + '</ul>';
      host.appendChild(wrap);
    });
  }

  function buildRuleList() {
    var ol = $('rulelist');
    ol.innerHTML = GROUPS.map(function (g) {
      return '<li><b>' + g.label + '</b> ต้องได้อย่างน้อย <b>' + g.need + ' แสตมป์</b>' +
             ' <span class="rulelist__of">(มีทั้งหมด ' + groupBases(g.key).length + ' ฐาน)</span></li>';
    }).join('') +
    '<li>ครบทั้งสองเกณฑ์แล้ว นำหน้าจอ <b>บัตรรับรางวัล</b> ไปแสดงที่จุดแลกรางวัลบริเวณกองกลาง</li>';
  }

  /* Criteria rows, rendered into any container that asks for them. */
  function buildCritList(host) {
    host.innerHTML = GROUPS.map(function (g) {
      return '<div class="crit" data-group="' + g.key + '">' +
        '<div class="crit__top">' +
          '<span class="crit__label">' + g.label + '</span>' +
          '<span class="crit__count mono"><b>0</b>/' + g.need + '</span>' +
        '</div>' +
        '<div class="meter"><span class="meter__fill"></span></div>' +
      '</div>';
    }).join('');
  }

  /* ==================================================================
     RENDER
     ================================================================== */
  function renderAll(freshId) {
    var stamps = readStore().stamps;
    var n = stampedCount();
    var eligible = isEligible();

    /* ---- stamp rows ---- */
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

    /* ---- per-group counters and criteria meters ---- */
    GROUPS.forEach(function (g) {
      var got = countIn(g.key);
      var pass = got >= g.need;

      Array.prototype.forEach.call(
        document.querySelectorAll('[data-role="grp-count"][data-group="' + g.key + '"]'),
        function (el) {
          el.textContent = got + '/' + g.need;
          el.classList.toggle('is-pass', pass);
        });

      Array.prototype.forEach.call(
        document.querySelectorAll('.crit[data-group="' + g.key + '"]'),
        function (el) {
          el.classList.toggle('is-pass', pass);
          el.querySelector('.crit__count b').textContent = String(got);
          el.querySelector('.meter__fill').style.width =
            Math.min(100, (got / g.need) * 100).toFixed(1) + '%';
        });
    });

    /* ---- overall ring ---- */
    var ring = $('ring-fill');
    if (ring) {
      ring.style.strokeDasharray = RING_CIRCUMFERENCE.toFixed(1);
      ring.style.strokeDashoffset = (RING_CIRCUMFERENCE * (1 - n / TOTAL)).toFixed(1);
    }
    $('tally-count').textContent = String(n);
    $('tally-total').textContent = '/' + TOTAL;
    document.querySelector('.tally').classList.toggle('is-done', eligible);
    $('tally-done').hidden = !eligible;

    /* ---- progress CTA: "next station" is a lie once the criteria are met ---- */
    var cta = $('tally-cta');
    if (eligible) { cta.href = '#/reward'; cta.textContent = 'ดูบัตรรับรางวัล'; }
    else          { cta.href = '#/scan';   cta.textContent = 'สแกนฐานต่อไป'; }

    /* ---- mode chips ---- */
    var pmode = $('progress-mode');
    pmode.setAttribute('data-mode', eligible ? 'ok' : 'live');
    $('progress-mode-label').textContent = eligible ? 'ELIGIBLE' : 'IN PROGRESS';

    var rmode = $('reward-mode');
    rmode.setAttribute('data-mode', eligible ? 'ok' : 'warn');
    $('reward-mode-label').textContent = eligible ? 'ELIGIBLE' : 'NOT YET';

    /* ---- landing ---- */
    $('landing-tally').textContent = GROUPS.map(function (g) {
      return (g.key === 'major' ? 'วิชาเอก ' : 'นวัตกรรม ') + countIn(g.key) + '/' + g.need;
    }).join(' · ');
    Array.prototype.forEach.call(document.querySelectorAll('[data-role="badge"]'), function (el) {
      el.textContent = n + '/' + TOTAL;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-role="reward-badge"]'), function (el) {
      el.hidden = !eligible;
    });

    renderVerify();
  }

  /* ==================================================================
     THE REWARD CARD
     Shown only once both thresholds are met. It states the counts, the span
     the scans cover, and the full log with real times — enough for a teacher
     at the prize desk to see the work actually happened over the event rather
     than in one burst.
     ================================================================== */
  function scanLog() {
    var stamps = readStore().stamps;
    return BASES
      .filter(function (b) { return stamps[b.id]; })
      .map(function (b) { return { name: b.name, at: stamps[b.id] }; })
      .sort(function (a, b) { return a.at < b.at ? -1 : 1; });
  }

  function renderVerify() {
    var eligible = isEligible();
    $('verify').setAttribute('data-state', eligible ? 'open' : 'locked');
    $('verify-locked').hidden = eligible;
    $('verify-open').hidden = !eligible;

    if (!eligible) {
      var missing = GROUPS
        .filter(function (g) { return countIn(g.key) < g.need; })
        .map(function (g) { return g.label + ' อีก ' + (g.need - countIn(g.key)) + ' แสตมป์'; });
      $('verify-need').textContent = 'ยังขาด ' + missing.join(' และ ');
      return;
    }

    var log = scanLog();
    // The requirement sits in the label so the value is just "how many, enough?".
    $('verify-major-k').textContent = 'วิชาเอก (ต้อง ' + groupDef('major').need + ')';
    $('verify-innovation-k').textContent = 'นวัตกรรม/นิทรรศการ (ต้อง ' + groupDef('innovation').need + ')';
    $('verify-major').textContent = countIn('major') + ' ✓';
    $('verify-innovation').textContent = countIn('innovation') + ' ✓';
    $('verify-span').textContent = log.length
      ? hhmm(log[0].at) + ' – ' + hhmm(log[log.length - 1].at)
      : '-';
    $('verify-log-count').textContent = String(log.length);
    $('verify-log').innerHTML = log.map(function (r) {
      return '<li><span>' + r.name + '</span><span class="mono">' + hhmm(r.at) + '</span></li>';
    }).join('');
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
      setResult('idle', '◎', 'กำลังสแกน…', 'เล็ง QR ของฐานให้อยู่ในกรอบ ถ้าอยู่ไกลให้เลื่อนซูมเข้ามา');
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
    // what actually decides whether a distant code reads), small enough that
    // the jsQR fallback still keeps up on an older phone.
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
      var short = text.length > 40 ? text.slice(0, 40) + '…' : text;
      setResult('bad', '✕', 'QR นี้ไม่ใช่ของฐานกิจกรรม',
        'ที่อ่านได้คือ “' + short + '” — กรุณาสแกน QR ประจำฐานอีกครั้ง');
      notify('ไม่ใช่ QR ของฐาน', 'ที่อ่านได้: ' + short, 'bad');
      beep(200, 160);
      return;
    }

    if (isStamped(base.id)) {
      lastHandled = text;
      setMode('warn', 'DUPLICATE');
      setResult('dup', '↺', base.name + ' — สแกนไปแล้ว',
        'ฐานนี้ได้แสตมป์เรียบร้อยแล้ว ไปสแกนฐานอื่นที่ยังไม่ได้เก็บได้เลย');
      notify('สแกนฐานนี้ไปแล้ว', base.name, 'warn');
      beep(340, 140);
      buzz(60);
      return;
    }

    var wasEligible = isEligible();
    addStamp(base.id);
    lastHandled = text;
    renderAll(base.id);

    camEl.classList.remove('is-hit');
    void camEl.offsetWidth;
    camEl.classList.add('is-hit');
    setMode('ok', 'STAMPED');

    var g = groupDef(base.group);
    var got = countIn(base.group);

    if (!wasEligible && isEligible()) {
      setResult('ok', '★', base.name + ' — ผ่านเกณฑ์รับรางวัลแล้ว!',
        'ครบทั้งสองเกณฑ์เรียบร้อย เปิดหน้า “กติกาการรับรางวัล” เพื่อแสดงบัตรให้คุณครู');
      notify('ผ่านเกณฑ์รับรางวัลแล้ว 🎉', 'เปิดการ์ด “กติกาการรับรางวัล” เพื่อแสดงบัตรให้คุณครู', 'ok');
      beep(660, 120); setTimeout(function () { beep(880, 180); }, 130);
      buzz([60, 50, 60, 50, 120]);
    } else if (got >= g.need) {
      setResult('ok', '✓', base.name + ' — ได้แสตมป์แล้ว',
        g.label + ' ครบเกณฑ์แล้ว (' + got + '/' + g.need + ')');
      notify('ได้แสตมป์แล้ว +1', base.name + ' · ' + g.label + ' ครบเกณฑ์แล้ว', 'ok');
      beep(760, 130);
      buzz(80);
    } else {
      setResult('ok', '✓', base.name + ' — ได้แสตมป์แล้ว',
        g.label + ' ' + got + '/' + g.need + ' — เหลืออีก ' + (g.need - got) + ' แสตมป์');
      notify('ได้แสตมป์แล้ว +1', base.name + ' · ' + g.label + ' ' + got + '/' + g.need, 'ok');
      beep(760, 130);
      buzz(80);
    }
  }

  /* ==================================================================
     ROUTER
     ================================================================== */
  var VIEWS = {
    '/': 'view-landing',
    '/scan': 'view-scan',
    '/progress': 'view-progress',
    '/reward': 'view-reward',
    '/event': 'view-event'
  };

  function route() {
    var hash = (location.hash || '#/').replace(/^#/, '');
    if (!VIEWS[hash]) hash = '/';

    Object.keys(VIEWS).forEach(function (path) {
      $(VIEWS[path]).hidden = path !== hash;
    });
    document.body.setAttribute('data-route', hash === '/' ? 'landing' : 'page');
    window.scrollTo(0, 0);

    if (hash !== '/scan' && running) stopCamera();
    renderAll();

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
  buildStampGroups();
  buildRuleList();
  buildCritList($('progress-crit'));
  buildCritList($('scan-crit'));
  initOrbit();

  $('btn-camera').addEventListener('click', function () {
    if (running) stopCamera(); else startCamera();
  });
  $('zoom').addEventListener('input', applyZoom);
  $('btn-torch').addEventListener('click', toggleTorch);

  /* Poster lightbox. The <img> already on the page carries the source, so the
     single-file build's data: URI is reused rather than re-fetched. */
  (function () {
    var box = $('lightbox'), img = $('lightbox-img');
    function close() { box.hidden = true; img.removeAttribute('src'); document.body.style.overflow = ''; }
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.poster');
      if (!btn) return;
      var inner = btn.querySelector('img');
      if (!inner) return;
      img.src = inner.currentSrc || inner.src;
      img.alt = inner.alt || '';
      box.hidden = false;
      document.body.style.overflow = 'hidden';
    });
    $('lightbox-close').addEventListener('click', close);
    box.addEventListener('click', function (e) { if (e.target === box) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !box.hidden) close(); });
  })();

  // Don't leave the camera running in a backgrounded tab.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && running) stopCamera();
  });

  window.addEventListener('hashchange', route);
  route();
})();
