import { firebaseConfig, OWNER_EMAIL, isConfigured } from './firebase-config.js';
import { DEFAULT_DATA } from './default-data.js';

const FB_CDN = 'https://www.gstatic.com/firebasejs/10.14.1/';
const DOC_PATH = ['profile', 'main'];

const $ = (s, r) => (r || document).querySelector(s);
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

let S = JSON.parse(JSON.stringify(DEFAULT_DATA));
let fb = null;          // { auth, db, A, F } : Firebase 모듈 묶음
let remoteOk = false;   // 저장된 내용을 정상적으로 확인했는지 (실패 시 편집 막음)

/* ---------- 도트 스프라이트 ---------- */
const SPR = {
  avatar: { p: { o: '#3B2A80', l: '#E4D6FF', p: '#FFB3DA', w: '#FFFFFF', d: '#2A1A5E', r: '#FF7DB5' }, g: [
    '.... oo .... oo ....', '... olpo .. olpo ...', '... olpo .. olpo ...', '... ollo .. ollo ...',
    '.. o llllllllll o ..', '. o llllllllllll o .', '. o llllllllllll o .',
    '. o ll wd llll wd ll o .', '. o ll dd llll dd ll o .', '. o l pp llllll pp l o .',
    '. o lllll rr lllll o .', '. o llllllllllll o .', '.. o llllllllll o ..', '... o llllllll o ...',
    '.... oooooooo ....', '................'] },
  heart: { p: { o: '#3B2A80', p: '#FF8FC4', w: '#FFFFFF' }, g: ['.oo.oo.', 'owpoppo', 'opppppo', '.opppo.', '..opo..', '...o...'] },
  star: { p: { o: '#3B2A80', y: '#FFE98A' }, g: ['....o....', '...oyo...', '...oyo...', 'ooooyoooo', 'oyyyyyyyo', '.ooyyyoo.', '..oyyyo..', '..oyoyo..', '..oo.oo..'] },
  sparkle: { p: { a: '#FFFFFF' }, g: ['...a...', '...a...', '..aaa..', 'aaaaaaa', '..aaa..', '...a...', '...a...'] },
  warn: { p: { o: '#3B2A80', y: '#FFE98A', d: '#3B2A80' }, g: ['.....o.....', '....oyo....', '....oyo....', '...oyyyo...', '...oydyo...', '..oyydyyo..', '..oyydyyo..', '.oyyyyyyyo.', '.oyyydyyyo.', 'ooooooooooo'] },
  cloud: { p: { o: '#B7A3F0', w: '#FFFFFF' }, g: ['......oooo........', '....oowwwwoo......', '..oowwwwwwwwoooo..', '.owwwwwwwwwwwwwwo.', 'owwwwwwwwwwwwwwwwo', 'owwwwwwwwwwwwwwwwo', '.oooooooooooooooo.'] }
};
function draw(el) {
  const spr = SPR[el.dataset.sp]; if (!spr) return;
  const s = +el.dataset.s || 4;
  const rows = spr.g.map((r) => r.replace(/\s/g, ''));
  const w = rows[0].length, h = rows.length;
  const pal = Object.assign({}, spr.p); if (el.dataset.c) pal.a = el.dataset.c;
  let out = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < w) {
      const ch = row[x]; if (ch === '.') { x++; continue; }
      let x2 = x; while (x2 < w && row[x2] === ch) x2++;
      out += `<rect x="${x}" y="${y}" width="${x2 - x}" height="1" fill="${pal[ch]}"/>`;
      x = x2;
    }
  });
  el.style.width = (w * s) + 'px';
  el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${out}</svg>`;
}
const drawAll = (root) => (root || document).querySelectorAll('[data-sp]').forEach(draw);

/* ---------- 텍스트 -> 구조 ---------- */
function splitC(s) {
  const out = []; let d = 0, b = '';
  for (const ch of s) {
    if (ch === '(' || ch === '（') d++;
    if (ch === ')' || ch === '）') d = Math.max(0, d - 1);
    if (ch === ',' && d === 0) { out.push(b.trim()); b = ''; } else b += ch;
  }
  if (b.trim()) out.push(b.trim());
  return out.filter(Boolean);
}
function parseChars(t) {
  const plats = []; let cur = null;
  String(t || '').split('\n').forEach((l) => {
    l = l.trim(); if (!l) return;
    if (l[0] === '#') { cur = { name: l.replace(/^#+\s*/, ''), works: [] }; plats.push(cur); return; }
    const m = l.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (m) {
      if (!cur) { cur = { name: '기타', works: [] }; plats.push(cur); }
      cur.works.push({ t: m[1], c: splitC(m[2]) });
    }
  });
  return plats;
}
function parsePairs(t) {
  const blocks = []; let cur = [];
  String(t || '').split('\n').forEach((l) => {
    l = l.trim();
    if (!l) { if (cur.length) { blocks.push(cur); cur = []; } return; }
    const i = l.indexOf(':');
    cur.push(i < 0 ? { n: '', w: l } : { n: l.slice(0, i).trim(), w: l.slice(i + 1).trim() });
  });
  if (cur.length) blocks.push(cur);
  return blocks;
}
const pairsHtml = (blocks) => blocks.map((b) =>
  `<div class="pblock"><div class="pgrid">${b.map((p) => `<div class="pair">${p.n ? `<b>${esc(p.n)}</b>` : ''}<span>${esc(p.w)}</span></div>`).join('')}</div></div>`
).join('');
const base = (n) => n.replace(/\s*[(（].*$/, '').trim();
const list = (a) => (Array.isArray(a) ? a : []);
const splitList = (s) => String(s || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const splitLines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);

/* ---------- 화면 그리기 ---------- */
let plats = [], curTab = 0, query = '';
const winBar = (icon, id, title) =>
  `<div class="win-bar"><span class="sp" data-sp="${icon}" data-s="2" aria-hidden="true"></span><h2 id="${id}">${title}</h2><div class="btns" aria-hidden="true"><b></b><b></b><b></b></div></div>`;

function render() {
  plats = parseChars(S.chars);
  const uniq = {}; plats.forEach((p) => p.works.forEach((w) => w.c.forEach((c) => { uniq[base(c)] = 1; })));
  const nChars = Object.keys(uniq).length;
  const nWorks = plats.reduce((a, p) => a + p.works.length, 0);
  const sens = parsePairs(S.pairsSens), safe = parsePairs(S.pairsSafe);
  document.title = `${S.nick} (${S.handle}) 자기소개`;

  $('#root').innerHTML = `
