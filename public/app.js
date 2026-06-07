'use strict';

// ===== الحالة =====
const state = {
  config: null,
  step: 0,            // 0 = المقدمة، 1..N = الأفكار، N+1 = الشكر
  evaluator: '',
  role: '',
  ratings: {},        // { ideaId: { w1..w4 } }
  notes: {},          // { ideaId: text }
  bookmarks: new Set(),
  submitting: false,
  submitted: false,
};

const AR = (n) => Number(n).toLocaleString('ar-EG');

const els = {
  cards: document.getElementById('cards'),
  topbar: document.getElementById('topbar'),
  navbar: document.getElementById('navbar'),
  prev: document.getElementById('prev-btn'),
  next: document.getElementById('next-btn'),
  nextLabel: document.getElementById('next-label'),
  dots: document.getElementById('dots'),
  fill: document.getElementById('progress-fill'),
  counter: document.getElementById('step-counter'),
};

// ===== الإقلاع =====
init();
async function init() {
  els.cards.innerHTML = '<div class="loader"><div class="spinner"></div><span>جارٍ التحميل…</span></div>';
  restore();
  try {
    const res = await fetch('/api/config');
    state.config = await res.json();
  } catch (e) {
    els.cards.innerHTML = '<div class="card glass"><p style="text-align:center">تعذّر تحميل المنصة. حدّث الصفحة.</p></div>';
    return;
  }
  els.prev.addEventListener('click', () => go(state.step - 1));
  els.next.addEventListener('click', onNext);
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if (e.key === 'ArrowRight') go(state.step - 1); // RTL: يمين = رجوع
    if (e.key === 'ArrowLeft') onNext();
  });
  render();
}

const ideaCount = () => state.config.ideas.length;
const lastIdeaStep = () => ideaCount();        // آخر خطوة فكرة
const thanksStep = () => ideaCount() + 1;

// ===== التنقّل =====
function onNext() {
  if (state.step === 0) {
    if (!validateIntro()) return;
  } else if (state.step >= 1 && state.step <= lastIdeaStep()) {
    if (!validateIdea(state.config.ideas[state.step - 1].id)) return;
  }
  if (state.step === lastIdeaStep()) { submit(); return; }
  if (state.step < thanksStep()) go(state.step + 1);
}

function go(target) {
  if (target < 0 || target > thanksStep()) return;
  if (target === state.step) return;
  const forward = target > state.step;
  const card = els.cards.querySelector('.card');
  if (forward && card) {
    // انتقال التلاشي للخارج ثم عرض الشاشة التالية
    card.classList.remove('enter');
    card.classList.add('leave');
    setTimeout(() => { state.step = target; render(); persist(); }, 300);
  } else {
    state.step = target; render(); persist();
  }
}

// ===== التحقق =====
function validateIntro() {
  const ok = state.evaluator.trim() && state.role;
  if (!ok) showWarn('intro');
  return ok;
}
function validateIdea(ideaId) {
  const r = state.ratings[ideaId] || {};
  const complete = state.config.criteria.every((c) => r[c.id] >= 1 && r[c.id] <= 5);
  if (!complete) showWarn('idea');
  return complete;
}
function showWarn(kind) {
  const w = els.cards.querySelector('.warn');
  if (w) { w.classList.add('show'); }
}

// ===== العرض =====
function render() {
  els.cards.innerHTML = '';
  let html = '';
  if (state.step === 0) html = renderIntro();
  else if (state.step <= lastIdeaStep()) html = renderIdea(state.config.ideas[state.step - 1]);
  else html = renderThanks();

  const card = document.createElement('div');
  card.className = 'card glass enter';
  card.innerHTML = html;
  els.cards.appendChild(card);

  wire(card);
  updateChrome();
  els.cards.scrollIntoView({ block: 'start', behavior: 'instant' });
  window.scrollTo(0, 0);
}

function renderIntro() {
  const p = state.config.project;
  return `
    ${brandLockup()}
    <p class="intro-eyebrow">${p.subtitle}</p>
    <h1 class="intro-title">${p.title}</h1>
    <p class="intro-sub">منصة التقييم التشاركي للأفكار</p>
    <p class="intro-lead">
      الغرض: تقييم منهجي لأفكار مسار الاستدامة المالية بهدف تصنيفها واعتماد الأنسب لتحقيق مستهدف ٢٠٢٦،
      وفق منهجية ثلاثية المراحل. <strong>أنت الآن في المرحلة الثانية: المعايير الوزنية</strong> — تقييم كل فكرة
      على أربعة معايير بمقياس من ١ إلى ٥ بأوزان نسبية.
    </p>

    <div class="method">
      <div class="method-step"><div class="method-num">١</div><div class="method-body"><h4>التصفية الشرطية</h4><p>معايير «نعم/لا» (مكتملة في مرحلة سابقة).</p></div></div>
      <div class="method-step active"><div class="method-num">٢</div><div class="method-body"><h4>التقييم الوزني</h4><p>٤ معايير بمقياس ١–٥ وأوزان مجموعها ١٠٠٪.</p></div><span class="method-badge">مرحلتك الآن</span></div>
      <div class="method-step"><div class="method-num">٣</div><div class="method-body"><h4>معامل الجاذبية والترتيب</h4><p>مضاعف يُطبَّق لاحقاً ثم الترتيب والتصنيف النهائي.</p></div></div>
    </div>

    <div class="field">
      <label for="ev-name">اسم المقيّم</label>
      <input class="input" id="ev-name" type="text" placeholder="الاسم الكامل" value="${esc(state.evaluator)}" autocomplete="name" />
    </div>
    <div class="field">
      <label>دورك في التقييم</label>
      <div class="role-chips" id="role-chips">
        ${state.config.roles.map((r) => `<div class="chip ${state.role === r ? 'selected' : ''}" data-role="${esc(r)}">${esc(r)}</div>`).join('')}
      </div>
    </div>
    <div class="warn" id="warn"><span>⚠︎</span><span>الرجاء كتابة الاسم واختيار الدور للمتابعة.</span></div>
  `;
}

