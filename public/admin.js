'use strict';

const AR = (n) => Number(n).toLocaleString('ar-EG');
const main = document.getElementById('admin-main');
let DATA = { responses: [], ideas: [], criteria: [] };
let pendingDelete = null;

document.getElementById('refresh-btn').addEventListener('click', load);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('modal-confirm').addEventListener('click', confirmDelete);
document.getElementById('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

load();

async function load() {
  try {
    const res = await fetch('/api/responses');
    DATA = await res.json();
    render();
  } catch (e) {
    main.innerHTML = `<div class="empty"><div class="big">⚠️</div><p>تعذّر تحميل النتائج.</p></div>`;
  }
}

function render() {
  const R = DATA.responses;
  if (!R.length) {
    main.innerHTML = `<div class="empty"><div class="big">📭</div><p>لا توجد ردود بعد. شارك رابط المنصة مع المقيّمين.</p></div>`;
    return;
  }

  // متوسطات عامة
  const allAverages = R.map((r) => r.average).filter((a) => a != null);
  const overallAvg = allAverages.length ? (allAverages.reduce((a, b) => a + b, 0) / allAverages.length) : 0;
  const roles = {};
  R.forEach((r) => { roles[r.role] = (roles[r.role] || 0) + 1; });

  main.innerHTML = `
    <div class="stats">
      <div class="stat glass"><div class="num">${AR(R.length)}</div><div class="lbl">عدد الردود</div></div>
      <div class="stat glass"><div class="num">${AR(DATA.ideas.length)}</div><div class="lbl">عدد الأفكار</div></div>
      <div class="stat glass"><div class="num">${fmt(overallAvg)}</div><div class="lbl">متوسط النتائج العام</div></div>
      <div class="stat glass"><div class="num">${AR(Object.keys(roles).length)}</div><div class="lbl">أدوار مشاركة</div></div>
    </div>

    <div class="section-title">🏆 ترتيب الأفكار حسب متوسط النتيجة</div>
    <div class="rank-card glass">${renderRanking()}</div>

    <div class="section-title">📋 الردود المُستلمة</div>
    <div class="resp-card glass">${renderTable()}</div>
  `;

  main.querySelectorAll('.expand-btn').forEach((b) => b.addEventListener('click', () => toggleDetail(b.dataset.id)));
  main.querySelectorAll('.icon-btn').forEach((b) => b.addEventListener('click', () => askDelete(b.dataset.id, b.dataset.name)));
}

function ideaAverages() {
  return DATA.ideas.map((idea) => {
    const vals = DATA.responses.map((r) => r.scores[idea.id]).filter((s) => s != null);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return { idea, avg, count: vals.length };
  }).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
}

function renderRanking() {
  const ranked = ideaAverages();
  const max = 100;
  return ranked.map((row, i) => {
    const avg = row.avg;
    return `
      <div class="rank-row">
        <div class="rank-pos">${AR(i + 1)}</div>
        <div class="rank-name">
          <div class="t">${esc(row.idea.title)} ${avg != null ? classPill(avg) : ''}</div>
          <div class="c">${esc(row.idea.category)} · ${AR(row.count)} تقييم</div>
        </div>
        <div class="rank-bar"><span style="width:${avg != null ? (avg / max) * 100 : 0}%"></span></div>
        <div class="rank-score">${avg != null ? fmt(avg) : '—'}</div>
      </div>`;
  }).join('');
}

function classPill(score) {
  if (score >= 90) return '<span class="pill g">أولوية عالية</span>';
  if (score >= 80) return '<span class="pill y">متوسطة</span>';
  if (score >= 60) return '<span class="pill o">منخفضة</span>';
  return '<span class="pill r">مستبعدة</span>';
}

function renderTable() {
  const rows = DATA.responses.map((r) => {
    const date = new Date(r.createdAt).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' });
    return `
      <tr>
        <td><strong>${esc(r.evaluator)}</strong></td>
        <td><span class="role-tag">${esc(r.role)}</span></td>
        <td class="avg-cell">${r.average != null ? fmt(r.average) : '—'}</td>
        <td>${esc(date)}</td>
        <td style="display:flex;gap:8px">
          <button class="expand-btn" data-id="${r.id}" title="عرض التفاصيل">⌄</button>
          <button class="icon-btn" data-id="${r.id}" data-name="${esc(r.evaluator)}" title="حذف الرد">🗑️</button>
        </td>
      </tr>
      <tr class="detail-row" id="detail-${r.id}" hidden><td colspan="5">${renderDetail(r)}</td></tr>`;
  }).join('');
  return `<table class="resp">
    <thead><tr><th>المقيّم</th><th>الدور</th><th>المتوسط</th><th>التاريخ</th><th>إجراءات</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function renderDetail(r) {
  const items = DATA.ideas.map((idea) => {
    const rr = (r.ratings && r.ratings[idea.id]) || {};
    const scores = DATA.criteria.map((c) => `${c.code}: ${rr[c.id] != null ? AR(rr[c.id]) : '—'}`).join(' · ');
    const note = (r.notes && r.notes[idea.id]) ? `<div class="di-note">📝 ${esc(r.notes[idea.id])}</div>` : '';
    const s = r.scores[idea.id];
    return `<div class="detail-idea">
      <div><div class="di-t">${AR(idea.id)}. ${esc(idea.title)}</div><div class="di-scores">${scores}</div>${note}</div>
      <div class="di-score">${s != null ? fmt(s) : '—'}</div>
    </div>`;
  }).join('');
  return `<div class="detail-inner">${items}</div>`;
}

function toggleDetail(id) {
  const row = document.getElementById('detail-' + id);
  if (row) row.hidden = !row.hidden;
}

// ===== الحذف =====
function askDelete(id, name) {
  pendingDelete = id;
  document.getElementById('modal-text').textContent = `هل تريد حذف رد المقيّم «${name}»؟ لا يمكن التراجع عن هذا الإجراء.`;
  document.getElementById('modal').hidden = false;
}
function closeModal() { pendingDelete = null; document.getElementById('modal').hidden = true; }
async function confirmDelete() {
  if (!pendingDelete) return;
  const id = pendingDelete;
  closeModal();
  try {
    const res = await fetch('/api/responses/' + id, { method: 'DELETE' });
    if (!res.ok) throw new Error();
    load();
  } catch (e) { alert('تعذّر حذف الرد.'); }
}

// ===== أدوات =====
function fmt(n) { return AR(Math.round(n * 100) / 100); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