<div class="sky" id="sky"><div id="stars" aria-hidden="true"></div>
<span class="sp cloud c1" data-sp="cloud" data-s="6" style="left:2%;top:150px" aria-hidden="true"></span>
<span class="sp cloud c2" data-sp="cloud" data-s="5" style="right:1%;top:430px" aria-hidden="true"></span>
<div class="page"><div class="beads" aria-hidden="true"></div>
<nav class="nav" aria-label="바로가기"><span class="brand"><span class="sp" data-sp="star" data-s="2" aria-hidden="true"></span>${esc(S.handle)}</span>
  <a class="pill" href="#warn">주의사항</a><a class="pill" href="#like">좋아하는 것</a><a class="pill" href="#chars">소비 캐릭터</a><a class="pill" href="#pairs">페어</a></nav>

<section class="win" aria-labelledby="hero-t">${winBar('heart', 'hero-t', '자기소개')}
<div class="win-body hero"><div class="stage">
  <span class="sp abs" data-sp="star" data-s="3" style="left:10px;top:10px" aria-hidden="true"></span>
  <span class="sp abs" data-sp="heart" data-s="3" style="right:14px;top:22px" aria-hidden="true"></span>
  <span class="sp abs" data-sp="sparkle" data-s="3" data-c="#FF9ECF" style="right:48px;bottom:26px" aria-hidden="true"></span>
  <span class="sp abs" data-sp="sparkle" data-s="2" data-c="#9CD2FF" style="left:18px;bottom:36px" aria-hidden="true"></span>
  <span class="sp abs" data-sp="heart" data-s="2" style="left:60px;bottom:10px" aria-hidden="true"></span>
  <span class="sp mascot" data-sp="avatar" data-s="10" aria-hidden="true"></span></div>
