import type { WritingTaskType } from '@/lib/writing-records'
import {
  Task2EssayLabels,
  Task2TopicLabels,
  type PromptSelection,
  type Task1ChartType,
  type Task2EssayType
} from '@/lib/writing-options'
import type { Task1ChartSpec, Task1ProcessSpec, Task1MapSpec } from '@/lib/task1-chart-schema'
import { getRandomFallbackQuestion } from '@/lib/task1-fallback-questions'

export type Task1TrainingType = 'academic' | 'general'
export type Task1QuestionType = Exclude<Task1ChartType, 'random'> | 'letter'
export type Task2QuestionType =
  | Exclude<Task2EssayType, 'random'>
  | 'opinion'
  | 'discussion'
  | 'advantages_disadvantages'
  | 'problem_solution'
  | 'two_part'
  | 'positive_negative'

export type WritingQuestion = {
  id: string
  taskType: Exclude<WritingTaskType, 'mock'>
  title: string
  promptLead: string
  promptDetail: string
  durationMinutes: number
  wordTarget: number
  questionType: Task1QuestionType | Task2QuestionType
  trainingType?: Task1TrainingType
  topic?: string
  generatedSource?: 'ai' | 'local-template' | 'static-bank' | 'user_upload'
  image?: string
  imageAlt?: string
  structuredData?: Record<string, unknown>
  chartSpec?: Task1ChartSpec
  processSpec?: Task1ProcessSpec
  mapSpec?: Task1MapSpec
}

export const Task1TrainingLabels: Record<Task1TrainingType, string> = {
  academic: 'Academic Task 1',
  general: 'General Training Task 1'
}

export const QuestionTypeLabels: Record<Task1QuestionType | Task2QuestionType, string> = {
  line_chart: 'Line chart',
  bar_chart: 'Bar chart',
  pie_chart: 'Pie chart',
  table: 'Table',
  map: 'Map',
  process: 'Process diagram',
  floor_plan: 'Floor plan',
  mixed_charts: 'Mixed charts',
  dynamic_chart: 'Dynamic chart',
  static_comparison: 'Static comparison',
  before_after: 'Before and after comparison',
  letter: 'Letter',
  opinion: 'Opinion',
  agree_disagree: 'Agree / Disagree',
  discussion: 'Discussion',
  discussion_opinion: 'Discussion',
  advantages_disadvantages: 'Advantages / Disadvantages',
  outweigh: 'Outweigh',
  problem_solution: 'Problem / Solution',
  cause_solution: 'Cause / Solution',
  two_part: 'Two-part Question',
  positive_negative: 'Positive / Negative Development',
  direct_question: 'Direct Question'
}

