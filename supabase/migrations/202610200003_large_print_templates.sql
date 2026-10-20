-- Allow explicit print-layout metadata on new immutable template versions.
-- All legacy field and OMR validators still run against the original geometry.
alter function public.validate_template(jsonb) rename to validate_template_before_large_print;
create function public.validate_template(t jsonb) returns void
language plpgsql set search_path='' as $$
begin
 if t ? 'print_layout' and (jsonb_typeof(t->'print_layout') <> 'string' or t->>'print_layout' <> 'a4-25mm') then
  raise exception 'Unsupported print layout';
 end if;
 perform public.validate_template_before_large_print(t - 'print_layout');
end
$$;
revoke all on function public.validate_template_before_large_print(jsonb) from public, anon, authenticated;
revoke all on function public.validate_template(jsonb) from public, anon, authenticated;