<div class="info"><span class="handle">${esc(S.handle)}</span><h1>${esc(S.nick)}</h1>
  <ul class="badges" aria-label="계정 성향">${list(S.badges).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
  <div class="bubble"><span id="typed">${esc(S.greeting)}</span><span class="caret" aria-hidden="true"></span></div>
  <ul class="plats" aria-label="사용 플랫폼">${plats.map((p) => `<li>${esc(p.name)}</li>`).join('')}${plats.length ? '<li>등...</li>' : ''}</ul>
  <div class="cta"><a class="btn" href="#warn">주의사항 먼저 읽기</a><a class="btn alt" href="#chars">소비 캐릭터 보기</a></div>
</div></div></section>

<section class="win warn" id="warn" aria-labelledby="warn-t">${winBar('warn', 'warn-t', '먼저 읽어주세요')}
<div class="win-body">
  <ul class="warns">${list(S.warns).map((w) => `<li><span class="sp" data-sp="warn" data-s="3" aria-hidden="true"></span><span>${esc(w)}</span></li>`).join('')}</ul>
  ${list(S.mute).length ? `<div class="mute"><span class="lab">뮤트 단어</span>${list(S.mute).map((m) => `<span class="mw">${esc(m)}</span>`).join('')}</div>` : ''}
  ${S.note ? `<div class="stick"><span class="sp pin" data-sp="heart" data-s="3" aria-hidden="true"></span><p>${esc(S.note)}</p></div>` : ''}
</div></section>

<section class="win" id="like" aria-labelledby="like-t">${winBar('star', 'like-t', '좋아하는 것')}
<div class="win-body"><ul class="tags">${list(S.likes).map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div></section>

<section class="win dark" id="chars" aria-labelledby="chars-t">${winBar('heart', 'chars-t', '소비 중인 캐릭터')}
<div class="win-body"><p class="count">작품 ${nWorks}개, 캐릭터 ${nChars}명이 올라와 있어요.</p>
  <label for="q" style="position:absolute;left:-9999px">캐릭터 이름 검색</label>
  <input class="search" id="q" type="search" placeholder="캐릭터 이름으로 찾아보기" autocomplete="off">
  <div class="tabs" id="tabs" role="tablist" aria-label="플랫폼"></div>
  <div class="panel" id="panel" role="tabpanel" aria-live="polite"></div>
  ${S.more ? `<p class="more">${esc(S.more)}</p>` : ''}
</div></section>

<section class="win dark" id="pairs" aria-labelledby="pairs-t">${winBar('star', 'pairs-t', '주로 언급하는 아이들')}
<div class="win-body">
  ${sens.length ? `<div class="gate"><p>여기부터는 근친 요소가 있는 페어예요. 괜찮은 분만 열어주세요.</p>
    <button class="btn" id="sensBtn" type="button" aria-expanded="false" aria-controls="sensBox">근친 페어 보기</button>
    <div id="sensBox" hidden style="margin-top:20px"><h3 class="sub-h">근친 페어</h3>${pairsHtml(sens)}</div></div>` : ''}
  ${safe.length ? `<div class="safe-block"><h3 class="sub-h">근친 아님</h3>${pairsHtml(safe)}</div>` : ''}
</div></section>

<div class="beads" aria-hidden="true"></div><p class="foot">© ${esc(S.nick)} ${esc(S.handle)}</p></div></div>`;

  drawAll();
  renderTabs(); renderPanel();
  $('#q').addEventListener('input', (e) => { query = e.target.value.trim(); renderTabs(); renderPanel(); });
  const sb = $('#sensBtn');
  if (sb) sb.addEventListener('click', () => {
    const box = $('#sensBox'), open = box.hidden;
    box.hidden = !open; sb.setAttribute('aria-expanded', open ? 'true' : 'false');
    sb.textContent = open ? '근친 페어 닫기' : '근친 페어 보기';
  });
  stars();
}

function renderTabs() {
  const t = $('#tabs'); if (!t) return;
  if (query) { t.innerHTML = ''; t.style.display = 'none'; return; }
  t.style.display = '';
  if (curTab >= plats.length) curTab = 0;
  t.innerHTML = plats.map((p, i) => `<button class="tab" role="tab" type="button" data-i="${i}" aria-selected="${i === curTab}">${esc(p.name)}<small>${p.works.length}</small></button>`).join('');
  t.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => { curTab = +b.dataset.i; renderTabs(); renderPanel(); }));
}
function workHtml(w, label, q) {
  const chips = w.c.map((c) => {
    const hit = q && c.toLowerCase().includes(q.toLowerCase());
    return `<span class="cc${hit ? ' hit' : ''}">${esc(c)}</span>`;
  }).join('');
  return `<div class="work"><h3>${label ? `<span class="pl">${esc(label)}</span>` : ''}${esc(w.t)}</h3>${chips}</div>`;
}
function renderPanel() {
  const p = $('#panel'); if (!p) return;
  if (query) {
    const ql = query.toLowerCase(), found = [];
    plats.forEach((pl) => pl.works.forEach((w) => { if (w.c.some((c) => c.toLowerCase().includes(ql))) found.push(workHtml(w, pl.name, query)); }));
    p.innerHTML = found.length
      ? `<p class="count">"${esc(query)}" 가 있는 작품 ${found.length}개</p><div class="works">${found.join('')}</div>`
      : `<p class="nores">"${esc(query)}" 는 아직 목록에 없어요. 소비 캐릭터는 늘어날 수 있어요.</p>`;
    return;
  }
  if (!plats.length) { p.innerHTML = '<p class="empty">아직 올라온 캐릭터가 없어요.</p>'; return; }
  p.innerHTML = `<div class="works">${plats[curTab].works.map((w) => workHtml(w, '', '')).join('')}</div>`;
}

function typeHero() {
  const el = $('#typed'); if (!el || reduce) return;
  const full = el.textContent; let i = 0; el.textContent = '';
  setTimeout(function tick() { el.textContent = full.slice(0, ++i); if (i < full.length) setTimeout(tick, 55); }, 500);
}

/* ---------- 별 ---------- */
function seeded(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function stars() {
  const sky = $('#sky'), box = $('#stars'); if (!sky || !box) return;
  const W = sky.clientWidth, H = sky.scrollHeight, rnd = seeded(7), n = Math.round(W * H / 9000);
  let html = '';
  for (let k = 0; k < n; k++) {
    const x = rnd() * W, y = rnd() * H, f = y / H;
    const o = Math.max(0, Math.min(1, (f - .4) / .35)) * (.45 + rnd() * .55);
    const size = rnd() < .8 ? 3 : 6;
    if (o < .08) continue;
    html += `<i${k % 5 === 0 ? ' class="tw"' : ''} style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;width:${size}px;height:${size}px;opacity:${o.toFixed(2)};--o:${o.toFixed(2)}"></i>`;
  }
  box.innerHTML = html;
}
let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(stars, 200); });

