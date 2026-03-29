import axios from 'axios';

const NLP_URL = process.env.NLP_SERVICE_URL || 'http://localhost:8000';

interface NLPResult {
  severity:    string;
  severity_id: number;
  confidence:  number;
  phq_score:   number;
  dsm:         Record<string, number>;
  risk_flag:   boolean;
  c9_ideation: number;
}

export async function analyzeText(text: string, userId: string): Promise<NLPResult | null> {
  try {
    const { data } = await axios.post<NLPResult>(
      `${NLP_URL}/analyze`,
      { text, user_id: userId },
      { timeout: 15000 }
    );
    return data;
  } catch (err: any) {
    console.error('NLP service error:', err.message);
    return null;
  }
}

export function mapAlertLevel(nlp: NLPResult): string {
  if (nlp.risk_flag || nlp.severity_id === 4) return 'high';
  if (nlp.severity_id === 3) return 'moderate';
  return 'low';
}