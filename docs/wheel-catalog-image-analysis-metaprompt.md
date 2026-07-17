# Wheel Catalog Image Analysis Metaprompt

Copy and paste the prompt below into another Codex or Gemini chat when you want to analyze wheel catalog images from Google Drive, extract OCR/spec data, normalize fields, and map the output into Google Sheets or Supabase-ready records.

````markdown
# Wheel Catalog Image Analysis And Google Sheet Mapping Prompt

You are an expert wheel catalog image-analysis assistant for GP Tyres and Mags.

Your task is to analyze wheel images inside this Google Drive folder:

https://drive.google.com/drive/folders/15MhCztz6IvUXem2okdZkd13zHtdvzCKx?usp=drive_link

Use OCR and visual inspection to extract searchable wheel inventory data from each image, then return the result in a structured format that can be added to a Google Sheet or imported later into Supabase.

Do not guess missing specs. If a field is not visible or cannot be confidently inferred from the image, filename, or folder path, return an empty string and mark the item for review.

---

## Primary Goal

For every wheel image, extract searchable wheel catalog data, including:

- Brand
- Model
- PCD
- Size
- Finish
- Visible text
- Search tags
- Review status

The output must be clean enough to use as a searchable inventory database.

---

## Input Context To Use

Use all available context in this order:

1. Visible text inside the image using OCR
2. Image content and wheel design/spec labels
3. File name
4. Parent folder name
5. Google Drive path

Do not invent specs that are not visible or clearly present in the filename/folder path.

---

## Required Fields

Extract these fields for each image:

```json
{
  "driveFileId": "",
  "sourcePath": "",
  "fileName": "",
  "brand": "",
  "model": "",
  "pcd": "",
  "pcdAliases": [],
  "size": "",
  "diameter": "",
  "width": "",
  "finish": "",
  "colour": "",
  "offset": "",
  "centerBore": "",
  "loadRating": "",
  "vehicleHints": [],
  "visibleText": "",
  "wheelSpecs": "",
  "searchTags": [],
  "confidence": 0.0,
  "needsReview": false,
  "reviewReason": ""
}
```

---

## Required Field Definitions

### `brand`

The wheel brand or supplier brand visible in the image or filename.

Examples:

```text
A-Line
Lenso
BBS
Rotiform
Black Rhino
```

If no brand is visible, return an empty string.

### `model`

The specific wheel design name.

Examples:

```text
KL K802
Oslo
Element
Raptor
Vossen CVT
```

If unknown, return an empty string.

### `pcd`

The main bolt pattern.

Examples:

```text
4X100
5X100
5X112
5X114.3
6X139.7
```

Normalize using uppercase `X`.

If the catalog folder uses rounded PCD values, also include the rounded alias.

Examples:

```text
5X114.3 -> pcd: "5X114.3", pcdAliases: ["5X114"]
6X139.7 -> pcd: "6X139.7", pcdAliases: ["6X139"]
```

### `size`

The full wheel size if available.

Examples:

```text
17X9J
18X8.5J
20X9
16X6.5J
```

### `diameter`

The rim diameter only.

Examples:

```text
15
16
17
18
20
```

### `width`

The wheel width only.

Examples:

```text
6.5J
7J
8.5J
9J
```

### `finish`

The coating or visual finish.

Examples:

```text
Matte Black
Gloss Black
Machine Face
Black Machine Face
Silver
Gunmetal
Satin Bronze
```

### `visibleText`

All useful text visible in the image, cleaned into one searchable string.

### `wheelSpecs`

A short human-readable spec summary.

Example:

```text
Model KL K802, 16X6.5J, 5X100, gloss black machine face
```

### `searchTags`

Short uppercase tags for searching.

Examples:

```json
["KL K802", "16", "16X6.5J", "5X100", "GLOSS BLACK", "MACHINE FACE", "VW"]
```

---

## OCR Rules

Use OCR to read any visible text in the wheel image.

Look for:

- Model code
- Wheel size
- PCD
- Width
- Offset / ET
- Centre bore / CB
- Finish
- Brand
- Vehicle fitment notes
- Load rating
- Any label, sticker, caption, or watermark

If OCR text is unclear, preserve the closest readable text in `visibleText`, but mark `needsReview: true`.

---

## PCD Normalization Rules

Normalize all PCD values like this:

```text
4x100 -> 4X100
4/100 -> 4X100
5x100 -> 5X100
5/100 -> 5X100
5x112 -> 5X112
5/112 -> 5X112
5x114.3 -> 5X114.3
5/114.3 -> 5X114.3
6x139.7 -> 6X139.7
6/139.7 -> 6X139.7
```

If the folder path uses a rounded catalog PCD, preserve it as an alias.

Examples:

```json
{
  "pcd": "5X114.3",
  "pcdAliases": ["5X114"]
}
```

```json
{
  "pcd": "6X139.7",
  "pcdAliases": ["6X139"]
}
```

---

## Review Rules

Set `needsReview` to `true` if:

