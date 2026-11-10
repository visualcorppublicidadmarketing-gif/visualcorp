import { learningAreas, learningGuides, learningPractices, learningChecklists } from '../server/learning/learning-content';
import { learningQuestions } from '../server/learning/learning-quiz';
import pantoneCatalog from '../server/learning/pantone-catalog.json';
import { createLearningContentHandler } from '../server/learning/learning-content-handler.js';

declare const process: { env: Record<string, string | undefined> };

const handler = createLearningContentHandler({
  env: process.env,
  loadResource: async (resource) => {
    if (resource === 'library') return { areas: learningAreas, guides: learningGuides, practices: learningPractices, checklists: learningChecklists };
    if (resource === 'pantone') return pantoneCatalog;
    if (resource === 'quiz') return learningQuestions;
    return null;
  },
});

export async function GET(request: Request) {
  return handler(request);
}
