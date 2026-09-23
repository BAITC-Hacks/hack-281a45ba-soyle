import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { BUSINESS_ID, FIELD_LABELS, getRating, hasContent, safeHttpUrl } from './domain'
import type { AppState, FieldKey, Proposal, Role, Task, Team } from './domain'
import { Icon, RatingBadge, RatingPanel } from './components'
import './detail.css'

type ProposalInput = { idea: string; plan: string; timeline: string; prototypeUrl: string }
type Decision = (id: string, status: 'accepted' | 'rejected') => void

interface DetailProps {
  task: Task
  state: AppState
  role: Role
  teamId: string
  onEdit: () => void
  onBack: () => void
  onSubmit: (input: ProposalInput & { id: string }) => boolean
  onDirty: (dirty: boolean) => void
  onDecision: Decision
  onMilestone: (id: string) => void
}

interface ProposalCardProps {
  proposal: Proposal
  task: Task
  team: Team
  role: Role
  onDecision: Decision
  onMilestone: (id: string) => void
}

const proposalStatus = {
  pending: 'На рассмотрении',
  accepted: 'Команда выбрана',
  rejected: 'Отклонено',
} as const

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(value))
}

export function ProposalCard({ proposal, task, team, role, onDecision, onMilestone }: ProposalCardProps) {
  const canManage = role === 'business' && task.ownerId === BUSINESS_ID
  return <article className={`proposal-card proposal-card-${proposal.status}`}>
    <div className="proposal-card-top">
      <div className="proposal-team">
        <span className="proposal-avatar" style={{ '--team-color': team.color } as CSSProperties}>{team.initials}</span>
        <div><h3>{team.name}</h3><span className="proposal-date">{formatDate(proposal.createdAt)}</span></div>
      </div>
      <span className={`proposal-status proposal-status-${proposal.status}`}><span />{proposalStatus[proposal.status]}</span>
    </div>

    <p className="proposal-task-name"><Icon name="briefcase" size={15} /><span>{task.fields.title}</span></p>
    <div className="proposal-description"><span className="proposal-label">Идея решения</span><p>{proposal.idea}</p></div>
    <div className="proposal-description"><span className="proposal-label">План работы</span><p>{proposal.plan}</p></div>

    <div className="proposal-metadata">
      <span><Icon name="clock" size={16} />{proposal.timeline}</span>
      {safeHttpUrl(proposal.prototypeUrl) && <a href={proposal.prototypeUrl.trim()} target="_blank" rel="noopener noreferrer"><Icon name="link" size={16} />Открыть прототип<Icon name="up" size={13} /></a>}
    </div>

    {canManage && proposal.status !== 'accepted' && <div className="proposal-actions">
      <button className="btn btn-primary" type="button" onClick={() => onDecision(proposal.id, 'accepted')}><Icon name="check" size={17} />Выбрать команду</button>
      {proposal.status === 'pending' && <button className="btn btn-ghost proposal-reject" type="button" onClick={() => onDecision(proposal.id, 'rejected')}>Отклонить</button>}
    </div>}

    {proposal.status === 'accepted' && <div className={`proposal-milestone ${proposal.milestoneConfirmed ? 'proposal-milestone-complete' : ''}`}>
      <span className="proposal-milestone-icon"><Icon name={proposal.milestoneConfirmed ? 'trophy' : 'check'} size={20} /></span>
      <div>
        <strong>{proposal.milestoneConfirmed ? 'Первый этап подтверждён' : 'Следующий шаг — первый результат'}</strong>
        <p>{proposal.milestoneConfirmed ? 'Представитель бизнеса принял результат. Команде начислено 50 баллов.' : canManage ? 'Подтвердите этап, когда примете результат работы команды.' : role === 'student' ? 'Согласуйте первый этап с бизнесом. После его приёмки команда получит 50 баллов.' : 'Автор задачи подтвердит этап после приёмки результата работы команды.'}</p>
      </div>
      {proposal.milestoneConfirmed
        ? <span className="proposal-points">+50 баллов</span>
        : canManage && <button type="button" className="btn btn-secondary" onClick={() => onMilestone(proposal.id)}>Подтвердить этап</button>}
    </div>}
  </article>
}

const groups: Array<{ title: string; subtitle: string; fields: FieldKey[] }> = [
  { title: 'О задаче', subtitle: 'Проблема, которую предстоит решить', fields: ['context', 'need', 'users'] },
  { title: 'Условия работы', subtitle: 'Что есть на старте и что нужно учитывать', fields: ['data', 'constraints'] },
  { title: 'Ожидаемый результат', subtitle: 'Как бизнес поймёт, что задача решена', fields: ['result', 'success'] },
  { title: 'Связь с бизнесом', subtitle: 'Контакт и договорённости о взаимодействии', fields: ['contact', 'interaction'] },
]

const blankProposal = (): ProposalInput => ({ idea: '', plan: '', timeline: '', prototypeUrl: '' })

