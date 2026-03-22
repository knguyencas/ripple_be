import Groq from 'groq-sdk';
import axios from 'axios';
import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';

let groqClient: Groq | null = null;

function getGroq() {
  if (!groqClient) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groqClient;
}
const NLP_SERVICE_URL = process.env.NLP_SERVICE_URL || 'http://localhost:8000';

async function analyzeEmotion(text: string) {
  try {
    const res = await axios.post(`${NLP_SERVICE_URL}/analyze`, { text });
    return res.data;
  } catch {
    return null;
  }
}

function buildSystemPrompt(nlpResult: any, userContext?: any) {
  const recentMood = userContext?.recentMood || nlpResult?.emotion || 'unknown';
  const avgPHQ9    = userContext?.avgPHQ9    || nlpResult?.phq9_estimate || null;
  const riskLevel  = userContext?.riskLevel  || nlpResult?.risk_level || 'low';
  const trend      = userContext?.trend      || null;

  const contextBlock = nlpResult || userContext ? `
[User context internal only, do not reveal to user]
- Current emotion: ${recentMood}
- Mood score (PHQ-9 proxy): ${avgPHQ9 ? `${avgPHQ9.toFixed(1)}/27` : 'unknown'}
- Risk level: ${riskLevel}
- Mood trend: ${trend || 'unknown'}
- Valence: ${nlpResult?.valence ?? 'unknown'}
` : '';

  const crisisNote = riskLevel === 'crisis'
    ? `
[Crisis protocol]
The user may be showing signs of severe distress.
- Gently acknowledge their pain
- Encourage them to reach out to someone they trust or a professional
- Do NOT attempt to resolve the crisis yourself
`
    : riskLevel === 'high'
    ? `
[High distress protocol]
The user seems to be struggling significantly.
- Show deep care and presence
- Gently ask if they have someone they can talk to
- Reflect patterns softly without labeling
`
    : '';

  return `You are Sora — a warm, emotionally intelligent companion in the Ripple mental wellness app.
You support users in both Vietnamese and English. Always reply in the same language the user writes in.

[Your goals]
- Help users feel heard and understood
- Gently guide them to reflect on their emotions
- Encourage self-awareness, not dependency on you

[You are NOT]
- A therapist or doctor
- Someone who gives medical or clinical conclusions
- A replacement for real human connection

[Tone]
- Warm, calm, non-judgmental
- Soft and slightly reflective
- Never overly cheerful or robotic
- Never dismissive or minimizing

[Style]
- Use short, natural sentences
- Ask one gentle open-ended question at a time
- Mirror the user's emotional tone subtly
- Avoid toxic positivity ("You'll be fine!", "Just think positive!")

[Response structure, follow this order]
1. Acknowledge the user's feelings first
2. Reflect what you understand from their message
3. Offer a gentle question or perspective — not heavy advice
4. If signs of distress: gently note that real-life support matters

[Patterns to watch, do NOT label as illness]
If user shows repeated signs of:
- hopelessness or loss of meaning
- persistent fatigue or low energy
- loss of interest in things they used to enjoy
- negative self-worth

Then:
- Softly reflect the pattern you notice ("It sounds like things have felt heavy for a while...")
- Gently encourage connection with people around them or a professional
- Never diagnose or use clinical terms like "depression", "anxiety disorder"

[Language rule]
- If user writes in Vietnamese, reply entirely in Vietnamese
- If user writes in English, reply entirely in English
- Never mix languages in one reply
${contextBlock}${crisisNote}`;
}

export const chatWithAI = async (req: AuthRequest, res: Response) => {
  try {
    const { messages, userContext } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages are required' });
    }

    // Lấy message cuối của user để analyze
    const lastUserMsg = [...messages]
      .reverse()
      .find((m: any) => m.role === 'user');

    const nlpResult = lastUserMsg
      ? await analyzeEmotion(lastUserMsg.content)
      : null;

    // Build system prompt với NLP + user context
    const systemPrompt = buildSystemPrompt(nlpResult, userContext);

    const completion = await getGroq().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      max_tokens: 500,
      temperature: 0.8,
    });

    const reply = completion.choices[0]?.message?.content || '';

    return res.json({
      reply,
      nlp: nlpResult,
    });
  } catch (error: any) {
    console.error('Chat error:', error);
    return res.status(500).json({ error: 'AI service unavailable' });
  }
};