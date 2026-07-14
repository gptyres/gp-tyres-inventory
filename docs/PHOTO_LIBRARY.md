# Explorer-Style Customer Photo Library

The Photo Library is the portal's customer-ready media workspace. It indexes active supplier tyre/wheel images and the GP wheel catalogue in Supabase, then exposes them through staff-session-protected Vercel APIs.

## Staff workflow

- Open **Photo Library** from the main sidebar.
- Search by supplier, brand, pattern, size, source, status, or tag.
- Click to select one photo, Ctrl/Cmd-click to toggle, or Shift-click to select a visible range.
- Use Ctrl/Cmd+A for all photos on the current page and Escape to clear.
- Use arrow keys to move focus, Space to toggle selection, and Enter to preview.
- Drag from empty grid space to select intersecting cards on desktop.
- Use **Copy image** or **Copy images** and paste into the customer chat. Platforms with multi-item clipboard support receive separate images together. On single-item clipboards, paste the current image and use **Copy next** to move through the prepared queue; image links are never substituted.
- Use **Share images** to send the selection as separate image attachments through the device share menu. The same action bar and clipboard queue are available in Wheel Catalogue.
- Use **Download selected** when a ZIP archive is the better hand-off.

## Access and security

- Login creates an HttpOnly `gp_staff_session` cookie. The photo APIs reject missing or expired sessions.
- The browser submits photo IDs only. Bucket names and storage paths are reloaded and authorized server-side.
- `public.photos` and `public.photo_activity` are not granted to browser roles. Vercel functions use the server-only Supabase key.
- Admin review changes also require the existing protected admin session.
- Existing wheel and supplier buckets remain public to avoid breaking current inventory visuals. The migration also creates a private `tyre-media` bucket for future customer media.

## Data synchronization

Migration `add_explorer_photo_library` backfills active rows from:

- `public.supplier_stock_images`
- `public.wheel_catalog_items`

Database triggers keep future inserts and updates synchronized into `public.photos`. Staff selection is temporary browser state and is never written to Supabase.

## Limits

- 60 photos per page.
- Ctrl/Cmd+A selects the current loaded page.
- Server authorization is processed in batches of 30 photos, while the staff action continues across the full current-page selection.
- 150 MB combined known source size per server batch manifest.
- The number of clipboard items retained at once depends on the operating system. The in-app **Copy next** queue handles single-item clipboards without falling back to URLs.
