# Image prompts for Asmita illustrations

Generate each image, save it as a PNG with the exact file name given, and put it in
`docs/design/illustration-drafts/ai/`. Claude then converts it to a transparent WebP
for the site.

## How to generate

- Model: whichever gave the set you liked (GPT-5.4 Image 2 or Gemini 3 Pro Image). Use the same one for every image so the set matches.
- Aspect ratio: **4:3** unless a prompt says otherwise.
- One image per prompt is enough. Regenerate only if it breaks a rule below.
- Paste the **style block** first, then the scene.

## Style block (paste before every scene)

```
Hand-drawn single-weight continuous line illustration, black ink on a plain off-white (#f6f3f1) background. Minimal and airy, lots of empty space around the subject. One flat accent fill in deep teal (#0a5e5a) and a few small touches of soft coral (#ff9473). Indian women in everyday clothes (kurta, salwar, dupatta, saree), natural relaxed poses. Calm, dignified, quietly hopeful mood. Strictly no text, letters, numbers or logos anywhere. No nudity, no revealing clothing, no phone screens showing photos, no tears, no hands over faces, no padlocks, no hackers, no police. Not photorealistic.
```

## Rules to check before you keep an image

- No text or letters anywhere (models like to add them to signs, screens and papers).
- Nobody looks distressed or ashamed.
- Phone and laptop screens are blank or show only simple shapes.
- **Young people image: no people at all.** That page is for under-18s.

---

## Home page: audience buttons (shown when a button is hovered)

### 1. `audience-helping.png`
Scene: Two Indian women sitting close together on a sofa, one gently holding the other's hand, both calm, a cup of chai on a small table beside them. The supporting friend leans in, listening.

### 2. `audience-parents.png`
Scene: A mother in a saree and her grown-up daughter (clearly an adult, in her twenties, wearing a kurta) sitting at a kitchen table, the mother's hand resting on the daughter's shoulder, both looking at each other with warmth and trust. A teapot and two cups on the table.

### 3. `audience-young.png`
Scene: **No people.** A quiet still life on a study desk: a closed school notebook, a small potted plant, a mug, a phone lying face down, and a soft glowing desk lamp. A paper heart and a small speech-bubble shape float gently above the desk, suggesting a safe place to talk.

---

## Page headers (one image beside each page title)

### 4. `page-issue.png` (The issue)
Scene: A young woman standing calmly on a city street at dusk, looking up from her phone with quiet resolve, a few abstract floating speech bubbles and small shapes drifting away from her and fading.

### 5. `page-what-we-do.png` (What we do)
Scene: Two women working side by side at a wooden table with a laptop (blank screen), neatly stacked papers and a folder, one pointing at a paper, both focused and composed.

### 6. `page-how-it-works.png` (How it works)
Scene: A gentle winding path made of four flat stepping stones leading towards an open doorway with warm light, a single woman walking calmly on the second stone, small plants along the path.

### 7. `page-check-image.png` (Check AI / deepfake)
Scene: A woman sitting at a desk examining a printed photograph through a large magnifying glass, thoughtful and curious, the photograph shows only simple abstract shapes (no face, no body).

### 8. `page-resources.png` (Resources)
Scene: A woman standing beside a tall open bookshelf with a few books, a notebook and a small plant, holding an open book, a soft lamp nearby.

### 9. `page-faq.png` (FAQ)
Scene: Two women sitting across from each other at a café table with chai, one asking a question with an open hand gesture, the other answering with a reassuring smile. Three small blank speech-bubble shapes float between them.

### 10. `page-get-help.png` (Get help)
Scene: A woman sitting on a window seat talking on a phone held to her ear, relaxed and listening, a cushion behind her and morning light coming through the window.

### 11. `page-about.png` (About us)
Scene: A small group of four women of different ages sitting in a circle on floor cushions, talking warmly, one holding a notebook, a plant and a teapot in the middle.

