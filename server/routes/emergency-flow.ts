import { Router } from 'express';
import OpenAI from 'openai';
import { z } from 'zod';
import { db } from '../db';
import { emergencyFlows } from '../db/schema';
import { findRelevantImages } from '../utils/image-matcher';

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const generateFlowSchema = z.object({
  keyword: z.string().min(1),
});

router.post('/generate-emergency-flow', async (req, res) => {
  try {
    const { keyword } = generateFlowSchema.parse(req.body);

    // Generate flow using GPT
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `あなたは建設機械の故障診断の専門家です。
以下の形式で応急処置フローを生成してください：
1. タイトル：問題の簡潔な説明
2. 手順：具体的な対処方法を順番に説明
各手順は明確で、技術者でも素人でも理解できるように説明してください。`
        },
        {
          role: "user",
          content: `以下の故障状況に対する応急処置フローを生成してください：${keyword}`
        }
      ],
      response_format: { type: "json_object" },
    });

    const flowData = JSON.parse(completion.choices[0].message.content);

    // Find relevant images for each step
    const stepsWithImages = await Promise.all(
      flowData.steps.map(async (step: { description: string }) => {
        const relevantImages = await findRelevantImages(step.description);
        return {
          ...step,
          imageUrl: relevantImages[0]?.url || null,
        };
      })
    );

    const flow = {
      title: flowData.title,
      steps: stepsWithImages,
    };

    // Save to database
    await db.insert(emergencyFlows).values({
      title: flow.title,
      steps: flow.steps,
      keyword,
      createdAt: new Date(),
    });

    res.json(flow);
  } catch (error) {
    console.error('Error generating emergency flow:', error);
    res.status(500).json({ error: 'フローの生成に失敗しました' });
  }
});

export default router; 