export const task1Questions: WritingQuestion[] = [
  {
    id: 't1-ac-line-remote-work',
    taskType: 'task1',
    title: 'Academic Task 1 - Line Chart',
    promptLead: 'The line chart below shows the percentage of employees working from home in four industries between 2018 and 2024.',
    promptDetail: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    durationMinutes: 20,
    wordTarget: 150,
    questionType: 'line_chart',
    trainingType: 'academic',
    image: '/ielts/task1-line-remote-work.svg',
    imageAlt: 'Line chart showing remote work percentages in technology, finance, education and retail from 2018 to 2024.',
    structuredData: {
      years: [2018, 2020, 2022, 2024],
      technology: [18, 34, 52, 48],
      finance: [12, 28, 41, 39],
      education: [8, 45, 36, 31],
      retail: [5, 12, 16, 15]
    }
  },
  {
    id: 't1-ac-table-commute',
    taskType: 'task1',
    title: 'Academic Task 1 - Table',
    promptLead: 'The table below compares the average daily commuting time in five cities in 2010 and 2025.',
    promptDetail: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    durationMinutes: 20,
    wordTarget: 150,
    questionType: 'table',
    trainingType: 'academic',
    image: '/ielts/task1-table-commute.svg',
    imageAlt: 'Table comparing average daily commuting time in minutes across five cities in 2010 and 2025.',
    structuredData: {
      unit: 'minutes',
      rows: [
        ['London', 74, 68],
        ['Toronto', 62, 71],
        ['Singapore', 48, 43],
        ['Sydney', 58, 64],
        ['Berlin', 44, 39]
      ]
    }
  },
  {
    id: 't1-ac-map-river-crossing',
    taskType: 'task1',
    title: 'Academic Task 1 - Map',
    promptLead: 'The maps below show a river crossing area in 1968 and in the present day, together with plans for future development.',
    promptDetail: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    durationMinutes: 20,
    wordTarget: 150,
    questionType: 'map',
    trainingType: 'academic',
    image: '/ielts/task1-map-harbour.svg',
    imageAlt: 'Two maps comparing a river crossing area in 1968 with its present layout and planned future development.',
    structuredData: {
      dataVersion: 'map-v2',
      changes: ['road bridge added', 'car parks built', 'housing expanded', 'footpath planned', 'church planned']
    },
    mapSpec: {
      title: 'River Crossing Area Development',
      dataVersion: 'map-v2',
      beforeLabel: '1968',
      afterLabel: 'Now and Future',
      panels: [
        {
          id: 'panel-1968',
          title: '1968',
          features: [
            { type: 'river', x: 220, y: 0, width: 105, height: 480, path: 'M220 0 C205 80 235 150 215 240 C200 320 230 400 215 480 L310 480 C325 390 300 310 320 225 C340 140 310 70 325 0 Z' },
            { type: 'road', x: 0, y: 250, width: 220, height: 4, style: 'current' },
            { type: 'ferry', x: 205, y: 240, width: 25, height: 30 },
            { type: 'forest', x: 25, y: 40, width: 150, height: 130, treeCount: 8 },
            { type: 'housing', x: 350, y: 45, rows: 3, columns: 3 }
          ]
        },
        {
          id: 'panel-now-future',
          title: 'Now and Future',
          features: [
            { type: 'river', x: 220, y: 0, width: 105, height: 480, path: 'M220 0 C205 80 235 150 215 240 C200 320 230 400 215 480 L310 480 C325 390 300 310 320 225 C340 140 310 70 325 0 Z' },
            { type: 'road', x: 0, y: 235, width: 520, height: 4, style: 'current' },
            { type: 'bridge', x: 220, y: 228, width: 90, height: 14 },
            { type: 'car_park', x: 25, y: 40, width: 90, height: 70, label: 'Car park' },
            { type: 'car_park', x: 25, y: 135, width: 145, height: 85, label: 'Car park' },
            { type: 'building_row', x: 120, y: 45, rows: 3, columns: 5, units: 5 },
            { type: 'housing', x: 365, y: 45, rows: 3, columns: 3 },
            { type: 'housing', x: 375, y: 270, rows: 2, columns: 3 },
            { type: 'footpath', x: 15, y: 330, path: 'M15 330 C100 350 200 370 350 380 C400 385 450 390 500 390', style: 'future' },
            { type: 'church', x: 335, y: 380, planned: true },
            { type: 'car_park', x: 410, y: 360, width: 95, height: 65, planned: true, label: 'Car park (planned)' }
          ]
        }
      ]
    }
  },
  {
    id: 't1-ac-process-water',
    taskType: 'task1',
    title: 'Academic Task 1 - Process',
    promptLead: 'The diagram below illustrates how rainwater is collected and treated for household use in a coastal town.',
    promptDetail: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    durationMinutes: 20,
    wordTarget: 150,
    questionType: 'process',
    trainingType: 'academic',
    image: '/ielts/task1-process-water.svg',
    imageAlt: 'Process diagram showing rainwater collection, filtering, storage, treatment and household supply.',
    structuredData: {
      stages: ['roof collection', 'gutter channel', 'filter', 'storage tank', 'UV treatment', 'household taps']
    }
  },
  {
    id: 't1-ac-bar-energy',
    taskType: 'task1',
    title: 'Academic Task 1 - Bar Chart',
    promptLead: 'The bar chart below shows the share of electricity generated from renewable sources in six countries in 2015 and 2025.',
    promptDetail: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    durationMinutes: 20,
    wordTarget: 150,
    questionType: 'bar_chart',
    trainingType: 'academic',
    image: '/ielts/task1-bar-energy.svg',
    imageAlt: 'Bar chart comparing renewable electricity shares in six countries in 2015 and 2025.',
    structuredData: {
      unit: 'percent',
      countries: ['Canada', 'Spain', 'Japan', 'Brazil', 'India', 'Germany']
    }
  },
  {
    id: 't1-gt-letter-library',
    taskType: 'task1',
    title: 'General Training Task 1 - Letter',
    promptLead: 'A local library has started closing earlier in the evening. Write a letter to the library manager.',
    promptDetail:
      'In your letter, explain why you use the library in the evening, describe how the new opening hours affect you, and suggest a solution.',
    durationMinutes: 20,
    wordTarget: 150,
    questionType: 'letter',
    trainingType: 'general',
    structuredData: {
      tone: 'semi-formal',
      bullets: ['reason for evening use', 'effect of earlier closing', 'suggested solution']
    }
  }
]

