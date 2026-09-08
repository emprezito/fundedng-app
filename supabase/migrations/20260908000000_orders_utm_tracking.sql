-- Order-level UTM attribution for Facebook ad → checkout funnel.
alter table orders
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text;

create index if not exists orders_utm_source_idx on orders (utm_source);