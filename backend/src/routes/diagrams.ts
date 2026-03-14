import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { GraphModel } from '../services/parserService';

const router = Router();

// In-memory store for MVP (replace with DB in production)
const store = new Map<string, { model: GraphModel; updatedAt: string }>();

/**
 * POST /api/diagrams
 * Body: { model: GraphModel, title?: string }
 * Returns: { id, model }
 */
router.post('/', (req: Request, res: Response) => {
  const { model, title } = req.body as { model?: GraphModel; title?: string };

  if (!model || !Array.isArray(model.nodes)) {
    return res.status(400).json({ error: '`model` with a `nodes` array is required.' });
  }

  const id: string = uuidv4();
  const updatedAt  = new Date().toISOString();
  const stored: GraphModel = {
    ...model,
    id,
    title: title ?? model.title ?? 'Untitled Diagram',
    metadata: { ...model.metadata, updatedAt },
  };

  store.set(id, { model: stored, updatedAt });
  return res.status(201).json({ id, model: stored });
});

/**
 * GET /api/diagrams/:id
 * Returns: { id, model }
 */
router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  // Validate UUID format to prevent injection-style lookups
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ error: 'Invalid diagram ID.' });
  }

  const entry = store.get(id);
  if (!entry) return res.status(404).json({ error: 'Diagram not found.' });

  return res.json({ id, model: entry.model });
});

/**
 * GET /api/diagrams
 * Returns a list of all saved diagrams (id + title + updatedAt).
 */
router.get('/', (_req: Request, res: Response) => {
  const list = Array.from(store.entries()).map(([id, { model, updatedAt }]) => ({
    id,
    title:     model.title ?? 'Untitled',
    updatedAt,
    nodeCount: model.nodes.length,
    edgeCount: model.edges.length,
  }));
  return res.json(list);
});

/**
 * DELETE /api/diagrams/:id
 */
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  if (!store.has(id)) return res.status(404).json({ error: 'Diagram not found.' });
  store.delete(id);
  return res.status(204).send();
});

export default router;