export const task2Questions: WritingQuestion[] = [
  {
    id: 't2-opinion-university-cost',
    taskType: 'task2',
    title: 'Task 2 - Opinion',
    promptLead:
      'Some people believe that university students should pay the full cost of their studies because higher education mainly benefits individuals.',
    promptDetail: 'To what extent do you agree or disagree?',
    durationMinutes: 40,
    wordTarget: 250,
    questionType: 'opinion',
    topic: 'education'
  },
  {
    id: 't2-discussion-public-transport',
    taskType: 'task2',
    title: 'Task 2 - Discussion',
    promptLead:
      'Some people think governments should invest more in public transport, while others believe roads for private cars should be the priority.',
    promptDetail: 'Discuss both views and give your own opinion.',
    durationMinutes: 40,
    wordTarget: 250,
    questionType: 'discussion',
    topic: 'transport'
  },
  {
    id: 't2-advantages-online-learning',
    taskType: 'task2',
    title: 'Task 2 - Advantages / Disadvantages',
    promptLead: 'More students are choosing online courses instead of attending classes on campus.',
    promptDetail: 'Do the advantages of this development outweigh the disadvantages?',
    durationMinutes: 40,
    wordTarget: 250,
    questionType: 'advantages_disadvantages',
    topic: 'education'
  },
  {
    id: 't2-problem-solution-food-waste',
    taskType: 'task2',
    title: 'Task 2 - Problem / Solution',
    promptLead: 'In many countries, large amounts of food are thrown away by shops and consumers.',
    promptDetail: 'What are the causes of this problem, and what measures can be taken to reduce it?',
    durationMinutes: 40,
    wordTarget: 250,
    questionType: 'problem_solution',
    topic: 'society'
  },
  {
    id: 't2-two-part-city-life',
    taskType: 'task2',
    title: 'Task 2 - Two-part Question',
    promptLead: 'Many young adults move from rural areas to large cities for work or study.',
    promptDetail: 'Why does this happen? Is it a positive or negative trend for rural communities?',
    durationMinutes: 40,
    wordTarget: 250,
    questionType: 'two_part',
    topic: 'urban_development'
  },
  {
    id: 't2-positive-negative-ai',
    taskType: 'task2',
    title: 'Task 2 - Positive / Negative Development',
    promptLead: 'Artificial intelligence is increasingly used to make decisions in areas such as recruitment, banking and healthcare.',
    promptDetail: 'Is this a positive or negative development?',
    durationMinutes: 40,
    wordTarget: 250,
    questionType: 'positive_negative',
    topic: 'technology'
  }
]

export const allQuestions = [...task1Questions, ...task2Questions]

export function getQuestionById(id: string | null | undefined) {
  if (!id) return null
  return allQuestions.find((question) => question.id === id) ?? null
}

export function randomQuestion(taskType: Exclude<WritingTaskType, 'mock'>) {
  const source = taskType === 'task1' ? task1Questions : task2Questions
  return source[Math.floor(Math.random() * source.length)] ?? source[0]
}

export function candidateQuestionsForSelection(taskType: Exclude<WritingTaskType, 'mock'>, selection: PromptSelection) {
  const source = taskType === 'task1' ? task1Questions : task2Questions
  const filtered = source.filter((question) => {
    if (taskType === 'task1') {
      return selection.task1ChartType === 'random' || question.questionType === selection.task1ChartType
    }
    const essayMatches =
      selection.task2EssayType === 'random' ||
      question.questionType === selection.task2EssayType ||
      (selection.task2EssayType === 'agree_disagree' && question.questionType === 'opinion') ||
      (selection.task2EssayType === 'discussion_opinion' && question.questionType === 'discussion')
    const topicMatches = selection.task2Topic === 'random' || question.topic === selection.task2Topic
    return essayMatches && topicMatches
  })
  return filtered.length > 0 ? filtered : source
}

export function randomQuestionForSelection(taskType: Exclude<WritingTaskType, 'mock'>, selection: PromptSelection) {
  const source = candidateQuestionsForSelection(taskType, selection)
  return source[Math.floor(Math.random() * source.length)] ?? source[0]
}

export function buildPrompt(question: WritingQuestion) {
  return `${question.promptLead}\n${question.promptDetail}`
}

export function buildMockQuestionSet() {
  return {
    task1: randomQuestion('task1'),
    task2: randomQuestion('task2')
  }
}

export function buildMockQuestionSetForSelection(selection: PromptSelection) {
  return {
    task1: randomQuestionForSelection('task1', selection),
    task2: randomQuestionForSelection('task2', selection)
  }
}

