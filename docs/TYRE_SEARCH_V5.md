# V5.0.1 — Tyre size search

Available Stock and supplier catalogues now include a Tyre size search panel with Single size and Narrow & wide modes. Both modes accept an optional brand or pattern filter and show stock availability. Searches can also be entered in the main search bar, for example `2254018 Michelin` or `2254018 + 2553518 Michelin`.

Full metric sizes match width, profile and rim exactly. Brand and pattern terms filter both owned and supplier results; a missing brand returns no matches. Supplier search previously ranked matching brands ahead of other brands. Show all brands now explicitly removes that filter. Existing flotation size searches also retain their exact size matching and filter the requested brand.

Narrow & wide mode validates both sizes and requires the wide tyre to have a greater width. Availability is reported separately for each size, including missing sizes. These are stock searches for the entered dimensions, not vehicle fitment recommendations.

The release includes unit tests for size formats, exact matching, brand and pattern filters, missing stock, and existing wheel and flotation search behaviour. Browser checks cover both search modes, supplier handoff, clear actions, validation and mobile layout.