/* ---------- 알림 ---------- */
let toastT;
function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 4500);
}

/* ---------- Firebase ---------- */
async function initFirebase() {
  if (!isConfigured) return;
  const [appM, authM, fsM] = await Promise.all([
    import(FB_CDN + 'firebase-app.js'), import(FB_CDN + 'firebase-auth.js'), import(FB_CDN + 'firebase-firestore.js')
  ]);
  const app = appM.initializeApp(firebaseConfig);
  fb = { auth: authM.getAuth(app), db: fsM.getFirestore(app), A: authM, F: fsM };
  const snap = await fb.F.getDoc(fb.F.doc(fb.db, ...DOC_PATH));
  if (snap.exists()) S = Object.assign({}, DEFAULT_DATA, snap.data());
  remoteOk = true;
}

const isOwner = (u) => !!u && u.email === OWNER_EMAIL && u.emailVerified === true;

function updateAdminBar(user) {
  let bar = $('#adminbar');
  if (!bar) { bar = document.createElement('div'); bar.id = 'adminbar'; bar.className = 'adminbar'; document.body.appendChild(bar); }
  if (!fb) { bar.hidden = true; return; }
  bar.hidden = false;
  if (isOwner(user)) {
    bar.innerHTML = '<button class="btn" id="aEdit" type="button">✎ 편집</button><button class="btn alt small" id="aOut" type="button">로그아웃</button>';
    $('#aEdit').addEventListener('click', openEditor);
    $('#aOut').addEventListener('click', () => fb.A.signOut(fb.auth));
  } else {
    bar.innerHTML = '<button class="btn alt small" id="aIn" type="button">관리자 로그인</button>';
    $('#aIn').addEventListener('click', login);
  }
}
async function login() {
  try {
    const res = await fb.A.signInWithPopup(fb.auth, new fb.A.GoogleAuthProvider());
    if (!isOwner(res.user)) {
      await fb.A.signOut(fb.auth);
      toast('이 계정은 편집 권한이 없어요.');
    }
  } catch (e) {
    if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
      toast('로그인하지 못했어요. (' + (e.code || '알 수 없는 오류') + ')');
    }
  }
}

