# Exhibition preview assets

Prepared September 22, 2026, only for work-preview.html. Main content and book/ocean engines are unchanged.

- mediroute-presentation.pdf: unchanged copy of user-provided MediRoute_Presentation (2).pdf, 17 pages. Linked from the MediRoute exhibition and detail page; not preloaded. Both existing event photographs remain in place.

- email-demo.mp4: browser-compatible conversion of the user-provided `Screen Recording 2025-11-26 at 2.21.24 PM.mov` using macOS avconvert Preset1920x1080 with default metadata filtering and fast start. Replaces the private screenshot in the preview; original MOV unchanged. Click-to-play, metadata preload, pauses on case navigation.

  REDACTED September 23, 2026, replacing the file in place (6.12 MB -> 1.20 MB; 40.1 s,
  1920x1018, 60 fps and faststart unchanged, audio dropped). Opaque #CFD4D8 boxes cover the
  correspondent's full name, email address, avatar photograph, the signature block (title,
  personal site, email, La Jolla street address) and the side panel's From value. Box
  placement is anchored to the signature's UC seal, located by template match in all 2,406
  frames (score >= 0.995; seal y takes only 631 / 478 / 428, switching at 3.75 s and 20.7 s),
  because every occurrence sits at a fixed offset from it: -329 list row, -147 open header,
  +207 compose recipient. Verification: tesseract over all 802 frames of the output at 20 fps
  returns 0 hits for batmanov, abatmanov, ucsd.edu, voigt, 92093, github.io and candidate; the
  two avatar bands (seal -334..-289 and -152..-108) have pixel standard deviation < 3 across
  401 sampled frames. NOT redacted, deliberately: the bare first name in the message body and
  in the generated reply, which is the demo's own output, and the site owner's own address in
  the 8 s panel. The unredacted source MOV is untouched and is not served.

- mediroute-presentation.jpg and mediroute-event.jpg: user-provided presentation/event photographs, copied without altering the originals. The 590px presentation photograph is not enlarged beyond its native width.
- email-demo-private.jpg: reduced copy of the user-provided Compose X screenshot. LOCAL PREVIEW ONLY: includes personal correspondence, sender identity and contact information. Must be redacted/replaced and this private asset removed before any deployment. No publication is authorized by this addition. DELETED September 23, 2026 at the owner's request. Nothing referenced the file; the removal is permanent, with no Trash copy on this machine. The reduced screenshot no longer exists in this folder.

- investment.png: PNG export of the user-provided Tableau AperiohubInternship/Dashboard1 view. Original reporting date August 21, 2026; not a current quote or validation of the follow-up return.
- apple-country-user.png: user-provided September 22, 2026 11:16 PM screenshot replaces the previous apple.png export in the exhibition. Original framing and map attribution preserved; previous export retained but unused.
- carbon.png: captured slide 9 from the user's public AS Carbon Audit presentation, https://jiungmoon.shinyapps.io/slides/#/total-emissions-by-office-stacked-by-category.
- satellite.jpg: reduced 1800-pixel copy of user-provided Palembang_Ji_Moon.tiff; original TIFF remains untouched and is not served.
- research-map.jpg: rendered first page of user-provided econresearchlab.pdf. research-map.pdf is the unchanged source copy (32 MB; click-only, may need separate hosting/compression before any deployment).
- marketing.png: page 5 figure excerpt rendered from user-provided MGT 151.pdf, with complete chart axes and labels. marketing-report.pdf is the unchanged report.

Preview-only Marketing copy intentionally does not repeat the inconsistent uplift claim. It identifies the synthetic-data exercise, R² = 0.042 and nonsignificant channel coefficients. The source report and main-site content.json were not edited.

Images have intrinsic dimensions, async decoding and lazy loading except the first visible work. No Tableau/Shiny iframe or script runs inside the preview. External materials open on explicit click; no publication was performed.

- 2026-09-24: apple.png, carbon.png and research-map.pdf were unreferenced and moved to personal blog/_unused/dist/exhibits/.
