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
