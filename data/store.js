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
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
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

module.exports = { listResponses, addResponse, deleteResponse, mode };
