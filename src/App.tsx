import { useEffect, useRef, useState } from 'react';
import { BUSINESS_ID, emptyFields, getRating, getTeamPoints, updateProposalStatus, confirmMilestone, type AppState, type Role, type Task, type Proposal, type RatingLevel } from './domain';
import { createSeed } from './seed';
import { useProjectStorage, type CommitResult } from './useProjectStorage';
import { downloadText, backupFilename } from './download';
import DataTools from './DataTools';
import { Icon, EmptyState, RatingBadge, type IconName } from './components';
import TaskEditor from './TaskEditor';
import TaskDetail, { ProposalCard } from './TaskDetail';

type Page = 'catalog' | 'mine' | 'proposals' | 'teams' | 'guide' | 'detail' | 'editor';
const levelOptions: { value: RatingLevel; label: string }[] = [{ value: 'clarify', label: 'Черновик' }, { value: 'working', label: 'Рабочая' }, { value: 'ready', label: 'Готовая' }, { value: 'priority', label: 'Приоритетная' }];
const pageNames: Record<Page, string> = { catalog: 'Каталог задач', mine: 'Мои задачи', proposals: 'Предложения команд', teams: 'Сообщество команд', guide: 'Как это работает', detail: 'Карточка задачи', editor: 'Конструктор задачи' };
const topicStyles: Record<string, { icon: IconName; color: string }> = {
  'Туризм и культура': { icon: 'briefcase', color: 'sand' }, 'Город и общество': { icon: 'people', color: 'blue' },
  'Ритейл и аналитика': { icon: 'briefcase', color: 'sand' }, 'Экология и логистика': { icon: 'leaf', color: 'mint' },
  'Ритейл': { icon: 'briefcase', color: 'sand' }, 'Розничная торговля': { icon: 'briefcase', color: 'sand' },
  'Образование': { icon: 'book', color: 'lavender' }, 'Логистика': { icon: 'arrow', color: 'blue' },
  'Экология': { icon: 'leaf', color: 'mint' }, 'Здоровье': { icon: 'shield', color: 'rose' }, 'Медицина': { icon: 'shield', color: 'rose' },
};
const demoDescription = 'У нас небольшой магазин. Товары иногда заканчиваются неожиданно, хотим лучше планировать закупки.';

