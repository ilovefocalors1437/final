-- ============================================================
--  PASSPORT — กระดาน "บอกเล่าความรู้สึก"
--  วางทั้งไฟล์นี้ใน Supabase → SQL Editor → Run
--  รันซ้ำได้เรื่อยๆ ไม่พัง (ทุกคำสั่งเขียนให้รันทับของเดิมได้)
-- ============================================================
--
--  หลักคิดเรื่องความปลอดภัย:
--    - anon key อยู่ในหน้าเว็บ ทุกคนเห็นได้ → ไม่ใช่ความลับ
--    - สิ่งที่กันจริงคือ RLS + ฟังก์ชันฝั่ง server ในไฟล์นี้
--    - รหัสแอดมิน "ไม่เคย" อยู่ในโค้ดหน้าเว็บเลย เก็บที่นี่ที่เดียว
--      หน้าเว็บแค่ส่งสิ่งที่ผู้ใช้พิมพ์มาถาม server ว่าใช่ไหม
-- ============================================================

-- ---------- 1. ตารางโพสต์ ----------
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  student_id  text        not null,
  body        text        not null,
  parent_id   uuid        references public.posts(id) on delete cascade,
  pinned      boolean     not null default false,
  deleted     boolean     not null default false,
  created_at  timestamptz not null default now(),

  constraint student_id_6_digits check (student_id ~ '^[0-9]{6}$'),
  constraint body_length check (char_length(btrim(body)) between 1 and 500)
);

create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_parent_idx  on public.posts (parent_id);

-- ---------- 2. กันสแปม ----------
create or replace function public.check_post_rate()
returns trigger
language plpgsql
as $$
declare
  recent int;
begin
  select count(*) into recent
    from public.posts
   where student_id = new.student_id
     and created_at > now() - interval '1 minute';

  if recent >= 5 then
    raise exception 'posting too fast';
  end if;

  return new;
end;
$$;

drop trigger if exists posts_rate_limit on public.posts;
create trigger posts_rate_limit
  before insert on public.posts
  for each row execute function public.check_post_rate();

-- ---------- 3. ความลับของแอดมิน (anon แตะไม่ได้เลย) ----------
create table if not exists public.admin_secret (
  id         int primary key default 1,
  secret     text not null,
  display_id text not null,
  constraint single_row check (id = 1)
);

-- เผื่อเคยรันไฟล์เวอร์ชันก่อนหน้าไปแล้ว (ตอนนั้นยังไม่มีคอลัมน์นี้)
alter table public.admin_secret
  add column if not exists display_id text not null default '000000';

alter table public.admin_secret enable row level security;
-- ไม่มี policy = anon อ่านไม่ได้ เขียนไม่ได้ มองไม่เห็นด้วยซ้ำ

-- ---------- 4. RLS ของตารางโพสต์ ----------
alter table public.posts enable row level security;

drop policy if exists posts_read   on public.posts;
drop policy if exists posts_insert on public.posts;

create policy posts_read on public.posts
  for select using (deleted = false);

-- โพสต์ใหม่ต้องเริ่มที่ "ยังไม่ปักหมุด ยังไม่ถูกลบ" เสมอ
-- กันคนยิง API ตรงๆ แล้วปักหมุดให้ตัวเอง
create policy posts_insert on public.posts
  for insert with check (pinned = false and deleted = false);

-- ตั้งใจไม่มี policy สำหรับ update / delete → anon ทำไม่ได้เด็ดขาด

-- ---------- 5. เข้าสู่โหมดแอดมิน ----------
--  หน้าเว็บส่งสิ่งที่ผู้ใช้พิมพ์มาตรงนี้
--  ถ้าตรง → คืนเลขประจำตัวที่จะใช้แสดง (เช่น '029778')
--  ถ้าไม่ตรง → error เฉยๆ หน้าเว็บจะทำเหมือน "รหัสผิด" ธรรมดา
--
--  ผลลัพธ์คือทั้งสตริงลับและเลขที่ใช้แสดง ไม่มีอยู่ในโค้ดหน้าเว็บเลยสักตัว
create or replace function public.admin_login(p_secret text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  did text;
begin
  select display_id into did
    from public.admin_secret
   where id = 1 and secret = p_secret;

  if did is null then
    raise exception 'forbidden';
  end if;

  return did;
end;
$$;

revoke all on function public.admin_login(text) from public;
grant execute on function public.admin_login(text) to anon;

-- ---------- 6. ลบ / ปักหมุด ----------
create or replace function public.admin_moderate(
  p_secret  text,
  p_post_id uuid,
  p_action  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ok boolean;
begin
  select exists (
    select 1 from public.admin_secret
     where id = 1 and secret = p_secret
  ) into ok;

  if not ok then
    raise exception 'forbidden';
  end if;

  if p_action = 'delete' then
    -- ลบแบบ soft: ลูกๆ ที่ตอบใต้โพสต์นี้จะหายตามไปด้วยตอนแสดงผล
    update public.posts set deleted = true  where id = p_post_id;
  elsif p_action = 'pin' then
    update public.posts set pinned  = true  where id = p_post_id;
  elsif p_action = 'unpin' then
    update public.posts set pinned  = false where id = p_post_id;
  else
    raise exception 'unknown action';
  end if;
end;
$$;

revoke all on function public.admin_moderate(text, uuid, text) from public;
grant execute on function public.admin_moderate(text, uuid, text) to anon;

-- ============================================================
--  7. ตั้งค่าของพี่  ← แก้แค่ตรงนี้ที่เดียว
-- ============================================================
--
--  secret     = สิ่งที่พี่จะพิมพ์ในช่องกรอกรหัสเพื่อเข้าโหมดแอดมิน
--               ต้องขึ้นต้นด้วยเลข 5 ตัวแล้วตามด้วยตัวอักษร เพื่อให้ช่องกรอก
--               "ปลดล็อก" ให้พิมพ์ยาวเกิน 6 ตัวได้
--  display_id = เลข 6 หลักที่จะโชว์บนโพสต์ของพี่ (ต้องเป็นตัวเลขล้วน 6 ตัว)
--
--  ตัวอย่าง: พิมพ์ 02977focalorsgoat → เข้าโหมดแอดมิน แต่โพสต์ขึ้นชื่อ 029778
--            คนอื่นเห็นแค่เลขธรรมดา ไม่มีใครรู้ว่ามีระบบแอดมินอยู่

insert into public.admin_secret (id, secret, display_id)
values (1, '02977focalorsgoat', '029778')
on conflict (id) do update
  set secret     = excluded.secret,
      display_id = excluded.display_id;
