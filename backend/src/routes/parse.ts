import { Router, Request, Response } from 'express';
import { parseText, detectFormat } from '../services/parserService';

const router = Router();

/**
 * POST /api/parse
 * Body: { text: string }
 * Returns: { format, model }
 */
router.post('/', (req: Request, res: Response) => {
  const { text } = req.body as { text?: unknown };

  if (typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: '`text` field is required and must be a non-empty string.' });
  }

  // Limit input size to prevent abuse
  if (text.length > 50_000) {
    return res.status(413).json({ error: 'Input text exceeds maximum allowed size (50 000 chars).' });
  }

  const format = detectFormat(text);
  const model  = parseText(text);

  return res.json({ format, model });
});

export default router;
