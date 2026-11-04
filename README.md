# tavelarocque.com

Personal site of Tave La Rocque. Plain static HTML: no framework, no build step.

## Files

| File | What it is |
|---|---|
| `index.html` | The whole site: markup and CSS in one file |
| `404.html` | Not-found page (Netlify serves it automatically) |
| `resume.pdf` | Public web copy of the Quant resume (no phone number, domain email) |
| `fonts/` | Self-hosted Geist and Geist Mono variable fonts, with their OFL license |
| `favicon.svg`, `apple-touch-icon.png` | Browser tab and home-screen icons |
| `og.png` | Preview image shown when the link is shared (LinkedIn, iMessage, Slack) |
| `netlify.toml` | Security headers and long caching for fonts |
| `robots.txt`, `sitemap.xml` | Search engine basics |

## Edit and preview

```
cd ~/CODE/personal-site
python3 -m http.server 8000
```

Then open http://localhost:8000. Open the page through the server rather than double-clicking `index.html`, because the fonts load from `/fonts/`.

## Updating the resume

Replace `resume.pdf` with the new file under the same name. Keep the phone number and personal email off the public copy.

## Deploy

Hosted on Netlify. Pushing to the connected GitHub repo (or dragging this folder into Netlify's deploy page) publishes it. DNS lives at Namecheap; the iCloud mail records (MX, the two TXT records, and the `sig1._domainkey` CNAME) must stay untouched when changing site records.

## Things not to put on the public site

- Results still under a courtesy window or sealed (check the job-search handoff first).
- "Taped out" for protocol-emulator; it is designed for tapeout and passes signoff.
- Phone number, personal email, home address.