function App() {
  const storage = useProjectStorage();
  const { state } = storage;
  const [role, setRole] = useState<Role>('business');
  const [teamId, setTeamId] = useState(state.teams[0].id);
  const [page, setPage] = useState<Page>('catalog');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [topic, setTopic] = useState('all');
  const [level, setLevel] = useState('all');
  const [sort, setSort] = useState('rating');
  const [mineFilter, setMineFilter] = useState('all');
  const [proposalFilter, setProposalFilter] = useState('all');
  const dirty = useRef(false);
  const contentRef = useRef<HTMLElement>(null);

  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 5500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); contentRef.current?.focus({ preventScroll: true }); }, [page, taskId]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (dirty.current || storage.hasUnsaved) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler);
  }, [storage.hasUnsaved]);

  const leaveEditor = () => {
    if (dirty.current && !window.confirm('В форме есть несохранённый текст. Перейти дальше и отменить изменения?')) return false;
    dirty.current = false; return true;
  };
  const navigate = (next: Page) => { if (leaveEditor()) { setPage(next); setEditing(null); } };
  const changeRole = (next: Role) => { if (next !== role && leaveEditor()) { setRole(next); setPage('catalog'); setEditing(null); setProposalFilter('all'); setToast(next === 'student' ? 'Вы в роли студенческой команды' : 'Вы в роли представителя бизнеса'); } };
  const changeTeam = (next: string) => { if (next !== teamId && leaveEditor()) { setTeamId(next); setProposalFilter('all'); } };
  const openTask = (task: Task) => { if (leaveEditor()) { setTaskId(task.id); setPage('detail'); } };
  const createTask = (source = '') => {
    if (!leaveEditor()) return;
    const now = new Date().toISOString();
    setRole('business');
    setEditing({ id: crypto.randomUUID(), ownerId: BUSINESS_ID, company: 'Мой бизнес', fields: emptyFields(), confirmedFields: [], published: false, source, createdAt: now, updatedAt: now });
    setPage('editor');
  };
  const editTask = (task: Task) => { if (role !== 'business' || task.ownerId !== BUSINESS_ID) return; setEditing(task); setPage('editor'); };
  const notifyCommit = (result: CommitResult, text: string) => {
    if (result === 'stored') setToast(text);
    if (result === 'memory') setToast('Изменения есть только в этой вкладке. Скачайте копию или повторите сохранение перед закрытием.');
    return result === 'stored' || result === 'memory';
  };
  const saveTask = (task: Task) => {
    if (role !== 'business' || task.ownerId !== BUSINESS_ID) return false;
    const result = storage.commit(current => ({ ...current, tasks: current.tasks.some(t => t.id === task.id) ? current.tasks.map(t => t.id === task.id ? task : t) : [task, ...current.tasks] }));
    if (!notifyCommit(result, task.published ? 'Задача сохранена и доступна командам в каталоге' : 'Черновик сохранён. К нему можно вернуться в «Моих задачах».')) return false;
    dirty.current = false; setTaskId(task.id); setPage('detail'); setEditing(null);
    return true;
  };
  const submitProposal = (input: { idea: string; plan: string; timeline: string; prototypeUrl: string }) => {
    const task = state.tasks.find(t => t.id === taskId);
    if (role !== 'student' || !task?.published) return false;
    const proposal: Proposal = { ...input, id: crypto.randomUUID(), taskId: task.id, teamId, status: 'pending', milestoneConfirmed: false, createdAt: new Date().toISOString() };
    const result = storage.commit(current => ({ ...current, proposals: [proposal, ...current.proposals] }));
    const accepted = notifyCommit(result, 'Предложение отправлено! Решение появится в «Моих откликах».');
    if (accepted) { dirty.current = false; setProposalFilter('all'); }
    return accepted;
  };
  const decide = (id: string, status: 'accepted' | 'rejected') => {
    if (role !== 'business') return;
    const p = state.proposals.find(item => item.id === id);
    if (!state.tasks.some(t => t.id === p?.taskId && t.ownerId === BUSINESS_ID)) return;
    const result = storage.commit(current => updateProposalStatus(current, id, status));
    notifyCommit(result, status === 'accepted' ? 'Команда выбрана. Можно выбрать и другие предложения.' : 'Предложение отклонено.');
  };
  const completeStage = (id: string) => {
    if (role !== 'business') return;
    const p = state.proposals.find(item => item.id === id);
    if (!p || p.status !== 'accepted' || p.milestoneConfirmed || !state.tasks.some(t => t.id === p.taskId && t.ownerId === BUSINESS_ID)) return;
    const result = storage.commit(current => confirmMilestone(current, id));
    notifyCommit(result, 'Этап подтверждён. Команда получила 50 баллов за прогресс!');
  };
  const resetView = (next: AppState) => {
    dirty.current = false; setTeamId(next.teams[0].id); setRole('business'); setPage('catalog'); setTaskId(null); setEditing(null); setSearch(''); setTopic('all'); setLevel('all'); setSort('rating'); setMineFilter('all'); setProposalFilter('all');
  };
  const resetData = () => {
    if (!window.confirm('Восстановить демонстрационные данные? Все ваши задачи, отклики и изменения в этом браузере будут заменены.')) return;
    const fresh = createSeed();
    if (notifyCommit(storage.commit(fresh), 'Демонстрационные данные восстановлены.')) { resetView(fresh); storage.dismissNotice(); }
  };
  const exportData = () => {
    try { downloadText(storage.exportSnapshot(), backupFilename()); setToast('Копия подготовлена для скачивания. Текст ещё не отправленной формы в неё не входит.'); }
    catch { setToast('Не удалось подготовить файл. Данные остаются в текущей вкладке.'); }
  };
  const exportRecovery = () => {
    try {
      const raw = storage.exportRecovery();
      if (raw !== null) downloadText(raw, backupFilename('soyle-recovery'));
      else setToast('Исходное сохранение недоступно. Скачайте копию текущих данных.');
    } catch { setToast('Не удалось скачать исходное сохранение. Попробуйте ещё раз.'); }
  };
  const importData = (next: AppState) => {
    if (!leaveEditor()) return false;
    const success = notifyCommit(storage.commit(next), 'Резервная копия загружена.');
    if (success) { resetView(next); storage.dismissNotice(); }
    return success;
  };
  const loadLatest = () => {
    if (!window.confirm('Загрузить последнее сохранение из браузера? Несохранённые изменения этой вкладки будут потеряны. Перед загрузкой можно скачать копию.')) return;
    const next = storage.loadLatest(); resetView(next); setToast('Загружены последние сохранённые данные.');
  };

  const published = state.tasks.filter(t => t.published);
  const owned = state.tasks.filter(t => t.ownerId === BUSINESS_ID);
  const topics = [...new Set(published.map(t => t.fields.topic))].sort((a, b) => a.localeCompare(b, 'ru'));
  const team = state.teams.find(t => t.id === teamId) ?? state.teams[0];
  const task = state.tasks.find(t => t.id === taskId);
  const visibleProposals = state.proposals.filter(p => role === 'student' ? p.teamId === teamId : owned.some(t => t.id === p.taskId));
  const pendingCount = visibleProposals.filter(p => p.status === 'pending').length;
  const catalog = published.filter(t => {
    const q = search.trim().toLocaleLowerCase('ru');
    return (!q || `${t.fields.title} ${t.fields.need} ${t.fields.context} ${t.company}`.toLocaleLowerCase('ru').includes(q)) && (topic === 'all' || t.fields.topic === topic) && (level === 'all' || getRating(t).level === level);
  }).sort((a, b) => sort === 'newest' ? Date.parse(b.createdAt) - Date.parse(a.createdAt) : sort === 'rating-asc' ? getRating(a).score - getRating(b).score : getRating(b).score - getRating(a).score);

  const navItems: { id: Page; icon: IconName; label: string; count?: number }[] = [
    { id: 'catalog', icon: 'grid', label: 'Каталог задач' },
    ...(role === 'business' ? [{ id: 'mine' as Page, icon: 'folder' as IconName, label: 'Мои задачи', count: owned.length }] : []),
    { id: 'proposals', icon: 'message', label: role === 'business' ? 'Отклики команд' : 'Мои отклики', count: pendingCount },
    { id: 'teams', icon: 'people', label: 'Команды' },
  ];
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Перейти к содержимому</a>
    <aside className="sidebar">
      <button className="brand" onClick={() => navigate('catalog')} aria-label="Soyle — на главную"><span className="brand-symbol"><Icon name="up" size={27}/><span/></span><span className="brand-word">Soyle<span>практика</span></span></button>
      <div className="workspace-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
      <nav aria-label="Основная навигация">{navItems.map(n => <button key={n.id} className={`nav-item ${page === n.id || (n.id === 'mine' && page === 'editor') || (n.id === 'catalog' && page === 'detail') ? 'active' : ''}`} onClick={() => navigate(n.id)} aria-label={n.label} aria-current={page === n.id ? 'page' : undefined}><Icon name={n.icon}/><span>{n.label}</span>{n.count ? <span className="nav-count">{n.count}</span> : null}</button>)}</nav>
      <div className="sidebar-callout"><span className="small-spark"><Icon name="spark" size={21}/></span><strong>Идеям нужна команда</strong><p>Превратите задачу бизнеса<br/>в чей-то первый большой опыт.</p><button onClick={() => role === 'business' ? createTask() : navigate('guide')}> {role === 'business' ? 'Создать задачу' : 'Как начать'}<Icon name="arrow" size={16}/></button></div>
      <div className="sidebar-bottom"><button className={`nav-item ${page === 'guide' ? 'active' : ''}`} aria-current={page === 'guide' ? 'page' : undefined} onClick={() => navigate('guide')}><Icon name="help"/><span>Как это работает</span></button><div className="sidebar-divider"/><div className="demo-caption"><span className="live-dot"/> ПРОСТРАНСТВО ДЛЯ ДЕМО</div><div className="profile"><span className="avatar">{role === 'business' ? 'АБ' : team.initials}</span><div><strong>{role === 'business' ? 'Айдана Б.' : team.name}</strong><span>{role === 'business' ? 'Представитель бизнеса' : 'Студенческая команда'}</span></div></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="breadcrumb">Рабочее пространство <span>/</span> <strong>{pageNames[page]}</strong></div><div className="header-actions"><span className="hackathon-label"><span/> AI SANA 2026</span><div className="role-switch" role="group" aria-label="Ваша роль"><button className={role === 'business' ? 'selected' : ''} aria-pressed={role === 'business'} onClick={() => changeRole('business')}><Icon name="briefcase" size={15}/>Бизнес</button><button className={role === 'student' ? 'selected' : ''} aria-pressed={role === 'student'} onClick={() => changeRole('student')}><Icon name="book" size={15}/>Студент</button></div></div></header>
      <main id="main-content" className="main-content" tabIndex={-1} ref={contentRef}>
        {storage.notice && <div className="warning-banner" role="alert"><Icon name="shield"/><span>{storage.notice}</span>{storage.hasRecovery && <button className="text-button" onClick={exportRecovery}>Скачать исходное сохранение</button>}<button className="icon-button" aria-label="Закрыть предупреждение" onClick={storage.dismissNotice}><Icon name="close"/></button></div>}
        {storage.error && <div className="warning-banner storage-banner" role="alert"><div><Icon name="shield"/><span>{storage.error}</span></div><div className="data-tool-actions"><button className="btn btn-secondary" onClick={exportData}>Скачать текущие данные</button>{storage.conflict ? <button className="btn btn-primary" onClick={loadLatest}>Загрузить обновления</button> : <button className="btn btn-secondary" onClick={() => notifyCommit(storage.retry(), 'Изменения сохранены в браузере.')}>Повторить сохранение</button>}</div></div>}
        {role === 'student' && <div className="team-selector"><span><Icon name="people" size={17}/> Вы действуете от имени команды</span><select aria-label="Активная команда" value={teamId} onChange={e => changeTeam(e.target.value)}>{state.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select><span className="team-points"><Icon name="trophy" size={16}/>{getTeamPoints(state, teamId)} баллов</span></div>}
        {page === 'catalog' && <>
          <section className="catalog-hero"><div className="hero-copy"><div className="hero-eyebrow"><span/> БИЗНЕС × СТУДЕНТЫ</div><h1>Большие идеи.<br/><span>Реальные задачи.</span></h1><p>Бизнес находит свежие решения.<br/>Команды получают опыт, который имеет значение.</p><button className="btn btn-primary" onClick={() => role === 'business' ? createTask() : document.getElementById('catalog-list')?.scrollIntoView({ behavior: 'smooth' })}>{role === 'business' ? 'Разместить задачу' : 'Найти свою задачу'}<Icon name="up" size={17}/></button><div className="hero-footnote"><span className="tiny-avatars"><i>А</i><i>М</i><i>Д</i></span><span>{state.teams.length} команд готовы создавать новое</span></div></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><span className="art-spark spark-one">✳</span><span className="art-spark spark-two">✧</span><div className="floating-card idea-card"><span className="art-icon"><Icon name="briefcase" size={25}/></span><div><small>У БИЗНЕСА ЕСТЬ</small><b>Большая идея</b></div><span className="art-dot"/></div><div className="connection-line"/><div className="floating-card team-card"><span className="art-icon"><Icon name="code" size={27}/></span><div><small>У КОМАНДЫ ЕСТЬ</small><b>Свежий взгляд</b></div></div><div className="match-pill"><span><Icon name="check" size={15}/></span>Вместе — к результату</div><div className="art-label">От первого вопроса до первого проекта ↗</div></div></section>
          <section className="stats-row" aria-label="Платформа в цифрах"><Stat icon="folder" value={published.length} label="открытых задач" detail="Можно откликаться"/><Stat icon="people" value={state.teams.length} label="студенческих команд" detail="Разные навыки. Общая цель."/><Stat icon="spark" value={published.filter(t => getRating(t).score >= 70).length} label="задач готовы к старту" detail="Рейтинг готовности от 70"/></section>
          <section id="catalog-list" className="catalog-section"><div className="section-heading"><div className="heading-line"><h2>Каталог задач</h2><span className="count-pill">{published.length}</span></div><span className="muted catalog-caption">Найдите точку приложения своих идей</span></div><div className="catalog-toolbar"><label className="search-field"><Icon name="search" size={19}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Название, компания или ключевое слово" aria-label="Поиск задач"/>{search && <button className="icon-button" aria-label="Очистить поиск" onClick={() => setSearch('')}><Icon name="close" size={16}/></button>}</label><select aria-label="Фильтр по теме" value={topic} onChange={e => setTopic(e.target.value)}><option value="all">Все направления</option>{topics.map(t => <option key={t}>{t}</option>)}</select><select aria-label="Фильтр по готовности" value={level} onChange={e => setLevel(e.target.value)}><option value="all">Любая готовность</option>{levelOptions.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}</select></div><div className="catalog-meta"><span>Найдено задач: <b>{catalog.length}</b></span><label>Сначала <select aria-label="Сортировка задач" value={sort} onChange={e => setSort(e.target.value)}><option value="rating">самые готовые</option><option value="rating-asc">с низким рейтингом</option><option value="newest">новые</option></select></label></div><div className="task-grid">{catalog.map(t => <TaskCard key={t.id} task={t} proposalCount={state.proposals.filter(p => p.taskId === t.id).length} onOpen={() => openTask(t)}/>)}</div>{!catalog.length && <EmptyState title="Пока ничего не нашлось" action={<button className="btn btn-secondary" onClick={() => { setSearch(''); setTopic('all'); setLevel('all'); }}>Сбросить фильтры</button>}>Попробуйте другое слово или расширьте поиск.</EmptyState>}</section>
          <div className="catalog-note"><Icon name="shield" size={18}/><span>Все задачи открыты для каждой команды. Решение о сотрудничестве принимает бизнес.</span><button onClick={() => navigate('guide')}>Подробнее<Icon name="arrow" size={15}/></button></div>
        </>}
        {page === 'mine' && role === 'business' && <><PageIntro eyebrow="ОТ ИДЕИ К ПЕРВОМУ ОТКЛИКУ" title="Мои задачи" description="Дополняйте описание, повышайте готовность и находите свою команду." action={<button className="btn btn-primary" onClick={() => createTask()}><Icon name="plus" size={18}/>Новая задача</button>}/><div className="filter-tabs">{[{ id: 'all', label: 'Все задачи' }, { id: 'published', label: 'Опубликованные' }, { id: 'draft', label: 'Черновики' }].map(f => <button key={f.id} aria-pressed={mineFilter === f.id} onClick={() => setMineFilter(f.id)} className={mineFilter === f.id ? 'active' : ''}>{f.label}<span>{owned.filter(t => f.id === 'all' || (f.id === 'published' ? t.published : !t.published)).length}</span></button>)}</div><div className="task-grid">{owned.filter(t => mineFilter === 'all' || (mineFilter === 'published' ? t.published : !t.published)).map(t => <TaskCard key={t.id} task={t} proposalCount={state.proposals.filter(p => p.taskId === t.id).length} onOpen={() => openTask(t)}/>)}</div>{!owned.some(t => mineFilter === 'all' || (mineFilter === 'published' ? t.published : !t.published)) && <EmptyState title="Задач пока нет" action={<button className="btn btn-secondary" onClick={() => owned.length ? setMineFilter('all') : createTask()}>{owned.length ? 'Показать все задачи' : 'Создать задачу'}</button>}>Здесь появятся ваши задачи с выбранным статусом.</EmptyState>}</>}
        {page === 'proposals' && <><PageIntro eyebrow="СЛЕДУЮЩИЙ ШАГ — ВМЕСТЕ" title={role === 'business' ? 'Отклики команд' : 'Мои отклики'} description={role === 'business' ? 'Изучите идеи и выберите команды, с которыми хотите работать.' : 'Ваши предложения, решения бизнеса и подтверждённый прогресс.'}/><div className="filter-tabs">{[{ id: 'all', label: 'Все' }, { id: 'pending', label: 'На рассмотрении' }, { id: 'accepted', label: 'Выбраны' }, { id: 'rejected', label: 'Отклонены' }].map(f => <button key={f.id} className={proposalFilter === f.id ? 'active' : ''} aria-pressed={proposalFilter === f.id} onClick={() => setProposalFilter(f.id)}>{f.label}<span>{visibleProposals.filter(p => f.id === 'all' || p.status === f.id).length}</span></button>)}</div><div className="proposals-list">{visibleProposals.filter(p => proposalFilter === 'all' || p.status === proposalFilter).map(p => <ProposalCard key={p.id} proposal={p} task={state.tasks.find(t => t.id === p.taskId)!} team={state.teams.find(t => t.id === p.teamId)!} role={role} onDecision={decide} onMilestone={completeStage}/>)}</div>{!visibleProposals.filter(p => proposalFilter === 'all' || p.status === proposalFilter).length && <EmptyState title={visibleProposals.length ? "Нет откликов с таким статусом" : "Здесь появятся предложения"} action={<button className="btn btn-secondary" onClick={() => visibleProposals.length ? setProposalFilter('all') : navigate('catalog')}>{visibleProposals.length ? 'Показать все отклики' : 'Открыть каталог'}<Icon name="arrow" size={17}/></button>}>{visibleProposals.length ? 'Выберите другой статус или вернитесь к общему списку.' : role === 'business' ? 'Опубликуйте задачу, чтобы команды могли предложить решение.' : 'Найдите интересную задачу и расскажите, как вы её решите.'}</EmptyState>}</>}
        {page === 'teams' && <><PageIntro eyebrow="ТАЛАНТЫ, КОТОРЫЕ ГОТОВЫ ДЕЙСТВОВАТЬ" title="За каждой идеей — команда" description="Разные интересы и технологии. Одно желание — сделать полезный проект."/><div className="team-grid">{[...state.teams].sort((a, b) => getTeamPoints(state, b.id) - getTeamPoints(state, a.id)).map((t, index) => <article className="team-profile-card panel" key={t.id}><div className="team-profile-top"><span className="team-avatar" style={{ background: t.color }}>{t.initials}</span><span className="team-rank">#{index + 1}</span></div><h3>{t.name}</h3><p>{t.description}</p><div className="team-interests">{t.interests.join(' · ')}</div><div className="tag-list">{[...new Set([...t.skills, ...t.technologies])].map(s => <span className="tag" key={s}>{s}</span>)}</div><div className="team-profile-footer"><span><Icon name="trophy" size={18}/><b>{getTeamPoints(state, t.id)}</b> баллов прогресса</span>{role === 'student' && <button className="text-button" disabled={teamId === t.id} onClick={() => changeTeam(t.id)}>{teamId === t.id ? 'Ваша команда' : 'Переключиться'}{teamId !== t.id && <Icon name="arrow" size={15}/>}</button>}</div></article>)}</div><p className="section-note">Баллы начисляются за этап, подтверждённый бизнесом: +50 за каждый результат. Выбор команды остаётся за представителем бизнеса.</p></>}
        {page === 'guide' && <><PageIntro eyebrow="ПРАКТИКА С РЕАЛЬНЫМ СМЫСЛОМ" title="Хорошие проекты начинаются с диалога" description="Soyle помогает бизнесу сформулировать задачу, а студентам — найти возможность применить знания."/><div className="guide-steps">{[{ icon: 'edit' as IconName, title: 'Расскажите о задаче', text: 'Опишите потребность своими словами. Помощник найдёт пробелы и задаст уточняющие вопросы.' }, { icon: 'spark' as IconName, title: 'Сделайте идею понятной', text: 'Заполните карточку и подтвердите сведения. Рейтинг от 0 до 100 покажет готовность к работе.' }, { icon: 'people' as IconName, title: 'Найдите свою команду', text: 'Опубликуйте задачу, получите предложения и сами выберите одну или несколько команд.' }].map((s, i) => <article key={s.title} className="guide-step panel"><span className="guide-step-number">0{i + 1}</span><Icon name={s.icon} size={28}/><h3>{s.title}</h3><p>{s.text}</p></article>)}</div><section className="guide-demo panel"><div className="eyebrow"><Icon name="spark" size={17}/> ДЕМО ЗА 5 МИНУТ</div><h2>От «хотим улучшить закупки»<br/>до первого предложения</h2><p>Создайте задачу магазина, дополните описание, опубликуйте карточку. Переключитесь в роль студента и отправьте отклик. Вернитесь в роль бизнеса, выберите команду и подтвердите этап.</p><button className="btn btn-primary" onClick={() => createTask(demoDescription)}>Попробовать на примере<Icon name="arrow" size={17}/></button></section><div className="guide-info-grid"><section className="panel"><Icon name="spark"/><h3>Помощник с понятными правилами</h3><p>Помощник задаёт вопросы и формирует карточку из ваших ответов. По умолчанию включён деморежим; сервер поддерживает подключение OpenAI. Вы проверяете и подтверждаете сведения, а сервер рассчитывает рейтинг по фиксированной формуле.</p></section><section className="panel"><Icon name="shield"/><h3>Ваше пространство для демо</h3><p>Данные сохраняются только в этом браузере. Переключение ролей демонстрирует сценарий работы. Все компании и профили вымышлены.</p></section></div></>}
        {page === 'guide' && <DataTools onExport={exportData} onImport={importData} onReset={resetData} onRecovery={storage.hasRecovery ? exportRecovery : undefined}/>}
        {page === 'editor' && editing && role === 'business' && <TaskEditor key={editing.id} task={editing} onSave={saveTask} onCancel={() => navigate('mine')} onDirty={value => { dirty.current = value; }}/>}
        {page === 'detail' && task && <TaskDetail key={`${task.id}-${role}-${teamId}`} task={task} state={state} role={role} teamId={teamId} onEdit={() => editTask(task)} onBack={() => navigate(task.published ? 'catalog' : 'mine')} onSubmit={submitProposal} onDecision={decide} onMilestone={completeStage} onDirty={value => { dirty.current = value; }}/>}
        <footer className="page-footer"><span>Soyle <i>·</i> Сделано для полезных знакомств</span><span>AI Sana Hackathon <i>↗</i> 2026</span></footer>
      </main>
    </div>
    {toast && <div className="toast" role="status"><span className="toast-check"><Icon name="check" size={18}/></span><span>{toast}</span><button className="icon-button" aria-label="Закрыть сообщение" onClick={() => setToast('')}><Icon name="close" size={17}/></button></div>}
  </div>;
}

function Stat({ icon, value, label, detail }: { icon: IconName; value: number; label: string; detail: string }) {
  return <div className="stat-item"><span className="stat-icon"><Icon name={icon} size={21}/></span><div><div><strong>{value.toString().padStart(2, '0')}</strong><span>{label}</span></div><p>{detail}</p></div></div>;
}
function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-intro"><div><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1><p>{description}</p></div>{action}</div>;
}
function TaskCard({ task, proposalCount, onOpen }: { task: Task; proposalCount: number; onOpen: () => void }) {
  const rating = getRating(task);
  const style = topicStyles[task.fields.topic] ?? { icon: 'code' as IconName, color: 'blue' };
  return <article className={`task-card ${rating.level === 'priority' && task.published ? 'task-priority' : ''}`} data-testid="task-card" data-rating={rating.score}>
    <div className="task-card-top"><span className={`task-topic-icon ${style.color}`}><Icon name={style.icon} size={23}/></span><span className="task-topic">{task.fields.topic || 'Без направления'}</span>{!task.published ? <span className="draft-badge">Черновик</span> : rating.level === 'priority' ? <span className="priority-star" title="Приоритетная задача"><Icon name="spark" size={18}/></span> : null}</div>
    <h3><button onClick={onOpen}>{task.fields.title || 'Новая задача'}</button></h3><p className="task-description">{task.fields.need || task.fields.context || task.source || 'Добавьте описание и сделайте первый шаг к сотрудничеству.'}</p>
    <div className="task-company"><span>{task.company.slice(0, 1)}</span>{task.company}</div>
    <div className="task-rating-row"><RatingBadge task={task}/><span className="task-score"><b>{rating.score}</b><span>/100</span></span></div><div className={`task-score-track ${rating.level}`}><i style={{ width: `${rating.score}%` }}/></div>
    <div className="task-card-footer"><span><Icon name="message" size={15}/>{proposalCount} откликов</span><button onClick={onOpen} aria-label={`Подробнее: ${task.fields.title || 'Новая задача'}`}>{task.published ? 'Подробнее' : 'Открыть черновик'}<Icon name="up" size={16}/></button></div>
  </article>;
}
export default App;
