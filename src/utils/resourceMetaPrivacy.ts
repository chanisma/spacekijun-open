type ResourceMeta = Record<string, unknown> | null | undefined;

/**
 * Removes legacy personal-phone fields before resource metadata is sent to
 * Supabase. The database constraint is the final enforcement layer; this
 * helper keeps generic metadata editors and merge flows from attempting an
 * invalid write.
 */
export function withoutPersonalPhone(meta: ResourceMeta): Record<string, unknown> {
  if (!meta) return {};

  const {
    phone: _phone,
    hp: _hp,
    ...safeMeta
  } = meta;

  return safeMeta;
}
