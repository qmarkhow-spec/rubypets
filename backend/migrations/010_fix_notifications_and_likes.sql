-- Fix notifications group_key conflict target and enforce unique likes.

-- Dedupe post_likes if legacy schema allowed duplicates.
delete from post_likes
where rowid not in (
  select min(rowid)
  from post_likes
  group by post_id, owner_id
);

create unique index if not exists uq_post_likes_post_owner
  on post_likes(post_id, owner_id);

-- Rebuild notifications group_key uniqueness to match ON CONFLICT(group_key).
delete from notifications
where group_key is not null
  and rowid not in (
    select min(rowid)
    from notifications
    where group_key is not null
    group by group_key
  );

drop index if exists uq_notifications_group_key;
create unique index if not exists uq_notifications_group_key
  on notifications(group_key);
