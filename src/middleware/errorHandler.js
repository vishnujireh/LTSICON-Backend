import multer from 'multer';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ ok: false, errors: [`Upload error: ${err.message}`] });
  }
  console.error('[error]', err);
  const isDbDown = ['ECONNREFUSED', 'ER_ACCESS_DENIED_ERROR', 'ENOTFOUND'].includes(err.code);
  return res.status(isDbDown ? 503 : 500).json({
    ok: false,
    errors: [isDbDown ? 'Database is unavailable. Please try again shortly.' : 'Internal server error.'],
  });
}

export function notFound(req, res) {
  res.status(404).json({ ok: false, errors: ['Not found.'] });
}
