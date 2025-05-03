import OpenAI from 'openai';
import { db } from '../db';
import { images } from '../db/schema';
import { eq } from 'drizzle-orm';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface Image {
  id: string;
  url: string;
  description: string;
  embedding: number[];
}

export async function findRelevantImages(text: string): Promise<Image[]> {
  try {
    // Get text embedding from OpenAI
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });

    const textEmbedding = embeddingResponse.data[0].embedding;

    // Get all images from database
    const allImages = await db.select().from(images);

    // Calculate cosine similarity for each image
    const imagesWithSimilarity = allImages.map(image => ({
      ...image,
      similarity: cosineSimilarity(textEmbedding, image.embedding),
    }));

    // Sort by similarity and return top matches
    return imagesWithSimilarity
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3)
      .map(({ similarity, ...image }) => image);
  } catch (error) {
    console.error('Error finding relevant images:', error);
    return [];
  }
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  return dotProduct / (magnitudeA * magnitudeB);
} 