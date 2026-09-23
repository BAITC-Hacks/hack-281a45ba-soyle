import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const base = {
  initialDescription: "Синтетическая демонстрационная задача для студенческих команд.",
  context: "У организации есть действующий процесс, который требует улучшения.",
  need: "Нужно найти проверяемое цифровое решение бизнес-проблемы.",
  users: "Сотрудники и клиенты демонстрационной организации.",
  dataAndMaterials: "Обезличенные таблицы, интервью и описание текущего процесса.",
  constraints: "Прототип должен быть готов за четыре недели и использовать только синтетические данные.",
  expectedResult: "Рабочий прототип и краткий отчёт с выводами.",
  successCriteria: "Прототип проходит пять ключевых сценариев и получает положительную оценку тестовой группы.",
  contact: "demo-business@example.com",
  interactionFormat: "Еженедельный онлайн-созвон и текстовые вопросы в общем канале.",
};

async function main() {
  await prisma.proposal.deleteMany();
  await prisma.businessTask.deleteMany();

  const task25 = await prisma.businessTask.create({ data: { ...base, title: "Навигация для посетителей кампуса", industry: "Городская среда", publicationStatus: "DRAFT", confirmedFields: JSON.stringify(["context", "need", "contact"]) } });
  const task45 = await prisma.businessTask.create({ data: { ...base, title: "Анализ обращений сервисного центра", industry: "Сервисы", publicationStatus: "PUBLISHED", confirmedFields: JSON.stringify(["context", "need", "dataAndMaterials", "contact"]) } });
  const task65 = await prisma.businessTask.create({ data: { ...base, title: "Прогноз загрузки учебных аудиторий", industry: "Образование", publicationStatus: "PUBLISHED", confirmedFields: JSON.stringify(["context", "need", "dataAndMaterials", "expectedResult", "users"]) } });
  const task80 = await prisma.businessTask.create({ data: { ...base, title: "Помощник для адаптации новых сотрудников", industry: "HR", publicationStatus: "PUBLISHED", confirmedFields: JSON.stringify(["context", "need", "dataAndMaterials", "expectedResult", "successCriteria", "users"]) } });
  const task95 = await prisma.businessTask.create({ data: { ...base, title: "Мониторинг доступности городских маршрутов", industry: "Транспорт", publicationStatus: "PUBLISHED", confirmedFields: JSON.stringify(["context", "need", "dataAndMaterials", "expectedResult", "successCriteria", "constraints", "users", "interactionFormat"]) } });

  await prisma.proposal.createMany({ data: [
    { taskId: task45.id, teamName: "Data North", solutionIdea: "Сгруппировать обращения и показать повторяющиеся причины на интерактивной панели.", plan: "Очистить синтетические данные, выделить темы, собрать панель и проверить её на контрольной выборке.", estimatedDuration: "3 недели", prototypeUrl: "https://example.com/prototype-1", status: "PENDING" },
    { taskId: task65.id, teamName: "Aula Lab", solutionIdea: "Создать прогноз занятости аудиторий с понятным календарным представлением.", plan: "Проверить данные, построить базовый прогноз, добавить интерфейс и провести тестирование сценариев.", estimatedDuration: "4 недели", prototypeUrl: "https://example.com/prototype-2", status: "ACCEPTED" },
    { taskId: task65.id, teamName: "Vector Team", solutionIdea: "Показать менеджеру аномальные периоды загрузки и предложить варианты расписания.", plan: "Провести разведочный анализ, реализовать правила аномалий и собрать демонстрационный интерфейс.", estimatedDuration: "3 недели", status: "PENDING" },
    { taskId: task80.id, teamName: "Onboarders", solutionIdea: "Собрать пошагового помощника для первых двух недель сотрудника.", plan: "Спроектировать путь, собрать контентный прототип, провести пять тестов и уточнить навигацию.", estimatedDuration: "2 недели", prototypeUrl: "https://example.com/prototype-3", status: "REJECTED" },
    { taskId: task95.id, teamName: "Urban Flow", solutionIdea: "Создать карту проверенных барьеров и приоритетов для улучшения маршрутов.", plan: "Нормализовать данные, построить карту, добавить фильтры и проверить доступность интерфейса.", estimatedDuration: "4 недели", prototypeUrl: "https://example.com/prototype-4", status: "PENDING" },
  ] });

  void task25;
}

main().finally(async () => prisma.$disconnect());