/* ---------- 편집 창 (주인만) ---------- */
let lastFocus = null;
function field(id, label, value, opts = {}) {
  const ctl = opts.area
    ? `<textarea id="${id}" class="${opts.tall ? 'tall' : ''}">${esc(value)}</textarea>`
    : `<input id="${id}" type="text" value="${esc(value)}">`;
  return `<div class="field"><label for="${id}">${label}</label>${ctl}${opts.hint ? `<small>${opts.hint}</small>` : ''}</div>`;
}
function openEditor() {
  if (!remoteOk) { toast('저장된 내용을 아직 불러오지 못했어요. 새로고침한 뒤에 다시 눌러주세요.'); return; }
  lastFocus = document.activeElement;
  const m = document.createElement('div'); m.className = 'modal'; m.id = 'modal';
  m.innerHTML = `<div class="win" role="dialog" aria-modal="true" aria-labelledby="et"><div class="win-bar"><h2 id="et">내용 편집</h2><div class="btns" aria-hidden="true"><b></b><b></b><b></b></div></div><div class="win-body">
    ${field('e-nick', '닉네임', S.nick)}
    ${field('e-handle', '아이디', S.handle)}
    ${field('e-badges', '배지', list(S.badges).join(', '), { hint: '쉼표로 나눠서 적어주세요.' })}
    ${field('e-greet', '인사말', S.greeting, { area: true })}
    ${field('e-warns', '주의사항', list(S.warns).join('\n'), { area: true, hint: '한 줄에 하나씩.' })}
    ${field('e-mute', '뮤트 단어', list(S.mute).join(', '), { hint: '쉼표로 나눠서 적어주세요.' })}
    ${field('e-note', '배려 안내 문구', S.note, { area: true })}
    ${field('e-likes', '좋아하는 것', list(S.likes).join(', '), { hint: '쉼표로 나눠서 적어주세요.' })}
    ${field('e-chars', '소비 중인 캐릭터', S.chars, { area: true, tall: true, hint: '# 플랫폼 이름 한 줄 다음에, 한 줄에 작품 하나씩 [작품명] 캐릭터1, 캐릭터2 모양으로 적어주세요.' })}
    ${field('e-more', '캐릭터 아래 안내', S.more)}
    ${field('e-sens', '페어 (근친, 토글 안에 들어가요)', S.pairsSens, { area: true, tall: true, hint: '한 줄에 하나씩 이름: 조합 모양으로 적고, 빈 줄을 넣으면 묶음이 나뉘어요. 비워두면 토글이 사라져요.' })}
    ${field('e-safe', '페어 (근친 아님)', S.pairsSafe, { area: true, tall: true, hint: '위와 같은 모양이에요.' })}
    <div class="actions"><button class="btn" id="eSave" type="button">저장하기</button><button class="btn alt" id="eClose" type="button">닫기</button><p class="estatus" id="eStatus" role="status"></p></div>
  </div></div>`;
  document.body.appendChild(m);
  document.body.style.overflow = 'hidden';
  $('#e-nick').focus();
  $('#eClose').addEventListener('click', closeEditor);
  $('#eSave').addEventListener('click', saveEditor);
  m.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeEditor(); });
  m.addEventListener('mousedown', (e) => { if (e.target === m) closeEditor(); });
}
function closeEditor() {
  const m = $('#modal'); if (m) m.remove();
  document.body.style.overflow = '';
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
function status(msg, err) { const s = $('#eStatus'); if (!s) return; s.textContent = msg; s.className = 'estatus' + (err ? ' err' : ''); }

/* firestore.rules 의 길이 제한과 같은 값이에요 */
function validate(d) {
  const over = (v, n, name) => (v.length > n ? `${name}이(가) 너무 길어요. (${v.length}/${n}자)` : '');
  return over(d.nick, 50, '닉네임') || over(d.handle, 50, '아이디') || over(d.greeting, 300, '인사말') ||
    over(d.note, 500, '배려 안내 문구') || over(d.more, 200, '캐릭터 아래 안내') || over(d.chars, 30000, '소비 중인 캐릭터') ||
    over(d.pairsSens, 10000, '근친 페어') || over(d.pairsSafe, 10000, '근친 아님 페어') ||
    (['badges', 'warns', 'mute', 'likes'].some((k) => d[k].length > 30) ? '배지, 주의사항, 뮤트 단어, 좋아하는 것은 각각 30개까지만 적을 수 있어요.' : '');
}
async function saveEditor() {
  const next = {
    nick: $('#e-nick').value.trim() || S.nick,
    handle: $('#e-handle').value.trim() || S.handle,
    badges: splitList($('#e-badges').value),
    greeting: $('#e-greet').value.trim(),
    warns: splitLines($('#e-warns').value),
    mute: splitList($('#e-mute').value),
    note: $('#e-note').value.trim(),
    likes: splitList($('#e-likes').value),
    chars: $('#e-chars').value.trim(),
    more: $('#e-more').value.trim(),
    pairsSens: $('#e-sens').value.trim(),
    pairsSafe: $('#e-safe').value.trim()
  };
  const problem = validate(next);
  if (problem) { status(problem, true); return; }
  const btn = $('#eSave'); btn.disabled = true; status('저장하는 중이에요...', false);
  try {
    await fb.F.setDoc(fb.F.doc(fb.db, ...DOC_PATH), next);
    S = next;
    closeEditor();
    render();
    toast('저장했어요.');
  } catch (e) {
    btn.disabled = false;
    status(e.code === 'permission-denied'
      ? '저장 권한이 없어요. 편집 계정으로 로그인했는지, 파이어베이스 규칙이 배포됐는지 확인해 주세요.'
      : '저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.', true);
  }
}

/* ---------- 시작 ---------- */
(async function boot() {
  try { await withTimeout(initFirebase(), 7000); } catch (e) { console.warn('Firebase 초기화 실패, 기본 내용을 보여줘요.', e); }
  render();
  typeHero();
  if (fb) {
    fb.A.onAuthStateChanged(fb.auth, updateAdminBar);
    updateAdminBar(fb.auth.currentUser);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(stars);
})();
