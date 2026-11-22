/** One-line result of the last action, carried in the query string so it survives the redirect. */
export function Flash({ sp }: { sp: { error?: string; submitted?: string; moved?: string; deleted?: string } }) {
  if (sp.error)
    return (
      <p className="notice notice-error mb-6" role="alert">
        {sp.error}
      </p>
    );
  const msg = sp.submitted
    ? "Submitted. An admin will review it."
    : sp.deleted
      ? "Deleted."
      : sp.moved === "published"
        ? "Published."
        : sp.moved === "draft"
          ? "Moved back to draft."
          : sp.moved
            ? "Done."
            : null;
  return msg ? (
    <p className="notice mb-6" role="status">
      {msg}
    </p>
  ) : null;
}
