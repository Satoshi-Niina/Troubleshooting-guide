import express from 'express';
import { SearchService } from '../services/search';

const router = express.Router();
const searchService = new SearchService();

router.post('/search', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const results = await searchService.search(query);
    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 