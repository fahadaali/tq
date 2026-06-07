-- جدول ردود التقييم في Supabase (Postgres)
-- شغّل هذا في: Supabase → SQL Editor → New query → Run

create table if not exists public.responses (
  id          uuid primary key,
  evaluator   text        not null,
  role        text        not null,
  ratings     jsonb       not null default '{}'::jsonb,
  notes       jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists responses_created_at_idx on public.responses (created_at);

-- تفعيل حماية الصفوف: لا أحد يصل للبيانات إلا عبر مفتاح الخدمة (service_role)
-- الذي يستخدمه الخادم فقط. مفتاح anon العام لن يرى أو يكتب شيئاً.
alter table public.responses enable row level security;

-- (اختياري) في حال أردت لاحقاً السماح للواجهة العامة بالكتابة مباشرة عبر anon،
-- يمكن إضافة سياسة insert. الإعداد الحالي يمرّ كل شيء عبر الخادم بمفتاح الخدمة، وهو الأأمن.