function renderIdea(idea) {
  const r = state.ratings[idea.id] || {};
  const noteVal = state.notes[idea.id] || '';
  const bookmarked = state.bookmarks.has(idea.id);
  const crit = state.config.criteria.map((c) => {
    const buttons = [1, 2, 3, 4, 5].map((n) =>
      `<button type="button" class="scale-btn ${r[c.id] === n ? 'selected' : ''}" data-crit="${c.id}" data-val="${n}">${AR(n)}</button>`
    ).join('');
    return `
      <div class="crit">
        <div class="crit-top">
          <span class="crit-name">${esc(c.name)}</span>
          <span class="crit-weight">الوزن ${AR(Math.round(c.weight * 100))}٪</span>
        </div>
        <p class="crit-desc">${esc(c.desc)}</p>
        <div class="scale">${buttons}</div>
        <div class="scale-ends"><span>١ · ${esc(c.low)}</span><span>${esc(c.high)} · ٥</span></div>
      </div>`;
  }).join('');

  return `
    <button type="button" class="bookmark-btn ${bookmarked ? 'on' : ''}" id="bm" title="وضع إشارة مرجعية للرجوع لاحقاً" aria-pressed="${bookmarked}">
      <svg viewBox="0 0 24 24" width="20" height="20"><path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1z" fill="${bookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
    </button>
    <div class="idea-head">
      <span class="idea-cat">${esc(idea.category)}</span>
      <h2 class="idea-title">${AR(idea.id)}. ${esc(idea.title)}</h2>
      <p class="idea-desc">${esc(idea.desc)}</p>
    </div>
    <div class="crit-list">${crit}</div>
    <div class="note-wrap">
      <button type="button" class="note-toggle" id="note-toggle">＋ إضافة ملاحظة (اختياري)</button>
      <textarea class="note-area" id="note-area" placeholder="ملاحظتك أو مبرر التقييم…" ${noteVal ? '' : 'hidden'}>${esc(noteVal)}</textarea>
    </div>
    <div class="warn" id="warn"><span>⚠︎</span><span>الرجاء تقييم المعايير الأربعة للمتابعة.</span></div>
  `;
}

function renderThanks() {
  const counted = Object.keys(state.ratings).length;
  return `
    <div class="thanks">
      <div class="thanks-check"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <h2>شكراً لك، ${esc(state.evaluator.split(' ')[0] || '')}</h2>
      <p>تم استلام تقييمك بنجاح وحفظه بأمان. مساهمتك تساعد اللجنة في ترتيب الأفكار واعتماد الأنسب لخطة الاستدامة ٢٠٢٦.</p>
      <div class="summary">
        <div><div class="num">${AR(counted)}</div><div class="lbl">فكرة قُيّمت</div></div>
        <div><div class="num">${AR(state.config.criteria.length)}</div><div class="lbl">معايير لكل فكرة</div></div>
        <div><div class="num">${esc(roleShort())}</div><div class="lbl">دورك</div></div>
      </div>
    </div>
  `;
}
function roleShort() { return state.role || '—'; }

// شعارا الجهتين — تُستبدل الصور الرسمية تلقائياً عند إضافتها في /assets
function brandLockup() {
  const h = `/assets/logo-hadiyat.png`, b = `/assets/logo-bazel.svg`;
  const hf = `/assets/logo-hadiyat-placeholder.svg`, bf = `/assets/logo-bazel-placeholder.svg`;
  return `
    <div class="brand-lockup">
      <div class="brand-logos">
        <img class="brand-logo" src="${h}" alt="جمعية هدية عالم" onerror="this.onerror=null;this.src='${hf}'" />
        <span class="brand-divider"></span>
        <img class="brand-logo" src="${b}" alt="مؤسسة باذل الأهلية" onerror="this.onerror=null;this.src='${bf}'" />
      </div>
      <p class="brand-caption">مؤسسة باذل الأهلية<span class="sep">·</span>جمعية هدية عالم</p>
    </div>`;
}

