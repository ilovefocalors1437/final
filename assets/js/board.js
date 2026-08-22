/* ============================================================
   PASSPORT — กระดาน "บอกเล่าความรู้สึก"
   ------------------------------------------------------------
   ข้อความล้วน ไม่มีรูป (ตั้งใจ — ตัดความเสี่ยงเรื่องรูปไม่เหมาะสม
   ในงานที่ผู้ใช้เป็นเด็กออกไปทั้งหมด)

   คุยกับ Supabase ผ่าน REST ตรงๆ ไม่โหลด SDK เลย เพราะทั้งเว็บนี้
   ยึดหลัก "ไม่ดึงอะไรจาก CDN ตอนรัน" อยู่แล้ว

   เรื่องโหมดแอดมิน: ในไฟล์นี้ไม่มีทั้งสตริงลับและเลขประจำตัวของแอดมิน
   มีแค่กติกาว่า "ถ้าสิ่งที่พิมพ์ไม่ใช่เลข 6 หลัก ให้ลองส่งไปถาม server"
   ตัวความลับอยู่ในตารางที่ anon อ่านไม่ได้ ฝั่ง Supabase เท่านั้น
   ============================================================ */
(function () {
  'use strict';

  /* anon / publishable key ถูกออกแบบมาให้เปิดเผยได้ สิ่งที่กันจริงคือ RLS
     ห้ามเอา service_role / sb_secret_ มาใส่ตรงนี้เด็ดขาด */
  var SUPABASE_URL = 'https://xieizmzniwwokwacbjuq.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_ICfckiY0JbaJmUMYh6loIg_FGcyHry_';

  var CONFIGURED = !!(SUPABASE_URL && SUPABASE_KEY);

  var MAX_LEN = 500;
  var POLL_MS = 15000;
  var MAX_INDENT = 5;      // ซ้อนได้ไม่จำกัด แต่หยุดเยื้องหลังชั้นที่ 5 กันล้นจอมือถือ

  var ID_KEY    = 'wunvit_student_id';
  var ADMIN_KEY = 'wunvit_admin_secret';

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- เก็บค่าในเครื่อง ---------- */
  function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  function studentId() { return lsGet(ID_KEY); }
  function adminSecret() { return lsGet(ADMIN_KEY); }
  function isAdmin() { return !!adminSecret(); }

  /* ---------- REST ---------- */
  function headers(extra) {
    var h = {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json'
    };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }

  function listPosts() {
    var url = SUPABASE_URL + '/rest/v1/posts'
            + '?select=id,student_id,body,parent_id,pinned,created_at'
            + '&order=created_at.desc&limit=500';
    return fetch(url, { headers: headers() }).then(function (r) {
      if (!r.ok) throw new Error('โหลดไม่สำเร็จ (' + r.status + ')');
      return r.json();
    });
  }

  function createPost(body, parentId) {
    var row = { student_id: studentId(), body: body };
    if (parentId) row.parent_id = parentId;
    return fetch(SUPABASE_URL + '/rest/v1/posts', {
      method: 'POST',
      headers: headers({ 'Prefer': 'return=minimal' }),
      body: JSON.stringify(row)
    }).then(function (r) {
      if (r.ok) return true;
      return r.text().then(function (t) {
        if (t.indexOf('posting too fast') !== -1) throw new Error('พิมพ์ถี่เกินไป รอสักครู่แล้วลองใหม่');
        if (r.status === 401 || r.status === 403) throw new Error('ยังไม่ได้ตั้งค่าสิทธิ์ใน Supabase');
        throw new Error('ส่งไม่สำเร็จ (' + r.status + ')');
      });
    });
  }

  /* ส่งสิ่งที่ผู้ใช้พิมพ์ไปถาม server ว่าเป็นรหัสแอดมินไหม
     ถ้าใช่ server จะคืนเลขประจำตัวที่ใช้แสดงกลับมา */
  function tryAdminLogin(secret) {
    return fetch(SUPABASE_URL + '/rest/v1/rpc/admin_login', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ p_secret: secret })
    }).then(function (r) {
      if (!r.ok) return null;
      return r.json().then(function (v) {
        return (typeof v === 'string' && /^[0-9]{6}$/.test(v)) ? v : null;
      });
    }).catch(function () { return null; });
  }

  function moderate(postId, action) {
    return fetch(SUPABASE_URL + '/rest/v1/rpc/admin_moderate', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ p_secret: adminSecret(), p_post_id: postId, p_action: action })
    }).then(function (r) {
      if (r.ok) return true;
      throw new Error('ทำรายการไม่สำเร็จ (' + r.status + ')');
    });
  }

  /* ---------- เวลา ---------- */
  function ago(iso) {
    var t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return 'เมื่อสักครู่';
    if (s < 3600) return Math.floor(s / 60) + ' นาทีที่แล้ว';
    if (s < 86400) return Math.floor(s / 3600) + ' ชั่วโมงที่แล้ว';
    var d = new Date(t);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function say(title, body, tone) {
    if (window.wunvitNotify) window.wunvitNotify(title, body, tone);
  }

  /* ==================================================================
     RENDER
     ================================================================== */
  var cache = [];

  function setState(name) { $('board').setAttribute('data-state', name); }

  /* ข้อความผู้ใช้ผ่าน textContent เท่านั้น ไม่มี innerHTML ที่ไหนเลย */
  function postEl(p, depth) {
    var el = document.createElement('article');
    el.className = 'post' + (depth ? ' post--reply' : '') + (p.pinned && !depth ? ' is-pinned' : '');
    el.setAttribute('data-id', p.id);

    var head = document.createElement('header');
    head.className = 'post__head';

    var who = document.createElement('span');
    who.className = 'post__who mono';
    who.textContent = p.student_id;
    head.appendChild(who);

    if (p.pinned && !depth) {
      var pin = document.createElement('span');
      pin.className = 'post__pin';
      pin.textContent = 'ปักหมุด';
      head.appendChild(pin);
    }

    var when = document.createElement('span');
    when.className = 'post__when';
    when.textContent = ago(p.created_at);
    head.appendChild(when);
    el.appendChild(head);

    var body = document.createElement('p');
    body.className = 'post__body';
    body.textContent = p.body;
    el.appendChild(body);

    var acts = document.createElement('div');
    acts.className = 'post__acts';

    // ตอบกลับได้ทุกชั้น ไม่ใช่แค่ชั้นบนสุด
    var rb = document.createElement('button');
    rb.type = 'button';
    rb.className = 'post__act';
    rb.textContent = 'ตอบกลับ';
    rb.addEventListener('click', function () { openReply(el, p.id); });
    acts.appendChild(rb);

    /* ปุ่มพวกนี้โผล่เฉพาะเครื่องที่ผ่านการล็อกอินแอดมินแล้วเท่านั้น
       เครื่องอื่นไม่เห็นแม้แต่ร่องรอยว่ามีระบบนี้อยู่ */
    if (isAdmin()) {
      if (!depth) {
        var pb = document.createElement('button');
        pb.type = 'button';
        pb.className = 'post__act post__act--admin';
        pb.textContent = p.pinned ? 'เลิกปักหมุด' : 'ปักหมุด';
        pb.addEventListener('click', function () { act(p.id, p.pinned ? 'unpin' : 'pin'); });
        acts.appendChild(pb);
      }
      var db = document.createElement('button');
      db.type = 'button';
      db.className = 'post__act post__act--danger';
      db.textContent = 'ลบ';
      db.addEventListener('click', function () {
        if (!window.confirm('ลบข้อความนี้?')) return;
        act(p.id, 'delete');
      });
      acts.appendChild(db);
    }

    el.appendChild(acts);
    return el;
  }

  function openReply(hostEl, parentId) {
    if (hostEl.querySelector(':scope > .replybox')) return;
    if (!requireId()) return;

    var box = document.createElement('div');
    box.className = 'replybox';

    var ta = document.createElement('textarea');
    ta.className = 'board__input';
    ta.rows = 2;
    ta.maxLength = MAX_LEN;
    ta.placeholder = 'ตอบกลับ…';

    var row = document.createElement('div');
    row.className = 'replybox__row';

    var send = document.createElement('button');
    send.type = 'button';
    send.className = 'btn btn--primary btn--sm';
    send.textContent = 'ส่ง';

    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn--ghost btn--sm';
    cancel.textContent = 'ยกเลิก';
    cancel.addEventListener('click', function () { box.remove(); });

    send.addEventListener('click', function () {
      var v = ta.value.trim();
      if (!v) return;
      send.disabled = true;
      createPost(v, parentId)
        .then(function () { box.remove(); return refresh(); })
        .catch(function (e) { send.disabled = false; say('ส่งไม่สำเร็จ', e.message, 'bad'); });
    });

    row.appendChild(send);
    row.appendChild(cancel);
    box.appendChild(ta);
    box.appendChild(row);
    hostEl.appendChild(box);
    ta.focus();
  }

  function act(id, action) {
    moderate(id, action)
      .then(function () {
        say(action === 'delete' ? 'ลบข้อความแล้ว'
          : (action === 'pin' ? 'ปักหมุดแล้ว' : 'เลิกปักหมุดแล้ว'),
          '', action === 'delete' ? 'warn' : 'ok');
        return refresh();
      })
      .catch(function (e) { say('ทำรายการไม่สำเร็จ', e.message, 'bad'); });
  }

  /* ซ้อนได้ไม่จำกัดชั้นแบบ reddit — วาดแบบเวียนซ้ำ
     การเยื้องหยุดที่ MAX_INDENT ไม่งั้นบทสนทนายาวๆ จะบีบจนอ่านไม่ได้บนมือถือ */
  function renderBranch(parentId, byParent, depth, host) {
    var kids = byParent[parentId];
    if (!kids || !kids.length) return;

    var wrap = document.createElement('div');
    wrap.className = 'post__replies';
    if (depth >= MAX_INDENT) wrap.classList.add('post__replies--flat');

    kids.sort(function (a, b) { return a.created_at < b.created_at ? -1 : 1; })
        .forEach(function (k) {
          var el = postEl(k, depth);
          renderBranch(k.id, byParent, depth + 1, el);
          wrap.appendChild(el);
        });

    host.appendChild(wrap);
  }

  function render(rows) {
    cache = rows;
    var list = $('board-list');
    list.innerHTML = '';

    var byParent = {};
    var tops = [];
    rows.forEach(function (r) {
      if (r.parent_id) (byParent[r.parent_id] = byParent[r.parent_id] || []).push(r);
      else tops.push(r);
    });

    if (!tops.length) { setState('empty'); return; }
    setState('ready');

    tops.sort(function (a, b) {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.created_at < b.created_at ? 1 : -1;
    }).forEach(function (p) {
      var el = postEl(p, 0);
      renderBranch(p.id, byParent, 1, el);
      list.appendChild(el);
    });

    $('board-count').textContent = rows.length;
  }

  var refreshing = false;
  function refresh(showLoading) {
    if (!CONFIGURED || refreshing) return Promise.resolve();
    refreshing = true;
    if (showLoading && !cache.length) setState('loading');
    return listPosts()
      .then(render)
      .catch(function (e) {
        setState('error');
        $('board-error').textContent = e.message;
      })
      .then(function () { refreshing = false; });
  }

  /* ==================================================================
     รหัสประจำตัว
     ปกติคือเลข 6 หลัก ช่องจะตัดให้เองไม่ให้เกิน
     แต่ถ้าพิมพ์ตัวอักษรลงไป ช่องจะยอมให้พิมพ์ยาวต่อ แล้วค่าที่ได้จะถูก
     ส่งไปถาม server ว่าเป็นรหัสแอดมินหรือเปล่า
     ================================================================== */
  function requireId() {
    if (studentId()) return true;
    openGate('');
    return false;
  }

  function openGate(prefill) {
    $('gate-input').value = prefill || '';
    $('gate-err').textContent = '';
    $('board-gate').hidden = false;
    $('gate-input').focus();
  }

  function submitGate() {
    var raw = ($('gate-input').value || '').trim();
    if (!raw) return;

    // เลข 6 หลักล้วน = ผู้ใช้ทั่วไป
    if (/^[0-9]{6}$/.test(raw)) {
      lsSet(ID_KEY, raw);
      $('board-gate').hidden = true;
      paintWho();
      render(cache);
      return;
    }

    // อย่างอื่น: ลองถาม server เงียบๆ ว่าเป็นรหัสแอดมินไหม
    if (/^[0-9]{5}[^0-9]/.test(raw)) {
      $('gate-save').disabled = true;
      tryAdminLogin(raw).then(function (displayId) {
        $('gate-save').disabled = false;
        if (!displayId) {
          // ไม่ตรงก็บอกเหมือนกรอกผิดธรรมดา ไม่ใบ้ว่ามีระบบแอดมินอยู่
          $('gate-err').textContent = 'ต้องเป็นตัวเลข 6 หลักเท่านั้น';
          return;
        }
        // ตรง — เข้าโหมดแอดมินแบบเงียบ ไม่มีป้าย ไม่มีปุ่มโผล่ที่ไหน
        var already = adminSecret() === raw;
        if (already) {
          lsDel(ADMIN_KEY);
          say('ออกจากโหมดแอดมินแล้ว', '', 'warn');
        } else {
          lsSet(ADMIN_KEY, raw);
          say('เข้าโหมดแอดมินแล้ว', 'เครื่องนี้ลบและปักหมุดได้', 'ok');
        }
        lsSet(ID_KEY, displayId);
        $('board-gate').hidden = true;
        paintWho();
        render(cache);
      });
      return;
    }

    $('gate-err').textContent = 'ต้องเป็นตัวเลข 6 หลักเท่านั้น';
  }

  function paintWho() {
    var id = studentId();
    $('board-who').textContent = id ? id : 'ยังไม่ได้กรอก';
    $('board-compose').hidden = !id;
    $('board-needid').hidden = !!id;
  }

  /* ==================================================================
     BOOT
     ================================================================== */
  function init() {
    if (!CONFIGURED) { setState('off'); return; }

    paintWho();

    var gi = $('gate-input');
    /* ตัดให้เหลือ 6 ตัวเฉพาะตอนที่พิมพ์เป็นตัวเลขล้วน
       พอมีตัวอักษรปนปุ๊บ ช่องจะปลดล็อกให้พิมพ์ยาวได้ */
    gi.addEventListener('input', function () {
      if (/^[0-9]+$/.test(gi.value) && gi.value.length > 6) {
        gi.value = gi.value.slice(0, 6);
      } else if (gi.value.length > 64) {
        gi.value = gi.value.slice(0, 64);
      }
    });
    gi.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitGate();
    });

    $('gate-save').addEventListener('click', submitGate);
    $('gate-cancel').addEventListener('click', function () { $('board-gate').hidden = true; });
    $('board-needid').addEventListener('click', function () { requireId(); });
    /* no "change id" button on purpose — see the comment on .board__id in
       index.html. The gate still opens the first time (requireId), which is
       the only entry point admin needs too. */

    var ta = $('compose-input');
    var counter = $('compose-count');
    ta.addEventListener('input', function () {
      counter.textContent = ta.value.length + '/' + MAX_LEN;
    });

    $('compose-send').addEventListener('click', function () {
      var v = ta.value.trim();
      if (!v) return;
      if (!requireId()) return;
      $('compose-send').disabled = true;
      createPost(v, null)
        .then(function () {
          ta.value = '';
          counter.textContent = '0/' + MAX_LEN;
          say('ส่งข้อความแล้ว', '', 'ok');
          return refresh();
        })
        .catch(function (e) { say('ส่งไม่สำเร็จ', e.message, 'bad'); })
        .then(function () { $('compose-send').disabled = false; });
    });

    $('board-retry').addEventListener('click', function () { refresh(true); });

    refresh(true);
  }

  var timer = null;
  window.wunvitBoardEnter = function () {
    if (!CONFIGURED) { setState('off'); return; }
    refresh(true);
    clearInterval(timer);
    timer = setInterval(function () {
      if (!document.hidden) refresh(false);
    }, POLL_MS);
  };
  window.wunvitBoardLeave = function () { clearInterval(timer); timer = null; };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