export default function TaskDetail({ task, state, role, teamId, onEdit, onBack, onSubmit, onDecision, onMilestone, onDirty }: DetailProps) {
  const [input, setInput] = useState<ProposalInput>(blankProposal)
  const [errors, setErrors] = useState<Partial<ProposalInput>>({})
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const submissionLock = useRef(false)
  const submissionId = useRef<string | null>(null)
  const team = state.teams.find((item) => item.id === teamId)
  const visibleProposals = state.proposals.filter((proposal) => proposal.taskId === task.id && (role === 'business' || proposal.teamId === teamId))
  const rating = getRating(task)

  useEffect(() => {
    setInput(blankProposal())
    setErrors({})
    setSubmitted(false)
    setSubmitError('')
    submissionLock.current = false
    submissionId.current = null
  }, [task.id, teamId, role])

  function change(key: keyof ProposalInput, value: string) {
    setInput((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
    setSubmitted(false)
    setSubmitError('')
    submissionLock.current = false
    onDirty(Object.values({ ...input, [key]: value }).some(hasContent))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submissionLock.current) return
    const values = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value.trim()])) as ProposalInput
    const nextErrors: Partial<ProposalInput> = {}
    if (!hasContent(values.idea)) nextErrors.idea = 'Опишите идею решения.'
    if (!hasContent(values.plan)) nextErrors.plan = 'Добавьте основные шаги работы.'
    if (!hasContent(values.timeline)) nextErrors.timeline = 'Укажите предполагаемый срок.'
    if (!values.prototypeUrl) nextErrors.prototypeUrl = 'Добавьте ссылку на прототип.'
    else if (!safeHttpUrl(values.prototypeUrl)) nextErrors.prototypeUrl = 'Введите полную ссылку, начинающуюся с https:// или http://.'
    setErrors(nextErrors)
    setSubmitted(false)
    const firstInvalid = Object.keys(nextErrors)[0]
    if (firstInvalid) {
      event.currentTarget.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${firstInvalid}"]`)?.focus()
      return
    }
    if (!team || !task.published) return
    submissionLock.current = true
    try {
      submissionId.current ??= crypto.randomUUID()
      if (!onSubmit({ ...values, id: submissionId.current })) {
        submissionLock.current = false
        setSubmitError('Предложение не отправлено. Проверьте сообщение о сохранении выше; текст остался в форме.')
        return
      }
      setInput(blankProposal())
      submissionId.current = null
      setSubmitError('')
      setSubmitted(true)
      onDirty(false)
    } catch {
      submissionLock.current = false
      setSubmitError('Не удалось отправить предложение. Ваш текст сохранён в форме — попробуйте ещё раз.')
    }
  }

  function error(key: keyof ProposalInput) {
    return errors[key] ? <span id={`proposal-${key}-error`} className="form-error" role="alert">{errors[key]}</span> : null
  }

  return <div className="detail-page">
    <button className="btn btn-ghost detail-back" type="button" onClick={onBack}><Icon name="back" size={18} />Назад к задачам</button>

    <header className="detail-header">
      <div className="detail-header-copy">
        <div className="detail-topic-line"><span className="tag">{task.fields.topic || 'Тема не указана'}</span><span className={`detail-publication ${task.published ? 'is-published' : ''}`}><span />{task.published ? 'Опубликована' : 'Черновик'}</span></div>
        <h1 className="page-title">{task.fields.title || 'Новая задача'}</h1>
        <div className="detail-company"><Icon name="briefcase" size={17} /><span>{task.company}</span><span className="detail-meta-dot">·</span><span>Обновлено {formatDate(task.updatedAt)}</span></div>
      </div>
      {role === 'business' && task.ownerId === BUSINESS_ID && <button className="btn btn-secondary detail-edit" type="button" onClick={onEdit}><Icon name="edit" size={17} />Редактировать</button>}
    </header>

    <div className="detail-layout">
      <div className="detail-main">
        {groups.map((group, groupIndex) => <section className="panel detail-section" key={group.title}>
          <div className="detail-section-heading"><span className="detail-section-number">0{groupIndex + 1}</span><div><h2>{group.title}</h2><p>{group.subtitle}</p></div></div>
          <dl className="detail-fields">{group.fields.map((key) => <div className={`detail-field ${!task.fields[key].trim() ? 'detail-field-empty' : ''}`} key={key}>
            <dt>{FIELD_LABELS[key]}{task.fields[key].trim() && !task.confirmedFields.includes(key) && <span className="detail-unconfirmed">Не подтверждено</span>}</dt>
            <dd>{task.fields[key].trim() || 'Пока не указано — можно уточнить с представителем бизнеса.'}</dd>
          </div>)}</dl>
        </section>)}

        <section className="detail-proposals" aria-labelledby="detail-proposals-title">
          <div className="detail-list-heading"><div><span className="eyebrow">ОТ ИДЕИ К СОТРУДНИЧЕСТВУ</span><h2 id="detail-proposals-title">{role === 'business' ? 'Предложения команд' : 'Предложения вашей команды'}<span className="detail-count">{visibleProposals.length}</span></h2></div></div>
          {role === 'business' && task.ownerId === BUSINESS_ID && visibleProposals.length > 0 && <p className="detail-proposals-hint">Выберите одну или несколько команд. Решение о сотрудничестве принимаете вы.</p>}
          {visibleProposals.length > 0
            ? <div className="detail-proposals-list">{visibleProposals.map((proposal) => {
              const proposalTeam = state.teams.find((item) => item.id === proposal.teamId)
              return proposalTeam ? <ProposalCard key={proposal.id} proposal={proposal} task={task} team={proposalTeam} role={role} onDecision={onDecision} onMilestone={onMilestone} /> : null
            })}</div>
            : <div className="detail-empty"><span><Icon name="message" size={26} /></span><h3>{role === 'business' ? 'Здесь начнётся сотрудничество' : 'У вашей команды пока нет предложений'}</h3><p>{role === 'business' ? task.published ? 'Команды увидят задачу в каталоге и смогут предложить решение.' : 'Подтвердите и опубликуйте задачу, чтобы получить первые предложения.' : task.published ? 'Расскажите, как вы видите решение, и отправьте предложение ниже.' : 'Предложения станут доступны после публикации задачи.'}</p></div>}
        </section>

        {role === 'student' && task.published && team && <section className="panel detail-proposal-form" aria-labelledby="proposal-form-title">
          <div className="detail-form-heading"><span className="detail-form-icon"><Icon name="spark" size={23} /></span><div><h2 id="proposal-form-title">Предложите своё решение</h2><p>От команды <strong>{team.name}</strong></p></div></div>
          {rating.score < 40 && <div className="detail-low-rating"><Icon name="help" size={18} /><p>В задаче ещё есть открытые вопросы. Вы можете откликнуться сейчас и включить их уточнение в свой план.</p></div>}
          <form onSubmit={submit} noValidate>
            <label className="field" htmlFor="proposal-idea"><span>Идея решения <span className="detail-required">*</span></span><textarea id="proposal-idea" name="idea" value={input.idea} onChange={(event) => change('idea', event.target.value)} rows={3} maxLength={6000} placeholder="Что вы предлагаете и как это поможет бизнесу?" required aria-invalid={Boolean(errors.idea)} aria-describedby={errors.idea ? 'proposal-idea-error' : undefined} />{error('idea')}</label>
            <label className="field" htmlFor="proposal-plan"><span>План работы <span className="detail-required">*</span></span><textarea id="proposal-plan" name="plan" value={input.plan} onChange={(event) => change('plan', event.target.value)} rows={3} maxLength={8000} placeholder="Опишите основные шаги: от изучения данных до проверки результата" required aria-invalid={Boolean(errors.plan)} aria-describedby={errors.plan ? 'proposal-plan-error' : undefined} />{error('plan')}</label>
            <div className="detail-form-row">
              <label className="field" htmlFor="proposal-timeline"><span>Срок реализации <span className="detail-required">*</span></span><input id="proposal-timeline" name="timeline" value={input.timeline} onChange={(event) => change('timeline', event.target.value)} maxLength={200} placeholder="Например, 7 дней" required aria-invalid={Boolean(errors.timeline)} aria-describedby={errors.timeline ? 'proposal-timeline-error' : undefined} />{error('timeline')}</label>
              <label className="field" htmlFor="proposal-prototypeUrl"><span>Ссылка на прототип <span className="detail-required">*</span></span><input id="proposal-prototypeUrl" name="prototypeUrl" type="url" value={input.prototypeUrl} onChange={(event) => change('prototypeUrl', event.target.value)} maxLength={2000} placeholder="https://…" required aria-invalid={Boolean(errors.prototypeUrl)} aria-describedby={errors.prototypeUrl ? 'proposal-prototypeUrl-error' : undefined} />{error('prototypeUrl')}</label>
            </div>
            {submitError && <p className="form-error" role="alert">{submitError}</p>}
            {submitted && <div className="detail-submit-success" role="status"><Icon name="check" size={18} /><span>Предложение отправлено. Бизнес увидит его и примет решение.</span></div>}
            <div className="detail-form-footer"><p>Предложение будет доступно представителю бизнеса.</p><button type="submit" className="btn btn-primary">Отправить предложение<Icon name="arrow" size={18} /></button></div>
          </form>
        </section>}
      </div>

      <aside className="detail-aside">
        <RatingPanel task={task} />
        <div className="detail-readiness-note"><Icon name="shield" size={19} /><p>Рейтинг отражает полноту подтверждённого описания. Результат работы команды принимает представитель бизнеса.</p></div>
        <div className="detail-status-summary"><RatingBadge task={task} /><span>{task.published ? 'Доступна всем командам' : 'Пока видна только бизнесу'}</span></div>
      </aside>
    </div>
  </div>
}
