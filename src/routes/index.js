import { Router } from 'express';
import multer from 'multer';
import { createAbstract, downloadAbstractFile } from '../controllers/abstractController.js';
import { createRegistration, confirmRegistration } from '../controllers/registrationController.js';
import { createOrder } from '../controllers/paymentController.js';
import { register, login, me, forgotPassword, resetPassword } from '../controllers/authController.js';

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
// Razorpay: create an order, then confirm (JSON) after the browser verifies the pay.
router.post('/payments/order', createOrder);
router.put('/registrations/:reference', confirmRegistration);

// ── Auth (real accounts + password reset) — additive, independent of the above.
router.post('/auth/register', register);
router.post('/auth/login', login);
router.get('/auth/me', me);
router.post('/auth/forgot-password', forgotPassword);
router.post('/auth/reset-password', resetPassword);

export default router;