export function questionLabel(question: WritingQuestion) {
  if (question.taskType === 'task1' && question.trainingType) {
    return `${Task1TrainingLabels[question.trainingType]} · ${QuestionTypeLabels[question.questionType]}`
  }
  return QuestionTypeLabels[question.questionType]
}

const task2TopicNouns: Record<string, string> = {
  education: 'schools and universities',
  technology: 'digital technology',
  environment: 'environmental protection',
  society: 'modern society',
  government: 'government policy',
  health: 'public health',
  work: 'workplace culture',
  globalization: 'globalisation',
  media_advertising: 'media and advertising',
  transport: 'transport systems',
  urban_development: 'urban development',
  culture: 'local culture',
  crime: 'crime prevention',
  family: 'family life',
  teenagers: 'teenagers'
}

export function buildLocalGeneratedQuestion(
  taskType: Exclude<WritingTaskType, 'mock'>,
  selection: PromptSelection,
  attempt = 0
): WritingQuestion {
  const idSuffix = `${Date.now().toString(36)}-${attempt}`
  if (taskType === 'task1') {
    const chartType = selection.task1ChartType === 'random' ? ['line_chart', 'bar_chart', 'table', 'process', 'map'][attempt % 5] as Task1QuestionType : selection.task1ChartType
    const fallback = getRandomFallbackQuestion(chartType)
    return {
      id: `generated-task1-${chartType}-${idSuffix}`,
      taskType: 'task1',
      title: fallback.title,
      promptLead: fallback.prompt,
      promptDetail: fallback.instructions,
      durationMinutes: 20,
      wordTarget: 150,
      questionType: chartType,
      trainingType: 'academic',
      generatedSource: 'local-template',
      chartSpec: fallback.chartSpec,
      processSpec: fallback.processSpec,
      mapSpec: fallback.mapSpec,
      structuredData: {
        requestedChartType: selection.task1ChartType,
        requestedSubtype: selection.task1Subtype,
        attempt
      }
    }
  }

  const essayType = selection.task2EssayType === 'random' ? ['agree_disagree', 'discussion_opinion', 'problem_solution', 'two_part'][attempt % 4] as Task2QuestionType : selection.task2EssayType
  const topic = selection.task2Topic === 'random' ? ['education', 'environment', 'technology', 'work'][attempt % 4] : selection.task2Topic
  const topicNoun = task2TopicNouns[topic] || 'modern life'
  const lead = essayType === 'problem_solution' || essayType === 'cause_solution'
    ? `In many countries, problems related to ${topicNoun} are becoming more noticeable.`
    : essayType === 'discussion_opinion'
      ? `Some people believe ${topicNoun} should be shaped mainly by individuals, while others think institutions should take the lead.`
      : essayType === 'positive_negative'
        ? `${topicNoun.charAt(0).toUpperCase()}${topicNoun.slice(1)} is changing rapidly in many countries.`
        : `Some people believe that changes in ${topicNoun} bring more benefits than drawbacks.`
  const detail =
    essayType === 'agree_disagree'
      ? 'To what extent do you agree or disagree?'
      : essayType === 'discussion_opinion'
        ? 'Discuss both views and give your own opinion.'
        : essayType === 'advantages_disadvantages'
          ? 'What are the advantages and disadvantages of this development?'
          : essayType === 'outweigh'
            ? 'Do the advantages of this development outweigh the disadvantages?'
            : essayType === 'problem_solution'
              ? 'What are the main problems, and what measures can be taken to solve them?'
              : essayType === 'cause_solution'
                ? 'What are the causes of this problem, and what solutions can you suggest?'
                : essayType === 'positive_negative'
                  ? 'Is this a positive or negative development?'
                  : essayType === 'direct_question'
                    ? 'Why is this happening, and what effects does it have on society?'
                    : 'Answer both questions and give reasons for your response.'
  return {
    id: `generated-task2-${essayType}-${topic}-${idSuffix}`,
    taskType: 'task2',
    title: `Task 2 - ${Task2EssayLabels[essayType as Task2EssayType] || QuestionTypeLabels[essayType]}`,
    promptLead: lead,
    promptDetail: detail,
    durationMinutes: 40,
    wordTarget: 250,
    questionType: essayType,
    topic,
    generatedSource: 'local-template',
    structuredData: {
      requestedEssayType: selection.task2EssayType,
      requestedTopic: selection.task2Topic,
      topicLabel: Task2TopicLabels[topic as keyof typeof Task2TopicLabels],
      attempt
    }
  }
}
