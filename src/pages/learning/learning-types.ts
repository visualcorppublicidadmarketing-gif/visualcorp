export type LearningSection = {
  id: string;
  title: string;
  intro: string;
  points: string[];
  note?: string;
};

export type LearningGuide = {
  id: string;
  areaId: string;
  title: string;
  subtitle: string;
  duration: string;
  outcome: string;
  sections: LearningSection[];
  checklist: string[];
  source: string;
};

export type LearningArea = {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  accent: string;
  icon: string;
  guideIds: string[];
};

export type LearningPractice = {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  duration: string;
};

export type LearningChecklist = { id: string; label: string; tasks: string[] };
export type LearningLibrary = { areas: LearningArea[]; guides: LearningGuide[]; practices: LearningPractice[]; checklists: LearningChecklist[] };
export type LearningQuestion = { category: string; question: string; options: string[]; correct: number; explanation: string };
export type PantoneColor = { pantone: string; hex: string; name: string };
