alter table public.inventory_items
  drop constraint if exists inventory_items_reference_image_url_check;

alter table public.inventory_items
  add constraint inventory_items_reference_image_url_check
  check (
    reference_image_url is null
    or (
      char_length(reference_image_url) <= 2048
      and reference_image_url ~* '^(https?://|/storage/|/inventory/|/inventory-reference-library/|inventory-reference-images://)'
    )
  );
