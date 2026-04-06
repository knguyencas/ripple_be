import { Request, Response } from 'express';
import Groq from 'groq-sdk';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const groq   = new Groq({ apiKey: process.env.GROQ_API_KEY });

interface AuthRequest extends Request {
  userId?: string;
}

function buildSystemPrompt(userContext?: any): string {
  const lang  = userContext?.lang || 'vi';
  const isVi  = lang !== 'en';

  const contextBlock = userContext ? `
USER CONTEXT
Mood trend (last 5 days): ${userContext.trend ?? 'unknown'}
Average mood score: ${userContext.avgMood ?? 'unknown'}/10
Recent emotions: ${userContext.recentEmotions?.join(', ') || 'unknown'}
Risk level: ${userContext.riskLevel || 'low'}
` : '';

  const distressNote = userContext?.riskLevel === 'high'
    ? (isVi
        ? '\n User có dấu hiệu distress cao thì nhẹ nhàng gợi ý tìm kiếm hỗ trợ từ người thân hoặc chuyên gia.'
        : '\n User shows high distress thì gently encourage seeking support from loved ones or professionals.')
    : '';

  return `You are an emotionally intelligent AI companion in the Ripple app, designed to support users in tracking and understanding their emotions.

Your goals:
- Help users feel heard and understood
- Gently guide them to reflect on their emotions
- Encourage self-awareness, not dependency
- Avoid giving harmful advice or making diagnoses

You are NOT a therapist, doctor, or clinical professional. Never make clinical conclusions.

Tone: Warm, calm, non-judgmental. Soft and slightly reflective. Never overly cheerful or robotic.

Style:
- Short, natural sentences
- Ask gentle open-ended questions
- Mirror the user's emotions subtly
- Respond in the same language as the user (Vietnamese or English)

Response guidelines:
1. Acknowledge feelings first
2. Reflect what you understand
3. Offer a gentle question or perspective, not heavy advice
4. Avoid toxic positivity, dismissing feelings, or labeling mental illness
5. If user shows hopelessness, loss of interest, fatigue, or negative self-worth, please gently reflect the pattern without labeling
6. If severe distress then encourage real-life support
${contextBlock}${distressNote}`;
}

// POST /api/chat
export const chatWithAI = async (req: AuthRequest, res: Response) => {
  try {
    const userId   = req.userId!;
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages are required' });
    }

    const recentLogs = await prisma.personalLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    let userContext: any = null;
    if (recentLogs.length > 0) {
      const scores   = recentLogs.map(l => l.moodScore);
      const avgMood  = scores.reduce((a, b) => a + b, 0) / scores.length;
      const trend    = scores.length >= 2
        ? (scores[0] > scores[scores.length - 1] ? 'improving' : 'declining')
        : 'stable';
      const recentEmotions = recentLogs
        .map(l => l.nlpEmotion)
        .filter(Boolean) as string[];
      const riskLevel = recentLogs.find(l => l.alertLevel === 'high')
        ? 'high'
        : recentLogs.find(l => l.alertLevel === 'moderate')
          ? 'moderate'
          : 'low';

      userContext = {
        avgMood: Math.round(avgMood * 10) / 10,
        trend,
        recentEmotions,
        riskLevel,
      };
    }

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: buildSystemPrompt(userContext) },
        ...messages,
      ],
      max_tokens:  500,
      temperature: 0.8,
    });

    const reply = completion.choices[0]?.message?.content || '';

    return res.json({ reply });
  } catch (error: any) {
    console.error('Chat error:', error);
    return res.status(500).json({ error: 'AI service unavailable' });
  }
};
