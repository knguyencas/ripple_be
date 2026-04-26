import Groq from 'groq-sdk';
import prisma from '../models/prisma';
import { HttpError } from '../utils/http-error';
import { buildSystemPrompt, JournalPromptContext } from './chat-prompt.service';
import { upsertTodayInsight } from './chat-insight.service';
import { computePhaseContext } from './phase.service';
import {
  computeProfileClass,
  getClassModifiers,
  refreshProfileClass,
} from './profile-class.service';
import { fetchLifestyleContext } from './lifestyle.service';

type ChatRole = 'user' | 'assistant' | 'system';

interface ChatMessage {
  role: ChatRole;
  content: string;
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function normalizeMessages(messages: unknown): ChatMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new HttpError(400, 'Messages are required');
  }

  return messages.map((message) => {
    if (
      typeof message !== 'object' ||
      message === null ||
      !('role' in message) ||
      !('content' in message)
    ) {
      throw new HttpError(400, 'Invalid message shape');
    }

    const role = (message as { role: unknown }).role;
    const content = (message as { content: unknown }).content;

    if ((role !== 'user' && role !== 'assistant' && role !== 'system') || typeof content !== 'string') {
      throw new HttpError(400, 'Invalid message shape');
    }

    return { role, content };
  });
}

function buildJournalContext(
  recentLogs: Array<{ moodScore: number; nlpEmotion: string | null }>
): JournalPromptContext | null {
  if (recentLogs.length === 0) return null;

  const scores = recentLogs.map((log) => log.moodScore);
  const avgMood = scores.reduce((a, b) => a + b, 0) / scores.length;
  const trend = scores.length >= 2
    ? (scores[0] > scores[scores.length - 1] ? 'improving' : 'declining')
    : 'stable';
  const recentEmotions = recentLogs
    .map((log) => log.nlpEmotion)
    .filter((emotion): emotion is string => Boolean(emotion));

  return {
    avgMood: Math.round(avgMood * 10) / 10,
    trend,
    recentEmotions,
  };
}

export async function chatWithAI(userId: string, rawMessages: unknown) {
  const messages = normalizeMessages(rawMessages);

  const [user, recentLogs, classInfo] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, ageGroup: true },
    }),
    prisma.personalLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { moodScore: true, nlpEmotion: true },
    }),
    computeProfileClass(userId),
  ]);

  const mods = getClassModifiers(classInfo.cls);
  const phaseCtx = await computePhaseContext(userId, classInfo.cls, mods);
  const lifestyle = classInfo.cls === 'at_risk_baseline'
    ? await fetchLifestyleContext(userId, 7)
    : null;

  const systemPrompt = buildSystemPrompt(
    { displayName: user?.displayName, ageGroup: user?.ageGroup },
    phaseCtx,
    buildJournalContext(recentLogs),
    lifestyle,
    'vi'
  );

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    max_tokens: 500,
    temperature: 0.8,
  });

  const reply = completion.choices[0]?.message?.content || '';
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');

  if (lastUserMessage?.content) {
    void upsertTodayInsight(userId, lastUserMessage.content, classInfo.cls, mods)
      .then(() => refreshProfileClass(userId))
      .catch((error) => console.error('insight pipeline failed:', error));
  }

  return { reply };
}
