import Groq from 'groq-sdk';
import prisma from '../models/prisma';
import { HttpError } from '../utils/http-error';
import { buildSystemPrompt } from './chat-prompt.service';
import { upsertTodayInsight } from './chat-insight.service';
import {
  computeProfileClass,
  getClassModifiers,
  refreshProfileClass,
} from './profile-class.service';
import { buildWellnessSnapshot } from './wellness-snapshot.service';

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

    if (
      (role !== 'user' && role !== 'assistant' && role !== 'system') ||
      typeof content !== 'string'
    ) {
      throw new HttpError(400, 'Invalid message shape');
    }

    return { role, content };
  });
}

export async function chatWithAI(userId: string, rawMessages: unknown) {
  const messages = normalizeMessages(rawMessages);

  const [user, snapshot, classInfo] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, ageGroup: true },
    }),
    buildWellnessSnapshot(userId),
    computeProfileClass(userId),
  ]);

  const mods = getClassModifiers(classInfo.cls);

  const systemPrompt = buildSystemPrompt(
    { displayName: user?.displayName, ageGroup: user?.ageGroup },
    snapshot,
    classInfo.cls,
    'vi'
  );

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    // Giảm xuống để response ngắn gọn — bớt "máy móc, đưa loạt thông tin không cần thiết"
    max_tokens: 320,
    temperature: 0.75,
    // Penalize repetition để bớt cấu trúc lặp lại kiểu AI
    frequency_penalty: 0.3,
    presence_penalty: 0.2,
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
