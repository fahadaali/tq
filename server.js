'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');

const { PROJECT, ROLES, CRITERIA, IDEAS, scoreIdea } = require('./data/dataset');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'responses.json');

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- تخزين بسيط في ملف JSON ----------
function readResponses() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function writeResponses(list) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

// إثراء الرد بالنتائج المحسوبة
function enrich(resp) {
  const perIdea = {};
  let totalSum = 0;
  let counted = 0;
  for (const idea of IDEAS) {
    const ratings = (resp.ratings && resp.ratings[idea.id]) || null;
    const s = scoreIdea(ratings);
    perIdea[idea.id] = s;
    if (s != null) { totalSum += s; counted++; }
  }
  const average = counted ? Math.round((totalSum / counted) * 100) / 100 : null;
  return { ...resp, scores: perIdea, average };
}

// ---------- واجهات API ----------

// إعدادات المنصة (الأفكار والمعايير والأدوار) للواجهة الأمامية
app.get('/api/config', (req, res) => {
  res.json({ project: PROJECT, roles: ROLES, criteria: CRITERIA, ideas: IDEAS });
});

// استلام رد جديد
app.post('/api/submit', (req, res) => {
  const body = req.body || {};
  const evaluator = String(body.evaluator || '').trim();
  const role = String(body.role || '').trim();
  const ratings = body.ratings || {};
  const notes = body.notes || {};

  if (!evaluator) return res.status(400).json({ error: 'اسم المقيّم مطلوب.' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'دور المقيّم غير صحيح.' });

  // التحقق من اكتمال جميع المعايير لكل فكرة
  for (const idea of IDEAS) {
    const r = ratings[idea.id];
    if (!r) return res.status(400).json({ error: `الفكرة رقم ${idea.id} غير مكتملة.` });
    for (const c of CRITERIA) {
      const v = Number(r[c.id]);
      if (!(v >= 1 && v <= 5)) {
        return res.status(400).json({ error: `تقييم غير مكتمل للفكرة ${idea.id} (${c.name}).` });
      }
    }
  }

  const record = {
    id: crypto.randomUUID(),
    evaluator,
    role,
    ratings,
    notes,
    createdAt: new Date().toISOString(),
  };

  const list = readResponses();
  list.push(record);
  writeResponses(list);

  res.json({ ok: true, id: record.id });
});

// كل الردود (للأدمن) — مُثراة بالنتائج
app.get('/api/responses', (req, res) => {
  const list = readResponses().map(enrich);
  res.json({ responses: list, ideas: IDEAS, criteria: CRITERIA });
});

// حذف رد
app.delete('/api/responses/:id', (req, res) => {
  const id = req.params.id;
  const list = readResponses();
  const next = list.filter((r) => r.id !== id);
  if (next.length === list.length) return res.status(404).json({ error: 'الرد غير موجود.' });
  writeResponses(next);
  res.json({ ok: true });
});

// ---------- التصدير ----------
function buildRows() {
  const list = readResponses().map(enrich);
  const rows = [];
  for (const r of list) {
    const row = {
      'المعرّف': r.id,
      'اسم المقيّم': r.evaluator,
      'الدور': r.role,
      'التاريخ': new Date(r.createdAt).toLocaleString('ar-SA'),
    };
    for (const idea of IDEAS) {
      const rr = (r.ratings && r.ratings[idea.id]) || {};
      for (const c of CRITERIA) {
        row[`فكرة ${idea.id} — ${c.code} ${c.name}`] = rr[c.id] != null ? rr[c.id] : '';
      }
      row[`فكرة ${idea.id} — النتيجة (من ١٠٠)`] = r.scores[idea.id] != null ? r.scores[idea.id] : '';
      row[`فكرة ${idea.id} — ملاحظة`] = (r.notes && r.notes[idea.id]) || '';
    }
    row['متوسط النتيجة'] = r.average != null ? r.average : '';
    rows.push(row);
  }
  return rows;
}

app.get('/api/export.csv', (req, res) => {
  const rows = buildRows();
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="evaluation_results.csv"');
  res.send('﻿' + csv); // BOM لدعم العربية في Excel
});

app.get('/api/export.xlsx', (req, res) => {
  const rows = buildRows();
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'النتائج');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="evaluation_results.xlsx"');
  res.send(buf);
});

// صفحة الأدمن
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`منصة التقييم تعمل على المنفذ ${PORT}`);
});
