-- ============================================================
--  PASSPORT — กระดาน "บอกเล่าความรู้สึก"
--  วางทั้งไฟล์นี้ใน Supabase → SQL Editor → Run (ครั้งเดียวจบ)
-- ============================================================
--
--  ออกแบบไว้ให้ปลอดภัยแม้ทุกคนเห็นโค้ดฝั่งหน้าเว็บ:
--    - anon อ่านได้ และโพสต์ได้
--    - anon แก้/ลบ/ปักหมุดตรงๆ *ไม่ได้* (RLS ปิดไว้)
--    - การลบ/ปักหมุด ทำผ่านฟังก์ชันที่ตรวจรหัสแอดมิน "ฝั่ง server" เท่านั้น
--    - ตารางเก็บรหัสแอดมิน anon อ่านไม่ได้เลย
--
--  ทำไมถึงต้องเป็นแบบนี้: anon key ถูกออกแบบมาให้เปิดเผยได้ (มันอยู่ในหน้าเว็บ
--  ทุกคนเปิดดูได้อยู่แล้ว) สิ่งที่กันจริงคือ RLS ไม่ใช่การซ่อน key
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

  -- รหัสประจำตัวต้องเป็นเลข 6 หลักเป๊ะ (บังคับซ้ำฝั่ง server ไม่เชื่อฝั่งหน้าเว็บ)
  constraint student_id_6_digits check (student_id ~ '^[0-9]{6}$'),
  -- กันโพสต์ว่างและกันคนวางนิยายทั้งเรื่อง
  constraint body_length check (char_length(btrim(body)) between 1 and 500)
);

create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_parent_idx  on public.posts (parent_id);

-- ---------- 2. กันสแปม ----------
-- เด็กเบื่อๆ กดรัวได้ ตรงนี้จำกัดว่า 1 รหัสประจำตัว โพสต์ได้ไม่เกิน 5 ครั้ง/นาที
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

-- ---------- 3. รหัสแอดมิน (anon อ่านไม่ได้) ----------
create table if not exists public.admin_secret (
  id     int primary key default 1,
  secret text not null,
  constraint single_row check (id = 1)
);

alter table public.admin_secret enable row level security;
-- ไม่สร้าง policy ใดๆ เลย = anon เข้าไม่ถึงตารางนี้ทั้งอ่านและเขียน

-- ---------- 4. เปิด RLS ให้ตารางโพสต์ ----------
alter table public.posts enable row level security;

drop policy if exists posts_read   on public.posts;
drop policy if exists posts_insert on public.posts;

-- ใครก็อ่านได้ แต่เห็นเฉพาะอันที่ยังไม่ถูกลบ
create policy posts_read on public.posts
  for select using (deleted = false);

-- ใครก็โพสต์ได้ แต่บังคับให้เริ่มต้นเป็น "ยังไม่ปักหมุด ยังไม่ถูกลบ"
-- กันคนยิง API ตรงๆ แล้วตั้ง pinned = true ให้ตัวเอง
create policy posts_insert on public.posts
  for insert with check (pinned = false and deleted = false);

-- ตั้งใจไม่สร้าง policy สำหรับ update/delete → anon ทำไม่ได้เด็ดขาด

-- ---------- 5. ฟังก์ชันสำหรับแอดมิน ----------
-- security definer = รันด้วยสิทธิ์เจ้าของตาราง จึงข้าม RLS ได้
-- แต่จะทำงานก็ต่อเมื่อรหัสที่ส่งมาตรงกับที่เก็บไว้เท่านั้น
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

-- ---------- 6. ตั้งรหัสแอดมินของเครื่องพี่ ----------
--  แก้ 'CHANGE-ME' ให้เป็นรหัสยาวๆ เดาไม่ได้ แล้วเอารหัสเดียวกันนี้
--  ไปกรอกในเว็บครั้งเดียว (ปุ่มโหมดแอดมิน) เว็บจะจำไว้ในเครื่องนี้เครื่องเดียว
--
--  สร้างรหัสสุ่มได้ที่ https://www.random.org/strings/ หรือใช้บรรทัดนี้ใน terminal:
--      python -c "import secrets; print(secrets.token_urlsafe(24))"
insert into public.admin_secret (id, secret)
values (1, 'CHANGE-ME')
on conflict (id) do update set secret = excluded.secret;