// ===== ربط الأحداث للبطاقة الحالية =====
function wire(card) {
  if (state.step === 0) {
    const name = card.querySelector('#ev-name');
    name.addEventListener('input', (e) => { state.evaluator = e.target.value; persist(); hideWarn(card); });
    card.querySelectorAll('#role-chips .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        card.querySelectorAll('.chip').forEach((c) => c.classList.remove('selected'));
        chip.classList.add('selected');
        state.role = chip.dataset.role; persist(); hideWarn(card);
      });
    });
  } else if (state.step <= lastIdeaStep()) {
    const idea = state.config.ideas[state.step - 1];
    card.querySelectorAll('.scale-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cid = btn.dataset.crit, val = Number(btn.dataset.val);
        card.querySelectorAll(`.scale-btn[data-crit="${cid}"]`).forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        state.ratings[idea.id] = state.ratings[idea.id] || {};
        state.ratings[idea.id][cid] = val;
        persist(); hideWarn(card); updateChrome();
      });
    });
    const toggle = card.querySelector('#note-toggle');
    const area = card.querySelector('#note-area');
    toggle.addEventListener('click', () => { area.hidden = !area.hidden; if (!area.hidden) area.focus(); });
    area.addEventListener('input', (e) => { state.notes[idea.id] = e.target.value; persist(); });
    card.querySelector('#bm').addEventListener('click', () => {
      if (state.bookmarks.has(idea.id)) state.bookmarks.delete(idea.id); else state.bookmarks.add(idea.id);
      persist(); render();
    });
  }
}
function hideWarn(card) { const w = card.querySelector('.warn'); if (w) w.classList.remove('show'); }

// ===== الشريط العلوي + النقاط + الأزرار =====
function updateChrome() {
  const showChrome = !state.submitted && state.step <= lastIdeaStep();
  els.topbar.hidden = state.step === thanksStep();
  els.navbar.hidden = state.step === thanksStep();

  const total = ideaCount();
  const done = countCompleted();
  els.fill.style.width = `${state.step === 0 ? 4 : (state.step / (total + 1)) * 100}%`;
  els.counter.textContent = state.step === 0 ? 'تعريف' : `${AR(state.step)} / ${AR(total)}`;

  els.prev.disabled = state.step === 0;
  if (state.step === lastIdeaStep()) {
    els.nextLabel.textContent = state.submitting ? 'جارٍ الإرسال…' : 'إرسال التقييم';
    els.next.classList.add('success');
  } else {
    els.nextLabel.textContent = state.step === 0 ? 'ابدأ التقييم' : 'التالي';
    els.next.classList.remove('success');
  }
  els.next.disabled = state.submitting;

  renderDots();
}

function renderDots() {
  els.dots.innerHTML = '';
  // نقطة المقدمة
  const intro = mkDot(0, 'intro' + (state.step > 0 ? ' done' : '') + (state.step === 0 ? ' current' : ''), 'التعريف');
  els.dots.appendChild(intro);
  state.config.ideas.forEach((idea, i) => {
    const step = i + 1;
    let cls = 'dot';
    if (ideaComplete(idea.id)) cls += ' done';
    if (state.bookmarks.has(idea.id)) cls += ' bookmarked';
    if (state.step === step) cls += ' current';
    const d = mkDot(step, cls, `فكرة ${AR(idea.id)}${state.bookmarks.has(idea.id) ? ' (مرجعية)' : ''}`);
    els.dots.appendChild(d);
  });
}
function mkDot(step, cls, label) {
  const b = document.createElement('button');
  b.className = cls; b.type = 'button'; b.title = label; b.setAttribute('aria-label', label);
  b.addEventListener('click', () => go(step));
  return b;
}

function ideaComplete(id) {
  const r = state.ratings[id] || {};
  return state.config.criteria.every((c) => r[c.id] >= 1);
}
function countCompleted() { return state.config.ideas.filter((i) => ideaComplete(i.id)).length; }

// ===== الإرسال =====
async function submit() {
  if (state.submitting) return;
  state.submitting = true; updateChrome();
  try {
    const res = await fetch('/api/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evaluator: state.evaluator, role: state.role, ratings: state.ratings, notes: state.notes }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'فشل الإرسال');
    state.submitted = true; state.submitting = false;
    clearDraft();
    state.step = thanksStep(); render();
  } catch (e) {
    state.submitting = false; updateChrome();
    alert('تعذّر إرسال التقييم: ' + e.message);
  }
}

// ===== الحفظ المحلي (مسودة) =====
const KEY = 'hadiyat_eval_draft_v1';
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      step: state.step, evaluator: state.evaluator, role: state.role,
      ratings: state.ratings, notes: state.notes, bookmarks: [...state.bookmarks],
    }));
  } catch (e) {}
}
function restore() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!d) return;
    state.evaluator = d.evaluator || ''; state.role = d.role || '';
    state.ratings = d.ratings || {}; state.notes = d.notes || {};
    state.bookmarks = new Set(d.bookmarks || []);
    state.step = Math.max(0, Math.min(d.step || 0, 50));
  } catch (e) {}
}
function clearDraft() { try { localStorage.removeItem(KEY); } catch (e) {} }

// ===== أدوات =====
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
