[README.md](https://github.com/user-attachments/files/34460714/README.md)
# Privacy Before You Post

**Find out what your photos, captions, documents and videos give away before you share them online.**

Privacy Before You Post is a browser-based privacy checker. You give it a caption, a note, a set of files or a video bundle, and it tells you what a stranger could learn from it: contact details, identifiers, secrets, places, routines and the way small clues combine into an identity. It explains each finding in plain language, scores the overall exposure, and helps you produce a safer version.

![Next.js](https://img.shields.io/badge/Next.js-13.5-black?logo=nextdotjs)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.2-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.3-06B6D4?logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Auth-3ECF8E?logo=supabase&logoColor=white)
![Netlify](https://img.shields.io/badge/Deploy-Netlify-00C7B7?logo=netlify&logoColor=white)

---

## Why this exists

Most oversharing is accidental. A campus photo shows a building name, a caption mentions "my 10 AM exam tomorrow", a screenshot carries a phone number, a video's subtitle file contains an email address, a PNG's hidden text chunk holds GPS coordinates. Each clue looks harmless, but together they reveal who you are, where you will be and when.

This project makes those clues visible **before** you post, and it does the analysis in your browser so the content you are worried about is not sent anywhere to be checked.

## What it does

The app has two tools behind one sign-in.

### 1. Privacy Analyzer (text, social posts and files)

- Accepts free text, structured social-post fields (caption, hashtags, location, alt text) and uploaded files.
- Runs a deterministic rule engine and returns a **0 to 100 exposure score** with a classification: `SAFE`, `REVIEW`, `HIGH RISK` or `DO NOT POST`.
- Every finding is explainable: category, severity, confidence, masked evidence, why it matters and what to do about it.
- Lists **possible inferences** ("someone may estimate when you are likely to be in a particular place").
- Detects **cross-source clue combination**: when several items are analyzed together and more than one clue is found, an extra "Identity" finding is raised.
- **Privacy Editor** produces a safer rewrite of your text, lets you edit it, and shows a live before and after score comparison.
- Built-in demo posts (safe caption, campus post, high-risk post, multi-file case) so you can try it without your own data.
- Score history per session, so you can see the effect of each edit.

### 2. Video Privacy Studio (scan, repair, verify)

A separate scanner for a video plus its companion files (thumbnail, subtitles, transcript).

- **Container metadata scan** of the first and last 16 MB of MP4/MOV, WebM/MKV or AVI files, using magic-byte format detection. It looks for printable strings containing personal data and for the QuickTime location atom.
- **Subtitle scan** for SRT and VTT with timed cue parsing.
- **Transcript scan** for JSON (any nested `text` fields) or SRT.
- **Thumbnail inspection** for PNG and JPEG. PNG text and EXIF chunks are parsed directly.
- **Findings review table** with filters by modality and category, masked evidence by default, and a per-finding Redact or Ignore choice.
- **Risk timeline** showing which subtitle cues contain findings.
- **Repair and export**: sanitized `.srt`, redacted transcript `.txt` and a metadata-stripped PNG thumbnail, generated entirely in the browser.
- **Verification**: re-scans the exported copies, reports findings before, resolved and remaining, and confirms the original video was never modified using a SHA-256 comparison.
- **Seven-check matrix** that shows each module as `Checked`, `No input supplied`, `Not configured` or `Disabled`, so a module that did not run is never mistaken for a clean result.
- **Built-in test suite** of 12 checks you can run from the page.
- Light and dark studio themes.

## Detection coverage

### Privacy Analyzer

| Category | Severity | Weight | Triggered by |
|---|---|---|---|
| Sensitive information (credentials) | CRITICAL | 50 | Words such as password, api key, secret, token, private key, credential |
| Sensitive information (identifier) | CRITICAL | 40 | Student, employee, account or member ID patterns |
| Location | HIGH | 30 | Place terms such as university, campus, hostel, street, airport, office |
| Personal information (phone) | HIGH | 25 | Phone-number patterns |
| Personal information (email) | HIGH | 20 | Email addresses |
| Identity (combined clues) | HIGH | 20 | More than one source and more than one finding |
| Context | MEDIUM | 25 | Future plans: tomorrow, next week, flight, exam, meeting |
| Routine | MEDIUM | 20 | Exact times, or "every Monday" style recurrence |
| Digital footprint | LOW | 10 | `#hashtags` and `@handles` |
| Metadata | LOW | 10 | Image, video, PDF or document files present |

The score is the sum of weights capped at 100. `0 to 20` is SAFE, `21 to 50` is REVIEW, `51 to 75` is HIGH RISK and above 75 is DO NOT POST. Evidence shown in the UI is masked (for example `rahul•••@example.com`).

### Video Privacy Studio

| Category | How it is detected |
|---|---|
| Payment card | 13 to 19 digit sequences that pass the **Luhn checksum**, so random digit runs are rejected |
| Email | Standard address pattern |
| Phone | 10 to 15 digit numbers |
| Street address / GPS | Street-style addresses, plus latitude/longitude pairs range-checked to valid bounds (so version strings like `v10.2.1` are not flagged), plus the QuickTime location atom in MP4/MOV |
| Secret / API key | Stripe-style `sk_live_` and `sk_test_`, AWS `AKIA`, GitHub `ghp_` style tokens, Slack `xox` tokens, and `key=value` forms such as `password=...` |
| Metadata | PNG `tEXt`, `zTXt`, `iTXt`, `eXIf` and `tIME` chunks |

## Privacy model

- **Analysis runs in the browser.** Files are read with the File API in the tab. Nothing is uploaded for scanning.
- **Private session.** Starting a check creates a random session code (`PBYP-XXXXXX`, generated with `crypto.getRandomValues`) that expires after 30 minutes. Ending or expiring the session clears the in-memory queue, results, history and revokes object URLs.
- **Original files are read-only.** The Studio never modifies your video. It records the original's SHA-256 and checks it again after repair.
- **Masked by default.** Findings show masked evidence. Unmasked text is opt-in and stays in the tab.
- **What Supabase is used for.** Email and password authentication only. The app does not store your content or analysis results in Supabase.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 13.5 (App Router), React 18 |
| Language | TypeScript 5.2 |
| Styling | Tailwind CSS 3.3, custom CSS for the workspace and studio, `tailwindcss-animate` |
| UI primitives | shadcn/ui on Radix UI, `lucide-react` icons |
| Auth | Supabase Auth (`@supabase/supabase-js`) with email and password |
| Browser APIs | File API, Web Crypto (`crypto.subtle` SHA-256), Blob and object URLs, `sessionStorage` |
| Hosting | Netlify with `@netlify/plugin-nextjs` |

## Project structure

```
.
├── app/
│   ├── layout.tsx              # Root layout, fonts, metadata
│   ├── page.tsx                # Renders the single-page app
│   ├── globals.css             # App styles
│   └── studio.css              # Video Studio styles
├── components/
│   ├── privacy-app.tsx         # App shell: views, session lifecycle, analyzer UI
│   ├── auth/auth-gate.tsx      # Sign in and create account screen
│   ├── studio/
│   │   ├── video-studio.tsx    # Studio page: intake, modules, scan, repair
│   │   ├── studio-findings.tsx # Summary, module matrix, timeline, findings table
│   │   └── studio-repair.tsx   # Repair panel, verification, test suite, limitations
│   └── ui/                     # shadcn/ui components
├── hooks/
│   ├── use-auth.ts             # Supabase session hook
│   └── use-toast.ts
├── lib/
│   ├── privacy/
│   │   ├── analyzer.ts         # Rule-based analyzer, scoring, safer-text rewrite
│   │   ├── scan-engine.ts      # Regex rules, Luhn check, redaction, module status
│   │   ├── studio-pipeline.ts  # Scan, repair and verify pipeline for the Studio
│   │   ├── media-containers.ts # Format detection, binary and PNG inspection, PNG stripping, SHA-256
│   │   ├── subtitles.ts        # SRT/VTT cue parsing and SRT output, transcript parsing
│   │   ├── studio-samples.ts   # Sample subtitles, transcript and generated PNG
│   │   └── studio-tests.ts     # 12 built-in checks
│   ├── supabase.ts             # Supabase client
│   └── utils.ts
├── supabase/migrations/        # SQL for the privacy_sessions table
├── netlify.toml
└── next.config.js
```

## Getting started

### Prerequisites

- Node.js 18 or newer and npm
- A [Supabase](https://supabase.com) project (the app requires sign-in)

### 1. Clone and install

```bash
git clone https://github.com/pankajsoni-iitp/privacy-before-you-post.git
cd privacy-before-you-post
npm install
```

### 2. Configure environment variables

Create a `.env.local` file in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Both values are in your Supabase dashboard under **Project Settings, API**. They are required for both `npm run dev` and `npm run build`: the Supabase client throws on load if either is missing, which also fails the production build.

In **Authentication, Providers**, make sure Email is enabled. If your project requires email confirmation, new users must confirm before signing in.

### 3. Run it

```bash
npm run dev
```

Open <http://localhost:3000>, create an account, then choose **Start private check**. The demo buttons load fictional posts so you can see the analyzer work immediately. For the Studio, open **Video Scan** in the side rail and choose **Load sample bundle**.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run `tsc --noEmit` |

### Deploying to Netlify

`netlify.toml` is already configured (`npx next build` with the Next.js plugin). Add the two `NEXT_PUBLIC_SUPABASE_*` variables in the Netlify site settings **before** the first build, because the build fails without them. The build also downloads the Inter font from Google Fonts, so it needs outbound network access.

### Optional: database migration

`supabase/migrations/` contains a migration that creates a `privacy_sessions` table (session code, expiry, status, analysis count, last score) with row level security enabled and access limited to the service role. It is designed to hold operational metadata only, never content. The current app does not read or write this table, so you do not need to run it to use the app.

## Testing

The Video Studio ships with 12 browser-run checks. Open **Video Scan**, scroll to **Automated test suite** and choose **Run test suite**. They cover:

- Email, phone, GPS and secret detection, and masking of the email local part
- Luhn validation (a valid card is flagged, a one-digit-off card is rejected)
- No false GPS match on version numbers such as `v10.2.1`
- Subtitle cue parsing and timing
- End-to-end subtitle sanitizing (email and phone removed from exported SRT)
- PNG text-chunk detection and stripping
- MP4 signature recognition
- Module status reporting (`Not configured` when no transcript is supplied)
- SHA-256 against the published test vector for `abc`

Static checks:

```bash
npm run typecheck
npm run lint
```

## Technical highlights

- **Explainable, deterministic scoring.** Every point of the score traces to a named rule with a weight, so the result can be audited and reproduced. There is no opaque model.
- **Honest coverage reporting.** The module matrix and the Limitations panel state exactly which checks did not run, so a clean result is never presented as a guarantee.
- **Low false-positive design.** Luhn validation for cards, coordinate range checks, digit-count bounds for phones, and overlap resolution so one span is reported once.
- **Binary parsing without dependencies.** PNG chunk reader and rewriter (including CRC-32), magic-byte container detection and printable-string extraction are implemented directly on `Uint8Array`.
- **Bounded memory on large files.** Video container metadata is read from 16 MB windows at the head and tail via `File.slice`.
- **Tamper evidence.** SHA-256 before and after confirms the source video was left untouched.
- **Strict TypeScript** with typed domain models for findings, modalities, modules and repair results.

## Known limitations

These are stated in the app too, and are worth knowing before relying on it:

- **Rule-based, not machine learning.** Detection uses fixed patterns and keyword lists. Unusual formats can be missed and some look-alike values can be flagged.
- **Visual checks are not implemented.** Video frames are not decoded, so frame OCR, face detection and license-plate detection do not run. They appear as `Not configured`.
- **No speech recognition.** Only a transcript you supply is scanned, not the audio track.
- **No repaired video.** The video is not re-encoded, so container metadata remains in the original and a cleaned video copy is not produced.
- **JPEG metadata is scanned but not removed.** PNG metadata stripping is supported.
- **Uploads in the Analyzer are only partly analyzed.** Plain-text documents under 2 MB are read and analyzed. Images, video, audio and PDFs contribute a metadata-risk flag and their file names only, and Office formats such as `.docx` are accepted but not parsed.
- **Direct links.** Views such as `/analyze` are handled client-side. Opening one directly or refreshing on it will not resolve, so always start from `/`.

## Roadmap ideas

Drawn from the gaps listed above:

- In-browser frame sampling with OCR, face and plate detection (for example through WebAssembly or ONNX models)
- Client-side speech-to-text for the audio track
- Video re-encoding with redaction boxes and metadata stripping
- JPEG EXIF removal
- Text extraction from PDF and DOCX files
- Server-side use of the `privacy_sessions` table for operational reporting
- Real route files for `/analyze`, `/studio` and the other views, so deep links work

## Author

Built by [Pankaj Soni](https://github.com/pankajsoni-iitp).
