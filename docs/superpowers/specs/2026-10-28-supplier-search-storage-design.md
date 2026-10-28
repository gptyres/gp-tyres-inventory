# Supplier search, performance and storage

## Intent and scope

- Route general stock searches to supplier stock only, as requested. Preserve supplier identity, selected supplier filters, exact tyre/wheel matching and existing supplier-specific searches. Browsing and managing owned inventory remains available.
- Reduce time to first useful result without implying a partial result set is complete. The baseline all-supplier search waited over 23 seconds before returning any results in one authenticated desktop browser session.
- Reduce image storage and future upload sizes without changing the product pictured, breaking existing references or losing originals.
- Back up and remove older retired supplier snapshots, preserving all active snapshots and the two most recent retired snapshots per supplier, as explicitly approved by the user.

## Approaches

- Search: the user chose supplier-only rather than combined shop-and-supplier results. Reuse the existing all-supplier search; do not merge supplier inventory into editable shop stock.
- Speed: progressively present completed supplier catalogues with a visible loading/incomplete state, rather than waiting for all selected suppliers or introducing a new server-side search with different matching rules. Preserve all supplier results and errors; do not treat partial loading as completion.
- Images: compare supported encodings at bounded dimensions, keep the existing image format/path and transparency where possible, and replace only if a verified backup exists and the optimized file is smaller. Skip unsupported or unsafe cases. Measure bytes saved; avoid paid image transformations.
- Database: export complete retired snapshot records and their item rows with counts and checksums before deletion. Guard against changes, preserve active and two newest retired versions, and verify after each batch. Do not claim physical disk recovery without measurement; deleted space may require maintenance or later reuse.

## Validation

- Add regression coverage for dashboard/header routing, supplier scoping, progressive loading, unknown/zero stock, and image optimization safeguards.
- Run focused and full tests, type checks and production build. Measure equivalent search interactions before/after where possible and report the measurement conditions and any unavailable field metrics.
- Compare image dimensions, transparency, object references and storage totals; keep an accessible local backup and a restore manifest. Never print credentials.
- Compare live snapshot pointers and catalogue counts before and after cleanup. Keep any snapshot or image that fails verification. Do not alter other customer or inventory data.
