import type { CSSProperties, ReactNode } from 'react';
import { FIELD_LABELS, getRating, type Rating, type Task } from './domain';

const paths = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z"/>,
  message: <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-1 1v-9.5a9 9 0 0 1 18 0ZM7 9h10M7 13h6"/>,
  people: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v2"/></>,
  spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4M18 4h4"/></>,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>,
  up: <path d="M6 18 18 6M6 6h12v12"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  chevron: <path d="m8 10 4 4 4-4"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  back: <path d="M19 12H5m6 6-6-6 6-6"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  briefcase: <><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12l9 3 9-3M10 13h4v4h-4Z"/></>,
  book: <><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1v15"/></>,
  trophy: <><path d="M8 3h8v7a4 4 0 0 1-8 0ZM8 5H4v3a4 4 0 0 0 4 4M16 5h4v3a4 4 0 0 1-4 4M12 14v6M8 21h8"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1-1.5 3M12 17h.01"/></>,
  link: <><path d="m10 13 4-4M9 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M13 8l2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/></>,
  edit: <path d="m15 5 4 4M4 20l5-1L21 7l-4-4L5 15ZM13 20h8"/>,
  reset: <path d="M3 10a9 9 0 1 1 1 8M3 4v6h6"/>,
  shield: <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6ZM8 12l3 3 5-6"/>,
  leaf: <path d="M4 20 17 7M4 16C0 4 10 2 21 3c0 12-5 20-14 15M9 11v5h5"/>,
  code: <path d="m7 6-6 6 6 6m10-12 6 6-6 6M14 3l-4 18"/>,
} satisfies Record<string, ReactNode>;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 20, className = '' }: { name: IconName; size?: number; className?: string }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
export function RatingBadge({ task, rating: override }: { task: Task; rating?: Rating }) {
  const rating = override ?? getRating(task);
  return <span className={`rating-badge ${rating.level}`}><span className="status-dot"/>{rating.label}</span>;
}
export function RatingPanel({ task, compact = false, rating: override }: { task: Task; compact?: boolean; rating?: Rating }) {
  const rating = override ?? getRating(task);
  const missing = rating.criteria.flatMap(c => c.missing);
  return <section className={`rating-panel ${compact ? 'compact' : ''}`} aria-label="Рейтинг готовности">
    <div className="eyebrow"><Icon name="spark" size={16}/> ГОТОВНОСТЬ ЗАДАЧИ</div>
    <div className="rating-overview"><div className="score-circle" style={{ '--score': `${rating.score}%` } as CSSProperties}><div><strong data-testid="rating-score">{rating.score}</strong><span>из 100</span></div></div><div><RatingBadge task={task} rating={rating}/><p>Хорошее описание —<br/>первый шаг к результату.</p></div></div>
    <div className="rating-criteria">{rating.criteria.map(c => <div key={c.key} className="criterion"><div><span>{c.label}</span><b>{c.earned}<span> / {c.max}</span></b></div><div className="meter"><i style={{ width: `${c.earned / c.max * 100}%` }}/></div></div>)}</div>
    {missing.length > 0 ? <div className="rating-tip"><Icon name="spark" size={18}/><div><strong>Как повысить рейтинг</strong><p>Заполните и подтвердите: {[...new Set(missing)].map(k => FIELD_LABELS[k].toLowerCase()).join(', ')}.</p></div></div> : <div className="rating-tip complete"><Icon name="check"/><div><strong>Всё готово к старту</strong><p>Вы помогли командам разобраться в задаче.</p></div></div>}
  </section>;
}
export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name="search" size={30}/></span><h3>{title}</h3><p>{children}</p>{action}</div>;
}