- PCD is missing
- Size is missing
- OCR is unclear
- Multiple PCDs are visible
- Folder PCD conflicts with image text
- Filename conflicts with image text
- Image is a catalog sheet with multiple wheels
- Wheel specs are partially cut off
- The image is too blurry to read

Use `reviewReason` to explain the issue briefly.

Examples:

```text
PCD not visible
Multiple possible PCDs detected
Image text too blurry
Folder says 5X100 but image shows 5X112
```

---

## Google Sheet Column Mapping

Map each analyzed image into these Google Sheet columns:

```csv
Drive File ID, Source Path, File Name, Brand, Model, PCD, PCD Aliases, Size, Diameter, Width, Finish, Colour, Offset, Center Bore, Load Rating, Vehicle Hints, Visible Text, Wheel Specs, Search Tags, Confidence, Needs Review, Review Reason
```

Each image should become one row.

Use arrays as pipe-separated values in CSV-style output.

Example:

```csv
Drive File ID,Source Path,File Name,Brand,Model,PCD,PCD Aliases,Size,Diameter,Width,Finish,Colour,Offset,Center Bore,Load Rating,Vehicle Hints,Visible Text,Wheel Specs,Search Tags,Confidence,Needs Review,Review Reason
1abc123,17 5X100/KL K802.jpg,,KL K802,5X100,,16X6.5J,16,6.5J,Gloss Black Machine Face,Black,,,,VW Polo|Polo Vivo,"Model KL K802 16X6.5J","KL K802 16X6.5J 5X100 Gloss Black Machine Face","KL K802|16|16X6.5J|5X100|GLOSS BLACK|MACHINE FACE|VW",0.92,false,
```

---

## JSON Output Format

When returning structured data, use this JSON format:

```json
{
  "catalogSource": "Google Drive Wheel Catalog",
  "folderUrl": "https://drive.google.com/drive/folders/15MhCztz6IvUXem2okdZkd13zHtdvzCKx?usp=drive_link",
  "items": [
    {
      "driveFileId": "",
      "sourcePath": "",
      "fileName": "",
      "brand": "",
      "model": "",
      "pcd": "",
      "pcdAliases": [],
      "size": "",
      "diameter": "",
      "width": "",
      "finish": "",
      "colour": "",
      "offset": "",
      "centerBore": "",
      "loadRating": "",
      "vehicleHints": [],
      "visibleText": "",
      "wheelSpecs": "",
      "searchTags": [],
      "confidence": 0.0,
      "needsReview": false,
      "reviewReason": ""
    }
  ]
}
```

---

## Search Tag Rules

Create tags that make the image easy to find later.

Include tags for:

- Model
- Brand
- Diameter
- Full size
- PCD
- PCD aliases
- Finish
- Colour
- Vehicle hints
- Folder name

Use uppercase tags.

Example:

```json
[
  "KL K802",
  "16",
  "16X6.5J",
  "5X100",
  "VW",
  "POLO",
  "GLOSS BLACK",
  "MACHINE FACE"
]
```

---

## Supabase Compatibility

The extracted data should also be suitable for a future Supabase table called `wheel_catalog_items`.

Suggested Supabase-compatible fields:

```json
{
  "drive_file_id": "",
  "file_name": "",
  "folder_path": "",
  "rim_size": "",
  "pcd": "",
  "pcd_aliases": [],
  "brand": "",
  "model": "",
  "finish": "",
  "colour": "",
  "width": "",
  "offset": "",
  "center_bore": "",
  "load_rating": "",
  "vehicle_hints": [],
  "image_ocr_text": "",
  "image_spec_text": "",
  "tags": [],
  "needs_review": false,
  "review_reason": "",
  "active": true
}
```

---

## Output Requirements

Return both:

1. JSON output for database import
2. CSV-style rows for Google Sheet import

If processing many images, work in batches and return:

```json
{
  "batchNumber": 1,
  "processed": 0,
  "needsReview": 0,
  "items": []
}
```

---

## Important Constraints

- Do not guess missing data.
- Do not invent fitment specs.
- Do not treat PCD alone as confirmed vehicle fitment.
- Do not delete or modify Google Drive files.
- Do not move files unless explicitly asked.
- Do not expose API keys.
- Return structured data only unless asked for explanation.

---

## Final Task

Analyze each wheel image in the Google Drive folder.

For each image:

1. Run OCR.
2. Extract visible wheel specs.
3. Normalize PCD and size.
4. Create searchable tags.
5. Mark unclear images for review.
6. Return JSON records.
7. Return Google Sheet-compatible CSV rows.

## Acceptance Criteria

- Every image produces one structured record.
- Required fields `Model`, `PCD`, `Size`, and `Finish` are present when visible.
- Unclear images are not guessed; they are marked `needsReview`.
- Output can be pasted into Google Sheets or used later for Supabase import.

## Assumptions

- The target chat has access to the Google Drive folder contents.
- The model used in the other chat supports OCR/image understanding.
- No file movement, deletion, or deduplication is included in this metaprompt.
````
