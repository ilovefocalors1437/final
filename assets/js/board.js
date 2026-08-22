/* ============================================================
   PASSPORT — กระดาน "บอกเล่าความรู้สึก"
   ------------------------------------------------------------
   ข้อความล้วน ไม่มีรูป (ตั้งใจ — ตัดความเสี่ยงเรื่องรูปไม่เหมาะสม
   ในงานที่ผู้ใช้เป็นเด็กออกไปทั้งหมด)

   คุยกับ Supabase ผ่าน REST ตรงๆ ไม่โหลด SDK เลย เพราะทั้งเว็บนี้
   ยึดหลัก "ไม่ดึงอะไรจาก CDN ตอนรัน" อยู่แล้ว และ SDK จะหนักกว่า
   โค้ดนี้หลายเท่าโดยไม่ได้อะไรเพิ่ม
   ============================================================ */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     ตั้งค่า
     anon / publishable key ถูกออกแบบมาให้เปิดเผยได้ — มันอยู่ในหน้าเว็บ
     ที่ทุกคนเปิดดูได้อยู่แล้ว สิ่งที่กันจริงคือ RLS ใน supabase-setup.sql
     ไม่ใช่การซ่อน key ห้ามเอา service_role / sb_secret_ มาใส่ตรงนี้เด็ดขาด
     ------------------------------------------------------------------ */
  var SUPABASE_URL = 'https://xieizmzniwwokwacbjuq.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_ICfckiY0JbaJmUMYh6loIg_FGcyHry_';

  var CONFIGURED = !!(SUPABASE_URL && SUPABASE_KEY);

  var MAX_LEN = 500;
  var POLL_MS = 15000;     // รีเฟรชเงียบๆ ระหว่างเปิดหน้ากระดานอยู่

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
    // RLS ซ่อนอันที่ลบแล้วให้เอง จึงไม่ต้องกรองซ้ำตรงนี้
    var url = SUPABASE_URL + '/rest/v1/posts'
            + '?select=id,student_id,body,parent_id,pinned,created_at'
            + '&order=pinned.desc,created_at.desc&limit=400';
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
        // ข้อความจาก trigger กันสแปม
        if (t.indexOf('posting too fast') !== -1) throw new Error('พิมพ์ถี่เกินไป รอสักครู่แล้วลองใหม่');
        if (r.status === 401 || r.status === 403) throw new Error('ยังไม่ได้ตั้งค่าสิทธิ์ใน Supabase');
        throw new Error('ส่งไม่สำเร็จ (' + r.status + ')');
      });
    });
  }

  function moderate(postId, action) {
    return fetch(SUPABASE_URL + '/rest/v1/rpc/admin_moderate', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ p_secret: adminSecret(), p_post_id: postId, p_action: action })
    }).then(function (r) {
      if (r.ok) return true;
      if (r.status === 403 || r.status === 400) throw new Error('รหัสแอดมินไม่ถูกต้อง');
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

  /* ---------- แจ้งเตือน (ยืมของ app.js ถ้ามี) ---------- */
  function say(title, body, tone) {
    if (window.wunvitNotify) window.wunvitNotify(title, body, tone);
  }

  /* ==================================================================
     RENDER
     ================================================================== */
  var cache = [];

  function setState(name) { $('board').setAttribute('data-state', name); }

  /* ทุกอย่างที่มาจากผู้ใช้ผ่าน textContent เท่านั้น ไม่มี innerHTML
     — ข้อความเด็กพิมพ์คือ input ที่เชื่อไม่ได้ */
  function postEl(p, isReply) {
    var el = document.createElement('article');
    el.className = 'post' + (isReply ? ' post--reply' : '') + (p.pinned ? ' is-pinned' : '');
    el.setAttribute('data-id', p.id);

    var head = document.createElement('header');
    head.className = 'post__head';

    var who = document.createElement('span');
    who.className = 'post__who mono';
    who.textContent = p.student_id;
    head.appendChild(who);

    if (p.pinned) {
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

    if (!isReply) {
      var rb = document.createElement('button');
      rb.type = 'button';
      rb.className = 'post__act';
      rb.textContent = 'ตอบกลับ';
      rb.addEventListener('click', function () { openReply(el, p.id); });
      acts.appendChild(rb);
    }

    if (isAdmin()) {
      if (!isReply) {
        var pb = document.createElement('button');
        pb.type = 'button';
        pb.className = 'post__act post__act--admin';
        pb.textContent = p.pinned ? 'เลิกปักหมุด' : 'ปักหมุด';
        pb.addEventListener('click', function () {
          act(p.id, p.pinned ? 'unpin' : 'pin');
        });
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

    if (acts.children.length) el.appendChild(acts);
    return el;
  }

  function openReply(hostEl, parentId) {
    if (hostEl.querySelector('.replybox')) return;
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
        say(action === 'delete' ? 'ลบข้อความแล้ว' : (action === 'pin' ? 'ปักหมุดแล้ว' : 'เลิกปักหมุดแล้ว'),
            '', action === 'delete' ? 'warn' : 'ok');
        return refresh();
      })
      .catch(function (e) { say('ทำรายการไม่สำเร็จ', e.message, 'bad'); });
  }

  function render(rows) {
    cache = rows;
    var list = $('board-list');
    list.innerHTML = '';

    var tops = rows.filter(function (r) { return !r.parent_id; });
    var byParent = {};
    rows.forEach(function (r) {
      if (!r.parent_id) return;
      (byParent[r.parent_id] = byParent[r.parent_id] || []).push(r);
    });

    if (!tops.length) { setState('empty'); return; }
    setState('ready');

    tops.forEach(function (p) {
      var el = postEl(p, false);
      var kids = (byParent[p.id] || []).sort(function (a, b) {
        return a.created_at < b.created_at ? -1 : 1;   // ตอบกลับเรียงเก่า→ใหม่ อ่านเป็นบทสนทนา
      });
      if (kids.length) {
        var wrap = document.createElement('div');
        wrap.className = 'post__replies';
        kids.forEach(function (k) { wrap.appendChild(postEl(k, true)); });
        el.appendChild(wrap);
      }
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
     ไม่ใช่ระบบยืนยันตัวตน — พิมพ์เลขอะไรก็ได้ มันคือป้ายชื่อให้รู้ว่าใครพูด
     ================================================================== */
  function requireId() {
    if (studentId()) return true;
    $('board-gate').hidden = false;
    $('gate-input').focus();
    return false;
  }

  function saveId() {
    var v = ($('gate-input').value || '').trim();
    if (!/^[0-9]{6}$/.test(v)) {
      $('gate-err').textContent = 'ต้องเป็นตัวเลข 6 หลักเท่านั้น';
      return;
    }
    lsSet(ID_KEY, v);
    $('gate-err').textContent = '';
    $('board-gate').hidden = true;
    paintWho();
  }

  function paintWho() {
    var id = studentId();
    $('board-who').textContent = id ? id : 'ยังไม่ได้กรอก';
    $('board-compose').hidden = !id;
    $('board-needid').hidden = !!id;
    $('board-admin-badge').hidden = !isAdmin();
  }

  /* ==================================================================
     BOOT
     ================================================================== */
  function init() {
    if (!CONFIGURED) { setState('off'); return; }

    paintWho();

    $('gate-save').addEventListener('click', saveId);
    $('gate-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') saveId();
    });
    $('board-needid').addEventListener('click', function () { requireId(); });
    $('board-changeid').addEventListener('click', function () {
      $('gate-input').value = studentId();
      $('board-gate').hidden = false;
      $('gate-input').focus();
    });

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

    /* โหมดแอดมิน — ผูกกับเครื่องนี้เครื่องเดียว ไม่มีบัญชี ไม่ล็อก IP
       รหัสเก็บใน localStorage ของเครื่องนี้ และถูกตรวจฝั่ง server ทุกครั้ง */
    $('board-adminbtn').addEventListener('click', function () {
      if (isAdmin()) {
        if (!window.confirm('ออกจากโหมดแอดมินบนเครื่องนี้?')) return;
        lsDel(ADMIN_KEY);
        paintWho();
        render(cache);
        say('ออกจากโหมดแอดมินแล้ว', '', 'warn');
        return;
      }
      var s = window.prompt('ใส่รหัสแอดมิน (เก็บไว้ในเครื่องนี้เครื่องเดียว)');
      if (!s) return;
      lsSet(ADMIN_KEY, s.trim());
      paintWho();
      render(cache);
      say('เข้าโหมดแอดมินแล้ว', 'เครื่องนี้ลบและปักหมุดข้อความได้', 'ok');
    });

    refresh(true);
  }

  /* หน้ากระดานจะโหลดข้อมูลเฉพาะตอนเปิดดูอยู่ และหยุด poll เมื่อออกไป */
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