### 12. `page-privacy.png` (Privacy)
Scene: A woman holding a small closed envelope close to her chest, standing in a calm room with a plant, eyes softly closed, peaceful and safe.

### 13. `page-contact.png` (Contact)
Scene: A woman at a desk writing a letter with a pen, a sealed envelope and a small paper bird beside her, soft light from a window.

---

## Estimated cost

13 images at about $0.13 to $0.21 each comes to roughly $1.70 to $2.75 on OpenRouter. Keep at least $1.00 above what you need: OpenRouter refuses image requests once less than $1.00 of the key's limit remains.

---

# Round 2 (November 2026): the remaining pages

Same model, same 4:3 ratio, same **style block** and the same rules as round 1.
Save each PNG with the exact name below into `docs/design/illustration-drafts/ai/`.

## Issue topics (one image per topic page, `/issue/...`)

These pages describe harm, so every scene is symbolic and calm. Nobody is shown as a victim.

### 14. `issue-ncii.png` (Intimate images shared without consent)
Scene: A woman standing at an open window, calmly letting a few small paper birds fly out into the sky, a potted plant on the sill.

### 15. `issue-deepfakes.png` (Deepfakes)
Scene: A woman standing in a gallery with her hand on her chin, calmly comparing two identical picture frames on the wall. Each frame shows only simple abstract shapes (no face, no body); the shapes in one frame are slightly warped and wavy.

### 16. `issue-morphing.png` (Morphed images)
Scene: Close view of a table from above: two hands calmly fitting torn pieces of paper with abstract shapes back together, a pair of scissors and a glue stick beside them. No faces, no bodies on the paper.

### 17. `issue-sextortion.png` (Threats and blackmail)
Scene: A woman at a kitchen table placing her phone face down, turning towards a friend who is handing her a cup of chai. Both are calm; the friend's other hand rests on her arm.

### 18. `issue-doxxing.png` (Personal details exposed)
Scene: A woman at home in the evening drawing a curtain across a window, a warm table lamp glowing beside a sofa with a cushion.

## Who we help: platforms and partners (`/who-we-help/platforms`)

### 19. `audience-platforms.png`
Scene: A woman and a man in office clothes sitting across a meeting table, both with laptops (blank screens), the woman sliding a neat folder across to him, both attentive and respectful.

## Resources sub-pages

### 20. `page-guides.png` (`/resources/guides`)
Scene: A woman sitting cross-legged on a sofa ticking boxes on a clipboard checklist with a pencil. The checklist has only blank lines and small boxes, three of them ticked.

### 21. `page-legal.png` (`/resources/legal`)
Scene: Two women at a desk in a quiet office, one an advisor in a blazer pointing to a page in an open folder (blank lines only), the other listening and nodding. A small balance scale sits on the desk.

### 22. `page-directory.png` (`/resources/directory`)
Scene: A woman at a table looking at a large folded paper map with simple winding roads and a few small teal dots. The map shows no country outline and no place names.

## Other pages

### 23. `page-glossary.png` (`/glossary`)
Scene: A large open book lying on a table, a woman's hand turning a page, a pencil and a small leaf beside it. The pages show only faint blank lines.

### 24. `page-research.png` (`/research`)
Scene: A woman at a desk studying a sheet with simple bar and line shapes (no numbers, no labels), a mug and a stack of papers beside her, thoughtful.

### 25. `page-terms.png` (`/terms` and `/legal`)
Scene: A woman sitting at a table calmly reading a single sheet of paper (blank lines only), a pen and a cup of tea beside her.

### 26. `page-talk.png` (`/talk`, the voice helpline)
Scene: A woman walking slowly through a park with wired earphones, talking and smiling slightly, trees and a bench behind her.

### 27. `page-feedback.png` (`/feedback`)
Scene: A woman dropping a small folded card into a simple wooden box with a slot, a plant on the shelf beside it.

## Estimated cost (round 2)

14 images at about $0.13 to $0.21 each comes to roughly $1.80 to $2.95. Keep $1.00 spare on the key, as before.
