import { GoogleGenerativeAI } from '@google/generative-ai';
import { Question } from '@/types';

// Add your Gemini API key to .env as VITE_GEMINI_API_KEY
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

if (!API_KEY) {
  console.warn('VITE_GEMINI_API_KEY is not set. Please add it to your .env file.');
}

const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

export interface GenerateQuestionsParams {
  text: string;
  numQuestions: number;
  type: 'mcq' | 'short-answer' | 'mixed';
  customPrompt?: string;
  difficulty?: 'easy' | 'medium' | 'hard' | 'mixed';
}

export async function generateQuestions(
  params: GenerateQuestionsParams
): Promise<Question[]> {
  if (!genAI) {
    throw new Error('Gemini API key is not configured. Please add VITE_GEMINI_API_KEY to your .env file.');
  }

  const { text, numQuestions, type, customPrompt, difficulty } = params;

  // Construct the prompt based on question type and difficulty
  let difficultyInstruction = '';
  if (difficulty && difficulty !== 'mixed') {
    difficultyInstruction = `- Difficulty level: ${difficulty.toUpperCase()} - ensure questions are appropriately challenging for this level`;
  } else if (difficulty === 'mixed') {
    difficultyInstruction = '- Mix difficulty levels across questions (easy, medium, and hard)';
  }

  const basePrompt = `You are an expert educator creating high-quality quiz questions. Based on the following educational content, generate exactly ${numQuestions} questions.

CONTENT:
${text}

REQUIREMENTS:
- Generate exactly ${numQuestions} questions
- Question type: ${type === 'mcq' ? 'Multiple Choice Questions (MCQ) with 4 options' : type === 'short-answer' ? 'Short Answer Questions' : 'Mix of MCQ and Short Answer'}
${difficultyInstruction}
- Each question should test understanding, not just recall
- For MCQs: provide 4 options (A, B, C, D) with only one correct answer
- Include brief explanations for answers
- Ensure questions cover different aspects of the content
- Make questions clear and unambiguous

${customPrompt ? `ADDITIONAL INSTRUCTIONS:\n${customPrompt}\n` : ''}

OUTPUT FORMAT (strict JSON):
Return ONLY a valid JSON array with this exact structure:
[
  {
    "id": "q1",
    "type": "${type === 'mcq' ? 'mcq' : type === 'short-answer' ? 'short-answer' : 'mcq'}",
    "question": "Question text here?",
    ${type === 'mcq' || type === 'mixed' ? '"options": ["Option A", "Option B", "Option C", "Option D"],' : ''}
    "answer": "${type === 'mcq' || type === 'mixed' ? 'A' : 'Expected answer or key points'}",
    "explanation": "Brief explanation of the correct answer"
  }
]

Generate the questions now:`;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(basePrompt);
    const response = await result.response;
    const responseText = response.text();

    // Extract JSON from response (remove markdown code blocks if present)
    let jsonText = responseText.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/, '').replace(/\n?```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/, '').replace(/\n?```$/, '');
    }

    const questions: Question[] = JSON.parse(jsonText);

    // Validate and enhance the questions
    return questions.map((q, index) => ({
      ...q,
      id: q.id || `q${index + 1}`,
      isBookmarked: false,
      isSelected: true,
    }));
  } catch (error) {
    console.error('Error generating questions with Gemini:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        throw new Error('Invalid API key. Please check your VITE_GEMINI_API_KEY in .env file.');
      }
      throw new Error(`Failed to generate questions: ${error.message}`);
    }
    
    throw new Error('Failed to generate questions. Please try again.');
  }
}

// Fallback demo questions for testing without API key
export function generateDemoQuestions(numQuestions: number, type: string): Question[] {
  const demoQuestions: Question[] = [
    {
      id: 'demo1',
      type: 'mcq',
      question: 'What is the primary purpose of React hooks?',
      options: [
        'To style components',
        'To manage state and lifecycle in functional components',
        'To create class components',
        'To handle routing'
      ],
      answer: 'B',
      explanation: 'React hooks allow functional components to use state and lifecycle features without writing class components.',
      isBookmarked: false,
      isSelected: true,
    },
    {
      id: 'demo2',
      type: 'mcq',
      question: 'Which data structure uses LIFO principle?',
      options: ['Queue', 'Stack', 'Array', 'Tree'],
      answer: 'B',
      explanation: 'Stack follows Last-In-First-Out (LIFO) principle where the last element added is the first to be removed.',
      isBookmarked: false,
      isSelected: true,
    },
    {
      id: 'demo3',
      type: 'short-answer',
      question: 'Explain the concept of closure in JavaScript.',
      answer: 'A closure is a function that has access to variables in its outer (enclosing) lexical scope, even after the outer function has returned.',
      explanation: 'Closures are created when a function is defined inside another function, giving the inner function access to the outer function\'s variables.',
      isBookmarked: false,
      isSelected: true,
    },
  ];

  return demoQuestions.slice(0, numQuestions);
}
