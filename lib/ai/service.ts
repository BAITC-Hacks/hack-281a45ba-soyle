import { analysisSchema, taskCardSchema } from "@/lib/ai/schemas";
import { getOpenAIClient } from "@/lib/ai/client";
import { analyzeSystemPrompt, cardSystemPrompt } from "@/lib/ai/prompts";

export interface AnswerItem { question: string; answer: string }

const questionBank = [
  { key: "users", question: "Кто будет основным пользователем решения в описанной ситуации?" },
  { key: "dataAndMaterials", question: "Какие данные или материалы по этой задаче уже доступны?" },
  { key: "expectedResult", question: "Какой конкретный результат должна представить студенческая команда?" },
  { key: "successCriteria", question: "По каким критериям вы поймёте, что задача решена успешно?" },
  { key: "constraints", question: "Какие сроки, технологии или другие ограничения нужно учитывать?" },
  { key: "interactionFormat", question: "В каком формате команда сможет взаимодействовать с представителем бизнеса?" },
  { key: "contact", question: "Какой контакт указать для связи команды с бизнесом?" },
] as const;

function fallbackAnalysis(initialDescription: string) {
  const lower = initialDescription.toLowerCase();
  const detectedInformation: Record<string, string | null> = {
    context: initialDescription,
    need: /хотим|нужно|необходимо|проблем/i.test(lower) ? initialDescription : null,
    users: /клиент|ученик|студент|сотрудник|пользовател/i.test(lower) ? initialDescription : null,
    dataAndMaterials: /данн|таблиц|опрос|материал|crm|отч[её]т/i.test(lower) ? initialDescription : null,
    expectedResult: /результат|прототип|сервис|дашборд|модель/i.test(lower) ? initialDescription : null,
    successCriteria: /метрик|критери|процент|снизить|увеличить/i.test(lower) ? initialDescription : null,
    constraints: /срок|недел|месяц|огранич|нельзя|бюджет/i.test(lower) ? initialDescription : null,
    contact: /@|телефон|контакт/i.test(lower) ? initialDescription : null,
    interactionFormat: /встреч|онлайн|офлайн|созвон/i.test(lower) ? initialDescription : null,
  };
  const missingInformation = Object.entries(detectedInformation).filter(([, value]) => !value).map(([key]) => key);
  let questions: string[] = questionBank.filter((item) => missingInformation.includes(item.key)).map((item) => item.question).slice(0, 5);
  if (questions.length < 3) {
    questions = [...questions, "Что в этой задаче имеет самый высокий приоритет?", "Какой объём решения реалистичен для первого прототипа?", "Какие факты команда должна обязательно учесть?"].slice(0, 3);
  }
  return { detectedInformation, missingInformation, questions };
}

function fallbackCard(initialDescription: string, answers: AnswerItem[]) {
  const joined = answers.map((item) => `${item.question}\n${item.answer}`).join("\n");
  const find = (pattern: RegExp) => answers.find((item) => pattern.test(item.question))?.answer ?? null;
  const firstSentence = initialDescription.split(/[.!?]/)[0]?.trim() || "Бизнес-задача";
  const industry = /учеб|ученик|образован|школ|студент/i.test(initialDescription) ? "Образование" : null;

  return {
    title: firstSentence.length > 100 ? `${firstSentence.slice(0, 97)}…` : firstSentence,
    industry,
    context: initialDescription,
    need: /хотим|нужно|необходимо|проблем/i.test(initialDescription) ? initialDescription : null,
    users: find(/пользовател|кто будет/i),
    dataAndMaterials: find(/данн|материал/i),
    constraints: find(/огранич|срок|технолог/i),
    expectedResult: find(/конкретный результат|представить/i),
    successCriteria: find(/критери|успеш/i),
    contact: find(/контакт|связ/i),
    interactionFormat: find(/формат|взаимодейств/i),
    _source: joined,
  };
}

function invalidAiResponse() {
  const error = new Error("AI вернул ответ в неподдерживаемом формате. Повторите запрос.");
  error.name = "AI_INVALID_RESPONSE";
  return error;
}

export async function analyzeTaskDraft(initialDescription: string) {
  const client = getOpenAIClient();
  if (!client) return { ...fallbackAnalysis(initialDescription), fallback: true, fallbackLabel: "DEMO FALLBACK" };

  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.1,
      messages: [{ role: "system", content: analyzeSystemPrompt }, { role: "user", content: initialDescription }],
    });
    const raw = completion.choices[0]?.message.content;
    const parsed = analysisSchema.safeParse(raw ? JSON.parse(raw) : null);
    if (!parsed.success) throw invalidAiResponse();
    return { ...parsed.data, fallback: false, fallbackLabel: null };
  } catch (error) {
    if (error instanceof Error && (error.name === "AI_INVALID_RESPONSE" || error instanceof SyntaxError)) throw invalidAiResponse();
    return { ...fallbackAnalysis(initialDescription), fallback: true, fallbackLabel: "DEMO FALLBACK" };
  }
}

export async function generateTaskCard(initialDescription: string, answers: AnswerItem[]) {
  const client = getOpenAIClient();
  if (!client) {
    const { _source: _unused, ...card } = fallbackCard(initialDescription, answers);
    void _unused;
    return { card: taskCardSchema.parse(card), fallback: true, fallbackLabel: "DEMO FALLBACK" };
  }

  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.1,
      messages: [
        { role: "system", content: cardSystemPrompt },
        { role: "user", content: JSON.stringify({ initialDescription, answers }) },
      ],
    });
    const raw = completion.choices[0]?.message.content;
    const parsed = taskCardSchema.safeParse(raw ? JSON.parse(raw) : null);
    if (!parsed.success) throw invalidAiResponse();
    return { card: parsed.data, fallback: false, fallbackLabel: null };
  } catch (error) {
    if (error instanceof Error && (error.name === "AI_INVALID_RESPONSE" || error instanceof SyntaxError)) throw invalidAiResponse();
    const { _source: _unused, ...card } = fallbackCard(initialDescription, answers);
    void _unused;
    return { card: taskCardSchema.parse(card), fallback: true, fallbackLabel: "DEMO FALLBACK" };
  }
}
