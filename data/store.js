'use strict';

// طبقة تخزين موحّدة:
// - إن توفّرت متغيّرات Supabase → يُستخدم جدول Postgres في Supabase (مناسب للإنتاج/Render).
// - وإلا → يُستخدم ملف JSON محلي data/responses.json (مناسب للتطوير المحلي).

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
const TABLE = process.env.SUPABASE_TABLE || 'responses';

let mode, supabase;
const DB_FILE = path.join(__dirname, 'responses.json');

if (SUPABASE_URL && SUPABASE_KEY) {
  const { createClient } = require('@supabase/supabase-js');
  // تمرير ws كـ transport يضمن عمل العميل على أي إصدار Node (Realtime يتطلب WebSocket).
  let WS;
  try { WS = require('ws'); } catch (e) { /* غير متوفر */ }
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: WS ? { transport: WS } : undefined,
  });
  mode = 'supabase';
  console.log('التخزين: Supabase (جدول «' + TABLE + '»)');
} else {
  mode = 'file';
  console.log('التخزين: ملف محلي data/responses.json (لم تُضبط متغيّرات Supabase)');
}

// ---- تحويل بين صيغة السجل في التطبيق وصف الصف في القاعدة ----
function rowToRecord(row) {
  return {
    id: row.id,
    evaluator: row.evaluator,
    role: row.role,
    ratings: row.ratings || {},
    notes: row.notes || {},
    createdAt: row.created_at || row.createdAt,
  };
}
function recordToRow(rec) {
  return {
    id: rec.id,
    evaluator: rec.evaluator,
    role: rec.role,
    ratings: rec.ratings || {},
    notes: rec.notes || {},
    created_at: rec.createdAt,
  };
}

// ---- عمليات الملف المحلي ----
function readFile() {
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (e) { return []; }
}
function writeFile(list) {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

// ---- واجهة التخزين ----
async function listResponses() {
  if (mode === 'supabase') {
    const { data, error } = await supabase
      .from(TABLE).select('*').order('created_at', { ascending: true });
    if (error) throw new Error('Supabase list: ' + error.message);
    return (data || []).map(rowToRecord);
  }
  return readFile();
}

async function addResponse(record) {
  if (mode === 'supabase') {
    const { error } = await supabase.from(TABLE).insert(recordToRow(record));
    if (error) throw new Error('Supabase insert: ' + error.message);
    return;
  }
  const list = readFile();
  list.push(record);
  writeFile(list);
}

async function deleteResponse(id) {
  if (mode === 'supabase') {
    const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select('id');
    if (error) throw new Error('Supabase delete: ' + error.message);
    return Array.isArray(data) && data.length > 0;
  }
  const list = readFile();
  const next = list.filter((r) => r.id !== id);
  if (next.length === list.length) return false;
  writeFile(next);
  return true;
}

// تشخيص آمن للاتصال (لا يكشف المفاتيح)
function keyKind(key) {
  if (!key) return 'مفقود';
  if (key.startsWith('sb_secret_')) return 'secret (يتجاوز RLS ✓)';
  if (key.startsWith('sb_publishable_')) return 'publishable (anon — يمنعه RLS ✗)';
  // مفاتيح JWT القديمة: فك الحمولة لقراءة الدور
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      if (payload.role === 'service_role') return 'service_role (يتجاوز RLS ✓)';
      if (payload.role === 'anon') return 'anon (يمنعه RLS ✗)';
      return 'JWT (role=' + payload.role + ')';
    } catch (e) { return 'JWT غير قابل للقراءة'; }
  }
  return 'غير معروف';
}

async function diagnose() {
  const out = {
    mode,
    hasUrl: !!SUPABASE_URL,
    urlHost: SUPABASE_URL ? SUPABASE_URL.replace(/^https?:\/\//, '').split('.')[0] + '.supabase.co' : null,
    hasKey: !!SUPABASE_KEY,
    keyKind: keyKind(SUPABASE_KEY),
    table: TABLE,
    ok: false,
    count: null,
    error: null,
  };
  if (mode !== 'supabase') {
    out.ok = true; out.note = 'وضع الملف المحلي — متغيّرات Supabase غير مضبوطة على الخادم.';
    return out;
  }
  try {
    const { count, error } = await supabase.from(TABLE).select('*', { count: 'exact', head: true });
    if (error) { out.error = error.message; out.hint = errorHint(error.message); }
    else { out.ok = true; out.count = count; }
  } catch (e) {
    out.error = String(e && e.message || e);
    out.hint = errorHint(out.error);
  }
  return out;
}

function errorHint(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('does not exist') || m.includes('not find the table') || m.includes('schema cache'))
    return 'الجدول «' + TABLE + '» غير موجود — شغّل ملف supabase_schema.sql في SQL Editor.';
  if (m.includes('row-level security') || m.includes('rls') || m.includes('permission') || m.includes('not authorized'))
    return 'سياسة RLS تمنع الوصول — تأكد أنك تستخدم مفتاح service_role / secret وليس anon / publishable.';
  if (m.includes('invalid api key') || m.includes('jwt') || m.includes('apikey'))
    return 'المفتاح غير صحيح — انسخ مفتاح service_role من Project Settings → API.';
  if (m.includes('fetch failed') || m.includes('enotfound') || m.includes('getaddrinfo'))
    return 'تعذّر الوصول للرابط — تحقق من صحة SUPABASE_URL.';
  return 'راجع رسالة الخطأ أعلاه.';
}

module.exports = { listResponses, addResponse, deleteResponse, diagnose, mode };
