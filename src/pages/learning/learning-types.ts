export type LearningTone =
  | 'neutral'
  | 'gold'
  | 'cyan'
  | 'green'
  | 'red'
  | 'violet'
  | 'blue'
  | 'amber'
  | 'mint';

export type LearningBadgeCell = {
  text: string;
  mono?: boolean;
  highlight?: boolean;
  badge?: string;
  badgeTone?: LearningTone;
};

export type LearningCardItem = {
  title: string;
  subtitle?: string;
  description?: string;
  icon?: string;
  badge?: string;
  badgeTone?: LearningTone;
  hex?: string;
  gradient?: string;
  darkText?: boolean;
  items?: string[];
};

export type LearningBlock =
  | {
      type: 'media';
      src: string;
      alt: string;
      caption?: string;
      badge?: string;
    }
  | {
      type: 'cards';
      columns?: 2 | 3 | 4;
      variant?: 'default' | 'compact' | 'swatch-solid' | 'platform' | 'metric';
      title?: string;
      items: LearningCardItem[];
    }
  | {
      type: 'tokens';
      title?: string;
      filename: string;
      parts: {
        token: string;
        label: string;
        help: string;
        tone: 'violet' | 'blue' | 'green' | 'amber' | 'red';
      }[];
    }
  | {
      type: 'color-layers';
      title?: string;
      layers: {
        name: string;
        swatch: string;
        subtitle: string;
        description: string;
        tag: string;
        tone: 'neutral' | 'blue' | 'red';
      }[];
    }
  | {
      type: 'diagram';
      kind:
        | 'rgb-vs-cmyk'
        | 'bleed-safe-zone'
        | 'laser-ai-file'
        | 'export-flow'
        | 'laser-focus-7mm'
        | 'workshop-kit'
        | 'quality-cards';
      eyebrow?: string;
      title?: string;
      subtitle?: string;
      labels: Record<string, string>;
      highlights?: string[];
      groups?: { title: string; tone?: LearningTone; items: string[] }[];
    }
  | {
      type: 'table';
      title?: string;
      headers: string[];
      rows: {
        group?: string;
        groupTone?: LearningTone;
        cells: LearningBadgeCell[];
      }[];
    }
  | {
      type: 'compare';
      items: {
        icon?: string;
        title: string;
        subtitle?: string;
        tone?: 'neutral' | 'danger' | 'success' | 'cyan' | 'amber' | 'violet';
        description?: string;
        points?: { text: string; highlight?: string }[];
      }[];
    }
  | {
      type: 'specs-grid';
      title?: string;
      items: {
        icon?: string;
        title: string;
        badge?: string;
        badgeTone?: LearningTone;
        specs: { label: string; value: string }[];
        note?: string;
      }[];
    }
  | {
      type: 'flow';
      title?: string;
      steps: {
        icon?: string;
        title: string;
        subtitle?: string;
        code?: string;
      }[];
    }
  | {
      type: 'tree';
      title?: string;
      lines: {
        text: string;
        tone?: 'root' | 'folder' | 'highlight' | 'file' | 'comment';
      }[];
    }
  | {
      type: 'steps';
      title?: string;
      layout?: 'list' | 'row';
      items: {
        number?: number;
        title: string;
        description: string;
        code?: string;
      }[];
    }
  | {
      type: 'callout';
      tone: 'tip' | 'warning' | 'danger' | 'success';
      icon?: string;
      title: string;
      text: string;
    }
  | {
      type: 'schedule';
      title?: string;
      items: {
        icon?: string;
        days: string;
        hours: string;
        note?: string;
        highlight?: string;
      }[];
    }
  | {
      type: 'quote';
      text: string;
      author?: string;
    }
  | {
      type: 'swatches';
      title?: string;
      items: {
        label: string;
        hex?: string;
        gradient?: string;
        darkText?: boolean;
      }[];
    }
  | {
      type: 'tool-links';
      title?: string;
      items: {
        title: string;
        description: string;
        practiceId: string;
        tone?: LearningTone;
      }[];
    };

export type LearningSection = {
  id: string;
  eyebrow?: string;
  icon?: string;
  title: string;
  intro: string;
  points: string[];
  note?: string;
  blocks?: LearningBlock[];
};

export type LearningGuide = {
  id: string;
  areaId: string;
  title: string;
  subtitle: string;
  duration: string;
  outcome: string;
  coverImage?: string;
  badge?: string;
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
  coverImage?: string;
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

export type LearningChecklist = {
  id: string;
  label: string;
  tasks: string[];
};

export type LearningLibrary = {
  areas: LearningArea[];
  guides: LearningGuide[];
  practices: LearningPractice[];
  checklists: LearningChecklist[];
};

export type LearningQuestion = {
  category: string;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
};

export type PantoneColor = {
  pantone: string;
  name: string;
  hex: string;
};
