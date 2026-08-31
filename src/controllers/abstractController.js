import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool } from '../config/db.js';
import { env } from '../config/env.js';
import { validateAbstract } from '../utils/validate.js';
import { sendAbstractEmails } from '../services/emailService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

// Build a filesystem-safe, unique stored name that still hints at the original.
function makeStoredName(originalName) {
  const safe = (originalName || 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-80);
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
}

export async function createAbstract(req, res, next) {
  try {
    const { valid, errors, data } = validateAbstract(req.body || {});
    if (!valid) return res.status(400).json({ ok: false, errors });

    // Base URL for the download link: an explicit PUBLIC_BASE_URL wins,
    // otherwise derive it from the incoming request so it matches the live
    // domain automatically (e.g. https://ltsicon2026chennai.com). Prefer the
    // proxy-forwarded host/proto (Cloudflare, Nginx) when present.
    const proto = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('x-forwarded-host') || req.get('host');
    const baseUrl = env.publicBaseUrl || `${proto}://${host}`;

    // Persist the uploaded file (if any) to the uploads/ folder.
    let file = { name: null, size: null, mime: null, stored: null, buffer: null, url: null };
    if (req.file) {
      const stored = makeStoredName(req.file.originalname);
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      fs.writeFileSync(path.join(UPLOADS_DIR, stored), req.file.buffer);
      file = {
        name: req.file.originalname,
        size: req.file.size,
        mime: req.file.mimetype,
        stored,
        buffer: req.file.buffer,
        url: `${baseUrl}/api/abstracts/file/${encodeURIComponent(stored)}`,
      };
    }

    // 1) Trigger email first (as specified). Never let email failure block the save.
    const emailStatus = await sendAbstractEmails({
      ...data,
      fileName: file.name,
      fileMime: file.mime,
      fileBuffer: file.buffer,
      fileUrl: file.url,
    });

    // 2) Save to DB (metadata + the stored filename).
    const [result] = await getPool().execute(
      `INSERT INTO abstracts
        (first_name, last_name, email, mobile, institution, co_authors, membership_id,
         presentation_type, track, title, abstract_body, keywords,
         file_name, file_size, file_mime, file_path, declarations, email_status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        data.firstName,
        data.lastName,
        data.email,
        data.mobile,
        data.institution,
        data.coAuthors || null,
        data.membershipId || null,
        data.presentationType,
        data.track,
        data.title,
        data.abstractBody || null,
        data.keywords || null,
        file.name,
        file.size,
        file.mime,
        file.stored,
        JSON.stringify(data.declarations || []),
        emailStatus,
      ]
    );

    return res.status(201).json({
      ok: true,
      id: result.insertId,
      emailStatus,
      fileUrl: file.url,
      message: 'Abstract submitted successfully.',
    });
  } catch (err) {
    return next(err);
  }
}

// Streams a previously uploaded file back to the browser for download.
export async function downloadAbstractFile(req, res) {
  const name = String(req.params.name || '');
  // Reject anything that isn't a plain filename (block path traversal).
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
    return res.status(400).json({ ok: false, errors: ['Invalid file name.'] });
  }
  const full = path.join(UPLOADS_DIR, name);
  if (!full.startsWith(UPLOADS_DIR) || !fs.existsSync(full)) {
    return res.status(404).json({ ok: false, errors: ['File not found.'] });
  }

  // Present it with the original filename (strip the "<ts>-<rand>-" prefix).
  const original = name.replace(/^\d+-[a-z0-9]+-/, '').replace(/"/g, '');

  // Force a download instead of an in-browser preview: a generic binary
  // content-type plus an "attachment" disposition makes every browser save
  // the file rather than open it in a new tab.
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${original}"`);
  res.setHeader('Content-Length', fs.statSync(full).size);
  return fs.createReadStream(full).pipe(res);
}
