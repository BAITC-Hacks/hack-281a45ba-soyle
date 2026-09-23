import { BUSINESS_ID, emptyFields, FIELD_KEYS } from './domain'
import type { AppState, FieldKey, Proposal, Task, TaskFields, Team } from './domain'

function task(
  id: string,
  company: string,
  fields: Partial<TaskFields>,
  confirmedFields: FieldKey[],
  published: boolean,
  day: number,
): Task {
  const date = `2026-09-${String(day).padStart(2, '0')}T08:00:00.000Z`
  return {
    id,
    ownerId: BUSINESS_ID,
    company,
    fields: { ...emptyFields(), ...fields },
    confirmedFields,
    published,
    createdAt: date,
    updatedAt: date,
    source: fields.need || fields.context || fields.title || '',
  }
}

/** Entirely synthetic demonstration data. Each call returns independent objects. */
export function createSeed(): AppState {
  const tasks: Task[] = [
    task('task-tourism', 'Nomad Travel · демо', {
      title: 'AI-гид по городам Казахстана',
      topic: 'Туризм и культура',
      context: 'Небольшое туристическое бюро составляет индивидуальные прогулочные маршруты по Алматы. Менеджер тратит около 40 минут на одну подборку.',
      need: 'Сократить время подготовки маршрута и учитывать интересы, доступное время и бюджет путешественника.',
      users: 'Самостоятельные путешественники 18–45 лет и менеджеры туристического бюро.',
      data: 'Синтетический CSV-каталог из 60 достопримечательностей: описание, координаты, время посещения и ориентировочная стоимость. Ссылки на открытые справочные материалы.',
      constraints: 'Прототип для одного города, русский язык, только предоставленный каталог. Не нужны оплата и бронирование.',
      result: 'Веб-прототип: пользователь выбирает интересы и получает маршрут на 2–4 часа с объяснением выбора мест.',
      success: 'Не менее 8 из 10 тестовых маршрутов укладываются в заданное время; каждое предложенное место присутствует в каталоге.',
      contact: 'Айдана, координатор демо-проекта · aidana@nomad.example',
      interaction: 'Установочная встреча на 20 минут, затем текстовая обратная связь два раза в неделю. Приёмка по 10 согласованным сценариям.',
    }, [...FIELD_KEYS], true, 22),
    task('task-access', 'Qala Lab · демо', {
      title: 'Карта доступной городской среды',
      topic: 'Город и общество',
      context: 'Городская инициатива собирает сведения о доступности общественных пространств, но записи находятся в разрозненных таблицах.',
      need: 'Дать жителям возможность найти место с пандусом, лифтом и доступным входом.',
      users: 'Люди с ограниченной мобильностью, родители с колясками и волонтёры.',
      data: 'Демонстрационная таблица из 40 объектов, координаты и отметки доступности; искусственные фотографии-заглушки.',
      result: 'Карта и список объектов с фильтрами по признакам доступности и карточкой места.',
      success: 'Фильтры проходят 12 заранее заданных проверок; информация о месте находится максимум за три действия.',
      contact: 'Данияр, представитель инициативы · team@qala.example',
      interaction: 'Еженедельная встреча и комментарии к прототипу в общей таблице.',
    }, FIELD_KEYS.filter((key) => key !== 'constraints'), true, 21),
    task('task-education', 'SkillBridge · демо', {
      title: 'Навигатор навыков для первой стажировки',
      topic: 'Образование',
      context: 'Карьерный центр вручную сопоставляет навыки студентов с требованиями стажировок.',
      need: 'Показывать студенту подходящие направления стажировок и конкретные пробелы в навыках.',
      data: '25 синтетических описаний стажировок и 15 вымышленных профилей студентов без персональных данных.',
      result: 'Прототип подбора трёх стажировок с понятным объяснением и списком навыков для развития.',
      success: 'Для 10 тестовых профилей результаты объяснимы и опираются только на предоставленные требования.',
      contact: 'Алия, карьерный консультант · hello@skillbridge.example',
    }, ['title', 'topic', 'context', 'need', 'data', 'result', 'success', 'contact'], true, 20),
    task('task-retail', 'Dala Market · демо', {
      title: 'Прогноз спроса для локального магазина',
      topic: 'Ритейл и аналитика',
      context: 'Небольшой магазин планирует закупки вручную. Популярные товары заканчиваются до следующей поставки.',
      need: 'Помочь управляющему оценить спрос на неделю и заранее заметить риск дефицита.',
      data: 'Синтетические ежедневные продажи 20 товаров за полгода, остатки и даты поставок в CSV.',
      result: 'Дашборд с прогнозом продаж на неделю, остатками и списком товаров, требующих внимания.',
      contact: 'Руслан, управляющий · owner@dala.example',
    }, ['title', 'topic', 'context', 'need', 'data', 'result', 'contact'], true, 19),
    task('task-eco', 'Taza Qala · демо', {
      title: 'Умный маршрут сбора вторсырья',
      topic: 'Экология и логистика',
      context: 'Команда волонтёров забирает вторсырьё из пунктов сбора раз в неделю. Адреса передают в переписке.',
      need: 'Собирать точки в общий список и предложить удобную последовательность объезда.',
      users: 'Координатор волонтёров и водители двух небольших машин.',
    }, ['title', 'topic', 'context', 'need', 'users'], true, 18),
    task('draft-cafe', 'Qadam Coffee · демо', {
      title: 'Ассистент для небольшой кофейни',
      topic: 'Сервисы и автоматизация',
      need: 'Хотим AI-помощника для кофейни. Сейчас вопросы гостей обрабатываем вручную, нужен понятный первый прототип.',
    }, [], false, 23),
    task('draft-agro', 'Jasyl Farm · демо', {
      title: 'Дневник наблюдений за теплицей',
      topic: 'Агротехнологии',
      context: 'В учебной теплице показания датчиков и наблюдения хранятся в бумажном журнале.',
      need: 'Объединить ежедневные записи и показать изменения температуры и влажности.',
    }, ['title', 'topic', 'context', 'need'], false, 22),
    task('draft-library', 'Open Kitap · демо', {
      title: 'Подбор книг по читательским интересам',
      topic: 'Образование',
      context: 'Учебная библиотека хочет помочь новым читателям ориентироваться в каталоге.',
      need: 'Предлагать книги по интересам пользователя с кратким объяснением.',
      data: 'Демо-каталог из 100 книг: жанр, аннотация и возрастная категория.',
      contact: 'Мадина, библиотекарь · books@kitap.example',
    }, ['title', 'topic', 'context', 'need', 'data', 'contact'], false, 21),
    task('draft-volunteer', 'Birge · демо', {
      title: 'Подбор волонтёрских проектов',
      topic: 'Город и общество',
      context: 'Волонтёрский клуб публикует проекты в нескольких каналах, и участникам сложно выбрать подходящий.',
      need: 'Подбирать проекты с учётом интересов и доступного времени волонтёра.',
      data: '30 синтетических проектов с датами, необходимыми навыками и продолжительностью.',
      result: 'Каталог с фильтрами и персональная подборка из трёх проектов.',
      success: 'Каждая рекомендация соответствует выбранному времени и имеет объяснение.',
    }, ['title', 'topic', 'context', 'need', 'data', 'result', 'success'], false, 20),
    task('draft-events', 'Orda Events · демо', {
      title: 'Помощник организатора студенческих событий',
      topic: 'Сервисы и автоматизация',
      context: 'Студенческий клуб вручную собирает обратную связь после мероприятий.',
      need: 'Сгруппировать отзывы по темам и выделить частые предложения участников.',
      users: 'Организаторы небольших студенческих мероприятий.',
      data: '200 синтетических отзывов в CSV без имён и контактов.',
      result: 'Страница загрузки текста отзывов и обзор тем с примерами.',
      success: 'Каждая тема подтверждается исходными отзывами; придуманные цитаты отсутствуют.',
      contact: 'Тимур, организатор · events@orda.example',
    }, ['title', 'topic', 'context', 'need', 'users', 'data', 'result', 'success', 'contact'], false, 19),
  ]

  const teams: Team[] = [
    { id: 'team-steppe', name: 'Steppe AI', description: 'Превращаем данные в полезные цифровые продукты.', initials: 'SA', color: '#6956E8', interests: ['Туризм и культура', 'Образование'], skills: ['AI / ML', 'Fullstack', 'UX-дизайн'], technologies: ['Python', 'React', 'TypeScript'] },
    { id: 'team-qadam', name: 'Qadam', description: 'Создаём понятные городские сервисы для людей.', initials: 'QA', color: '#1F9D80', interests: ['Город и общество', 'Экология и логистика'], skills: ['Frontend', 'Карты', 'UX-исследования'], technologies: ['React', 'Leaflet', 'Node.js'] },
    { id: 'team-nomad', name: 'Nomad Data', description: 'Любим аналитику, прогнозы и ясную визуализацию.', initials: 'ND', color: '#D2902E', interests: ['Ритейл и аналитика', 'Агротехнологии'], skills: ['Data Science', 'Аналитика', 'Визуализация'], technologies: ['Python', 'Pandas', 'SQL'] },
    { id: 'team-orbit', name: 'Orbit', description: 'Делаем небольшие продукты с вниманием к деталям.', initials: 'OR', color: '#4886D5', interests: ['Образование', 'Сервисы и автоматизация'], skills: ['Fullstack', 'Прототипирование', 'Тестирование'], technologies: ['TypeScript', 'React', 'FastAPI'] },
    { id: 'team-tamyr', name: 'Tamyr Tech', description: 'Технологии для устойчивого развития и сообществ.', initials: 'TT', color: '#BD618C', interests: ['Экология и логистика', 'Туризм и культура'], skills: ['Алгоритмы', 'Backend', 'Дизайн'], technologies: ['Python', 'Vue', 'PostgreSQL'] },
  ]

  const proposals: Proposal[] = [
    { id: 'proposal-guide-steppe', taskId: 'task-tourism', teamId: 'team-steppe', idea: 'Соберём персональный маршрут из проверенного каталога с объяснением каждого места.', plan: '1. Подготовить данные. 2. Реализовать подбор по интересам. 3. Показать маршрут и протестировать 10 сценариев.', timeline: '7 дней', prototypeUrl: 'https://example.com/demo/steppe-guide', createdAt: '2026-09-22T11:00:00.000Z', status: 'pending', milestoneConfirmed: false },
    { id: 'proposal-guide-tamyr', taskId: 'task-tourism', teamId: 'team-tamyr', idea: 'Добавим режим короткой прогулки с учётом времени и культурных интересов.', plan: 'Сначала спроектируем форму предпочтений, затем подбор и карту. В конце проверим длительность маршрутов.', timeline: '10 дней', prototypeUrl: 'https://example.com/demo/tamyr-guide', createdAt: '2026-09-22T12:30:00.000Z', status: 'pending', milestoneConfirmed: false },
    { id: 'proposal-access-qadam', taskId: 'task-access', teamId: 'team-qadam', idea: 'Карта доступности с быстрыми фильтрами и удобным списком объектов.', plan: 'Подготовить схему данных, собрать карту и список, провести проверку 12 сценариев доступности.', timeline: '8 дней', prototypeUrl: 'https://example.com/demo/qadam-map', createdAt: '2026-09-21T14:00:00.000Z', status: 'accepted', milestoneConfirmed: false },
    { id: 'proposal-retail-nomad', taskId: 'task-retail', teamId: 'team-nomad', idea: 'Начнём с объяснимого базового прогноза и выделим товары с риском дефицита.', plan: 'Проверка CSV, расчёт прогноза, дашборд остатков, сравнение с базовым методом.', timeline: '6 дней', prototypeUrl: 'https://example.com/demo/nomad-demand', createdAt: '2026-09-20T10:00:00.000Z', status: 'accepted', milestoneConfirmed: true },
    { id: 'proposal-education-orbit', taskId: 'task-education', teamId: 'team-orbit', idea: 'Прозрачный подбор стажировок по навыкам с персональным списком шагов для развития.', plan: 'Разметить навыки, создать функцию сопоставления, собрать интерфейс рекомендаций.', timeline: '5 дней', prototypeUrl: 'https://example.com/demo/orbit-skills', createdAt: '2026-09-21T09:00:00.000Z', status: 'pending', milestoneConfirmed: false },
    { id: 'proposal-eco-tamyr', taskId: 'task-eco', teamId: 'team-tamyr', idea: 'Простой планировщик объезда пунктов вторсырья. Начнём с уточнения адресов и вместимости машин.', plan: 'Уточнить исходные данные с координатором, сделать список точек и базовый алгоритм маршрута.', timeline: '7 дней после уточнения', prototypeUrl: 'https://example.com/demo/tamyr-route', createdAt: '2026-09-19T15:00:00.000Z', status: 'pending', milestoneConfirmed: false },
    { id: 'proposal-education-steppe', taskId: 'task-education', teamId: 'team-steppe', idea: 'Исследовательский прототип семантического поиска стажировок.', plan: 'Сравнить подходы поиска и подготовить отчёт по качеству.', timeline: '14 дней', prototypeUrl: 'https://example.com/demo/steppe-skills', createdAt: '2026-09-21T08:00:00.000Z', status: 'rejected', milestoneConfirmed: false },
  ]

  return { version: 1, tasks, teams, proposals }
}
