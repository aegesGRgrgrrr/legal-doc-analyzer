# Legal Document Analyzer

Upload a contract (PDF or Word) and Claude reviews it: extracts key clauses, flags risk levels,
lists each party's obligations, notes missing standard protections, and gives a confidence-scored
plain-English summary — styled to match the Crow Holdings internal tool suite (same look as the
Deal Tear Sheet Generator).

This is a from-scratch build inspired by the feature set of
[superwise-ai/Legal_Document_Analyzer_AI](https://github.com/superwise-ai/Legal_Document_Analyzer_AI),
rebuilt on the Anthropic API (the same key already used by the other tools here) instead of a
separate Superwise account, so it can actually be used on real deal/legal documents.

## One-time setup

1. Get an API key from [console.anthropic.com](https://console.anthropic.com) → Settings → API Keys,
   and add a small amount of billing credit.
2. Copy `.env.example` to `.env` and paste your key into `ANTHROPIC_API_KEY`.

## Run it locally

Double-click `start.bat` (first run installs dependencies automatically — needs Python 3).

The terminal prints two links:
- `http://127.0.0.1:5002` — open this on your own machine
- `http://<your-ip>:5002` — share this exact link with coworkers on the same office/WiFi network

## Use it

Upload one or more PDF/.docx files for a single document set (e.g. a main agreement plus its
amendments), click **Analyze Document**. Results appear on the same page:

- **Summary** — plain-English overview and overall confidence score
- **Parties & Key Dates**
- **Clauses & Risk Flags** — one card per identified clause (indemnification, limitation of
  liability, termination, assignment, governing law, confidentiality, IP ownership, payment
  terms, renewal, force majeure, dispute resolution, insurance, reps & warranties, default &
  remedies, exclusivity, etc.), each with a high/medium/low/none risk badge and plain-English
  explanation
- **Obligations by Party** — concrete commitments and their triggers/deadlines
- **Missing / Absent Terms** — standard protections that appear to be missing, with why it
  matters and a recommendation
- **Ask About This Document** — a chat box to ask follow-up questions ("what happens if the
  tenant misses a payment?"). Claude answers using only the uploaded document's text, held in
  your browser tab for the session (see Limitations below) — nothing is saved server-side.

Use **Print / Save as PDF** to save a copy of the review for the file.

Uploads can total up to 800MB across all files. That said, the actual review is bounded by
Claude's context window, not file size — only the first ~600K characters of *extracted text*
across all documents are analyzed (most of an 800MB PDF set is images/fonts, not text, so this
covers the vast majority of real document sets). If a set is too large, a banner on the results
says so; split the upload into smaller batches to get full coverage.

Scanned/image-only PDFs (no text layer) can't be read — there's no OCR step. Old `.doc` files
need to be saved as `.docx` or PDF first.

## Publishing for remote / 24-7 access

Only do this if coworkers genuinely need access outside the office network. Since this handles
confidential legal documents, set a password before putting it online — do not skip it.

**1. Set a password.** Add these to your `.env`:
```
APP_PASSWORD=choose-something-only-your-team-knows
FLASK_SECRET_KEY=<a random 64-character hex string>
```
Generate a `FLASK_SECRET_KEY` with: `python -c "import secrets; print(secrets.token_hex(32))"`

**2. Push this folder to a GitHub repo** (`.env` is gitignored — your API key and password never
leave your machine unless you paste them into a hosting dashboard directly):
```
git remote add origin https://github.com/<you>/legal-doc-analyzer.git
git branch -M main
git push -u origin main
```

**3. Deploy on [Render](https://render.com):**
- Sign up, click **New → Web Service**, connect the GitHub repo you just pushed.
- **Build command:** `pip install -r requirements.txt`
- **Start command:** `gunicorn app:app`
- Under **Environment**, add `ANTHROPIC_API_KEY`, `APP_PASSWORD`, and `FLASK_SECRET_KEY`.
- Free tier works but spins down after inactivity (slow first load); the ~$7/mo Starter plan
  keeps it always-on.
- Render gives you a permanent `https://your-app.onrender.com` URL — share that instead of the
  LAN link.

Coworkers will hit a password screen first; anyone without the password can't reach the app or
its data.

## Important limitations

- This is an AI-assisted review for internal discussion, **not legal advice** — always verify
  against the source document and involve counsel for anything that matters.
- No OCR: scanned/image PDFs without a text layer can't be analyzed.
- Nothing is stored server-side beyond the life of each request — documents aren't persisted to
  disk or a database. The extracted document text is sent back to your browser tab so the chat
  feature can ask follow-up questions without the server keeping any state; it's held only in that
  tab's memory and is gone on refresh or if you close the tab.
- Very large multi-file uploads (approaching 800MB) can legitimately take several minutes to read
  and extract text from before analysis even starts — that's expected, not a hang.
- If Render's edge networking is in front of this app, its own request-size limits (independent of
  this app's 800MB setting) could reject very large uploads before they reach the server; if that
  happens with real-world documents, let Render support know or split the upload smaller.
