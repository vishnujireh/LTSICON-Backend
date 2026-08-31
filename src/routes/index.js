import { Router } from 'express';
import multer from 'multer';
import { createAbstract, downloadAbstractFile } from '../controllers/abstractController.js';
import { createRegistration, confirmRegistration } from '../controllers/registrationController.js';

// Keep the file in memory so we can both save it to disk and attach it to email.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB guard
});

const router = Router();

// Accepts multipart/form-data (with optional `file`) OR plain JSON.
router.post('/abstracts', upload.single('file'), createAbstract);
router.get('/abstracts/file/:name', downloadAbstractFile);
router.post('/registrations', createRegistration);
// Confirm accepts multipart with a `screenshot` (payment proof) OR plain JSON.
router.put('/registrations/:reference', upload.single('screenshot'), confirmRegistration);
// Payment screenshots live in the same uploads/ folder, served by the same handler.
router.get('/registrations/file/:name', downloadAbstractFile);

export default router;
