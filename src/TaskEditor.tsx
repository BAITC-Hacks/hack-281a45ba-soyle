import { useEffect, useRef, useState } from 'react'
import { analyzeTask, CARD_TO_FIELD, cardToFields, generateTaskCard, getAnswerExample, type Answer, type Question } from './ai'
import { FIELD_KEYS, FIELD_LABELS, hasContent, normalizeVisibleText, type FieldKey, type Rating, type Task } from './domain'
import { confirmTask, validatePublication } from './ratingApi'
import { Icon, RatingPanel } from './components'
import AIConnectionStatus from './AIConnectionStatus'
import './editor.css'

type EditorProps = {
  task: Task
  onSave: (task: Task) => boolean
  onCancel: () => void
  onDirty: (dirty: boolean) => void
}

type Step = 0 | 1 | 2
type Operation = 'questions' | 'card' | 'confirm' | 'publish' | null
const STEPS = ['Описание', 'Уточнение', 'Карточка']
const TOPICS = ['Ритейл', 'Образование', 'Логистика', 'Экология', 'Здоровье', 'Финансы']
const FIELD_HINTS: Record<FieldKey, string> = {
  title: 'Коротко опишите, что нужно сделать.',
  topic: 'Выберите из подсказок или укажите свою тему.',
  context: 'Как сейчас устроен процесс и что происходит в компании.',
  need: 'Конкретная проблема, которую предстоит решить.',
  users: 'Кому и в какой ситуации пригодится решение.',
  data: 'Какие материалы доступны, в каком формате и на каких условиях.',
  constraints: 'Сроки, технологии, бюджет и другие реальные ограничения.',
  result: 'Что команда должна передать: прототип, отчет, модуль или другое решение.',
  success: 'Проверяемые критерии, по которым вы примете работу.',
  contact: 'Имя и способ связи. Для демо используйте вымышленный контакт.',
  interaction: 'Канал и частота встреч или обратной связи.',
}

function copyTask(task: Task): Task {
  return { ...task, fields: { ...task.fields }, confirmedFields: [...task.confirmedFields] }
}

function initialStep(task: Task): Step {
  return task.published || FIELD_KEYS.some((key) => hasContent(task.fields[key])) ? 2 : 0
}

function CardField({ id, draft, onChange, error, wide = false, disabled = false }: {
  id: FieldKey
  draft: Task
  onChange: (key: FieldKey, value: string) => void
  error?: string
  wide?: boolean
  disabled?: boolean
}) {
  const short = id === 'title' || id === 'topic' || id === 'contact'
  const required = id === 'title' || id === 'topic'
  const filled = hasContent(draft.fields[id])
  const confirmed = filled && draft.confirmedFields.includes(id)
  const inputId = `editor-field-${id}`
  const descriptionId = `${inputId}-${error ? 'error' : 'hint'}`
  return <div className={`field editor-field ${wide ? 'editor-field-wide' : ''}`}>
    <div className="editor-label-line">
      <label htmlFor={inputId}>{FIELD_LABELS[id]}{required && <span className="editor-required" aria-hidden="true"> *</span>}</label>
      {confirmed && <span className="editor-field-confirmed" title="Сведения подтверждены"><Icon name="check" size={13}/><span>Подтверждено</span></span>}
    </div>
    {short
      ? <input id={inputId} value={draft.fields[id]} onChange={(event) => onChange(id, event.target.value)} disabled={disabled} maxLength={id === 'contact' ? 20_000 : 160} list={id === 'topic' ? 'editor-topics' : undefined} aria-required={required} aria-invalid={Boolean(error)} aria-describedby={descriptionId} placeholder={id === 'title' ? 'Например, помощник для анализа обращений' : id === 'topic' ? 'Выберите тему' : 'Например, Анна · hello@example.com'}/>
      : <textarea id={inputId} value={draft.fields[id]} onChange={(event) => onChange(id, event.target.value)} disabled={disabled} maxLength={20_000} rows={3} aria-invalid={Boolean(error)} aria-describedby={descriptionId} placeholder="Добавьте известные сведения"/>}
    {error
      ? <p className="form-error" id={descriptionId}>{error}</p>
      : <p className="editor-field-hint" id={descriptionId}>{FIELD_HINTS[id]}</p>}
    <details className="editor-answer-example editor-field-example">
      <summary>Пример ответа <span className="editor-example-field-name">для поля «{FIELD_LABELS[id]}»</span></summary>
      <p>{getAnswerExample(id, draft.source, draft.fields)}</p>
      <span>Иллюстрация. Адаптируйте под свою ситуацию — пример не заполняет поле автоматически.</span>
    </details>
  </div>
}

export default function TaskEditor({ task, onSave, onCancel, onDirty }: EditorProps) {
  const [draft, setDraft] = useState<Task>(() => copyTask(task))
  const [step, setStep] = useState<Step>(() => initialStep(task))
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const appliedAnswers = useRef<Record<string, string>>({})
  const [answersPending, setAnswersPending] = useState(false)
  const [cardAvailable, setCardAvailable] = useState(() => initialStep(task) === 2)
  const [cardGenerated, setCardGenerated] = useState(false)
  const [aiMode, setAiMode] = useState<'mock' | 'openai' | null>(null)
  const [serverRating, setServerRating] = useState<Rating>()
  const [analysisSummary, setAnalysisSummary] = useState('')
  const [operation, setOperation] = useState<Operation>(null)
  const [sourceError, setSourceError] = useState('')
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({})
  const [sourceNeedsReview, setSourceNeedsReview] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const requestId = useRef(0)
  const operationRef = useRef<Operation>(null)
  const previousTaskId = useRef(task.id)
  const editorContentRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (previousTaskId.current !== task.id) {
      previousTaskId.current = task.id
      requestId.current += 1
      setDraft(copyTask(task))
      setStep(initialStep(task))
      setQuestions([])
      setAnswers({})
      appliedAnswers.current = {}
      setAnswersPending(false)
      setCardAvailable(initialStep(task) === 2)
      setCardGenerated(false)
      setAiMode(null)
      setServerRating(undefined)
      setAnalysisSummary('')
      setOperation(null)
      operationRef.current = null
      setSourceError('')
      setFormError('')
      setFieldErrors({})
      setSourceNeedsReview(false)
      setSaveFailed(false)
      onDirty(false)
    }
  }, [task, onDirty])

  useEffect(() => () => { requestId.current += 1 }, [])

  const filledFields = FIELD_KEYS.filter((key) => hasContent(draft.fields[key]))
  const unconfirmedFields = filledFields.filter((key) => !draft.confirmedFields.includes(key))
  const allConfirmed = filledFields.length > 0 && unconfirmedFields.length === 0
  const busy = operation !== null
  const canOpenCard = cardAvailable || questions.length > 0 || hasContent(draft.source)
  const missingCardFields = FIELD_KEYS.filter((key) => key !== 'topic' && !hasContent(draft.fields[key]))
  const aiModeLabel = aiMode === 'mock' ? 'Демо AI · без языковой модели' : aiMode === 'openai' ? 'AI-помощник · модель подключена' : 'AI-помощник'

  function editField(key: FieldKey, value: string) {
    if (operationRef.current) return
    setDraft((current) => ({
      ...current,
      fields: { ...current.fields, [key]: value },
      confirmedFields: current.confirmedFields.filter((field) => field !== key),
    }))
    setFieldErrors((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
    setFormError('')
    setServerRating(undefined)
    if (key === 'context') setSourceNeedsReview(false)
    onDirty(true)
  }

  function changeSource(value: string) {
    if (operationRef.current) return
    const contextNeedsReview = hasContent(draft.fields.context) && normalizeVisibleText(value) !== normalizeVisibleText(draft.fields.context)
    setDraft((current) => ({
      ...current,
      source: value,
      confirmedFields: contextNeedsReview ? current.confirmedFields.filter((key) => key !== 'context') : current.confirmedFields,
    }))
    setSourceNeedsReview(contextNeedsReview)
    setSourceError('')
    setServerRating(undefined)
    onDirty(true)
  }

  function editAnswer(id: string, value: string) {
    if (operationRef.current) return
    const nextAnswers = { ...answers, [id]: value }
    setAnswers(nextAnswers)
    setAnswersPending(questions.some((question) => (nextAnswers[question.id] ?? '') !== (appliedAnswers.current[question.id] ?? '')))
    setFormError('')
    onDirty(true)
  }

  function answerPayload(onlyPending = false): Answer[] {
    return questions.map((question) => {
      const answer = answers[question.id] ?? ''
      // Applied answers are already in the card. Replaying them could restore
      // facts that the author has since corrected or removed by hand.
      return { id: question.id, field: question.field, question: question.question, answer: onlyPending && answer === appliedAnswers.current[question.id] ? '' : answer }
    })
  }

  function goToStep(next: Step) {
    if (operationRef.current) return
    if (next === 2 && questions.length && (answersPending || !cardAvailable)) {
      void runGeneration()
      return
    }
    setStep(next)
    setFormError('')
    focusStepHeading()
  }

  function openManualCard() {
    if (operationRef.current || answersPending) return
    setCardAvailable(true)
    setStep(2)
    setFormError('')
    focusStepHeading()
  }

  function focusStepHeading() {
    requestAnimationFrame(() => {
      editorContentRef.current?.querySelector<HTMLElement>('[data-editor-heading]')?.focus({ preventScroll: true })
      editorContentRef.current?.scrollIntoView({ block: 'start' })
    })
  }

  async function runAnalysis() {
    if (operationRef.current) return
    if (normalizeVisibleText(draft.source).length < 10 || draft.source.length > 20_000) {
      setSourceError(draft.source.length > 20_000 ? 'Описание не должно превышать 20 000 символов.' : 'Добавьте хотя бы 10 видимых символов: что происходит и чем может помочь команда.')
      document.getElementById('editor-description')?.focus()
      return
    }
    if (answersPending && questions.some((question) => hasContent(answers[question.id] ?? ''))
      && !window.confirm('Получить новые вопросы? Текущие ответы будут заменены после успешного анализа. Сначала сформируйте карточку или скачайте черновик, если хотите их сохранить.')) return
    const currentRequest = ++requestId.current
    operationRef.current = 'questions'
    setOperation('questions')
    setSourceError('')
    setFormError('')
    try {
      const result = await analyzeTask(draft.source, draft.fields)
      if (requestId.current !== currentRequest) return
      setQuestions(result.questions)
      setAnswers({})
      appliedAnswers.current = {}
      setAnswersPending(false)
      setAiMode(result.mode)
      setAnalysisSummary(result.summary)
      setStep(1)
      focusStepHeading()
      onDirty(true)
    } catch (error) {
      if (requestId.current === currentRequest) {
        setSourceError(error instanceof Error ? error.message : 'Не удалось подготовить вопросы. Попробуйте еще раз.')
      }
    } finally {
      if (requestId.current === currentRequest) {
        operationRef.current = null
        setOperation(null)
      }
    }
  }

  async function runGeneration() {
    if (operationRef.current) return
    if (questions.length < 3) {
      setFormError('Сначала получите уточняющие вопросы по описанию задачи.')
      return
    }
    const currentRequest = ++requestId.current
    operationRef.current = 'card'
    setOperation('card')
    setFormError('')
    try {
      const result = await generateTaskCard(draft.source, draft.fields, answerPayload(true))
      if (requestId.current !== currentRequest) return
      const fields = cardToFields(result.card, draft.fields.topic)
      setDraft((current) => ({ ...current, fields, confirmedFields: [] }))
      setServerRating(undefined)
      setAiMode(result.mode)
      appliedAnswers.current = { ...answers }
      setAnswersPending(false)
      setCardAvailable(true)
      setCardGenerated(true)
      setSourceNeedsReview(false)
      setFieldErrors({})
      setStep(2)
      focusStepHeading()
      onDirty(true)
    } catch (error) {
      if (requestId.current === currentRequest) setFormError(error instanceof Error ? error.message : 'Не удалось сформировать карточку. Ответы сохранены в форме — попробуйте ещё раз.')
    } finally {
      if (requestId.current === currentRequest) {
        operationRef.current = null
        setOperation(null)
      }
    }
  }

  async function confirmFields() {
    if (operationRef.current) return
    if (answersPending) {
      setStep(1)
      setFormError('Сначала сформируйте карточку из новых ответов, затем проверьте и подтвердите сведения.')
      focusStepHeading()
      return
    }
    const currentRequest = ++requestId.current
    operationRef.current = 'confirm'
    setOperation('confirm')
    setFormError('')
    try {
      const result = await confirmTask({ ...draft.fields })
      if (requestId.current !== currentRequest) return
      setDraft((current) => ({ ...current, confirmedFields: [...result.confirmedFields] }))
      setServerRating(result.rating)
      setSourceNeedsReview(false)
      onDirty(true)
    } catch (error) {
      if (requestId.current === currentRequest) setFormError(error instanceof Error ? error.message : 'Не удалось подтвердить сведения. Карточка сохранена в форме — попробуйте ещё раз.')
    } finally {
      if (requestId.current === currentRequest) {
        operationRef.current = null
        setOperation(null)
      }
    }
  }

  async function save(publish: boolean) {
    if (operationRef.current) return
    if (answersPending) {
      setStep(1)
      setFormError('Сначала сформируйте карточку, чтобы сохранить новые ответы вместе с задачей. Можно также скачать текущий черновик.')
      focusStepHeading()
      return
    }
    const mustValidatePublication = publish || draft.published
    if (draft.source.length > 20_000) {
      setStep(0)
      setSourceError('Описание не должно превышать 20 000 символов.')
      requestAnimationFrame(() => document.getElementById('editor-description')?.focus())
      return
    }
    const errors: Partial<Record<FieldKey, string>> = {}
    const overLimit = draft.fields.title.length > 160 || draft.fields.topic.length > 160
    if (draft.fields.title.length > 160) errors.title = 'Сократите название до 160 символов.'
    if (draft.fields.topic.length > 160) errors.topic = 'Сократите тему до 160 символов.'
    if (mustValidatePublication) {
      if (!hasContent(draft.fields.title)) errors.title = 'Добавьте название для каталога.'
      if (!hasContent(draft.fields.topic)) errors.topic = 'Укажите тему или отрасль.'
    }
    if (Object.keys(errors).length) {
      setFieldErrors(errors)
      setFormError(overLimit ? 'Название и тема должны содержать не более 160 символов каждое.' : 'Для публикации заполните название и тему задачи.')
      setStep(2)
      const firstError = errors.title ? 'title' : 'topic'
      requestAnimationFrame(() => document.getElementById(`editor-field-${firstError}`)?.focus())
      return
    }
    if (mustValidatePublication) {
      if (unconfirmedFields.length || !allConfirmed) {
        setFormError(`Проверьте карточку и нажмите «Подтвердить сведения» перед ${draft.published ? 'сохранением изменений' : 'публикацией'}.`)
        setStep(2)
        requestAnimationFrame(() => document.getElementById('editor-confirm')?.focus())
        return
      }
    }
    const currentRequest = ++requestId.current
    if (mustValidatePublication) {
      operationRef.current = 'publish'
      setOperation('publish')
    }
    try {
      if (mustValidatePublication) {
        const rating = await validatePublication({ ...draft.fields }, [...draft.confirmedFields])
        if (requestId.current !== currentRequest) return
        setServerRating(rating)
      }
      const saved = { ...draft, confirmedFields: draft.confirmedFields.filter((key) => hasContent(draft.fields[key])), published: mustValidatePublication, updatedAt: new Date().toISOString() }
      if (onSave(saved)) {
        onDirty(false)
        setSaveFailed(false)
        return
      }
    } catch (error) {
      if (requestId.current === currentRequest) {
        onDirty(true)
        setSaveFailed(true)
        setFormError(error instanceof Error ? error.message : 'Не удалось проверить публикацию. Ваш ввод остался в форме — попробуйте ещё раз.')
      }
      return
    } finally {
      if (requestId.current === currentRequest) {
        operationRef.current = null
        setOperation(null)
      }
    }
    onDirty(true)
    setSaveFailed(true)
    setFormError('Изменения не сохранены. Ваш ввод остался в форме. Проверьте сообщение о сохранении или скачайте текущий черновик перед выходом.')
  }

  function downloadDraft() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), task: draft, questions, answers: answerPayload() }, null, 2)], { type: 'application/json;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'soyle-task-draft.json'
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <div className="editor-page">
    <button className="btn btn-ghost editor-back" type="button" onClick={onCancel} disabled={busy}><Icon name="back" size={17}/> К моим задачам</button>
    <div className="editor-heading">
      <div><div className="eyebrow">ОТ ИДЕИ К СОВМЕСТНОЙ РАБОТЕ</div><h1 className="page-title">{task.published ? 'Редактирование задачи' : 'Подготовим вашу задачу'}</h1><p className="muted">Расскажите о задаче — и помогите командам увидеть, с чего начать.</p></div>
      <span className="editor-demo-badge" role="status"><Icon name="spark" size={16}/>{aiModeLabel}</span>
    </div>

    <nav className="editor-steps" aria-label="Этапы подготовки задачи">
      {STEPS.map((label, index) => <button key={label} className={`editor-step ${index === step ? 'is-current' : ''} ${index < step ? 'is-complete' : ''}`} type="button" aria-current={index === step ? 'step' : undefined} disabled={busy || (index === 1 && !questions.length) || (index === 2 && !canOpenCard)} onClick={() => goToStep(index as Step)}>
        <span className="editor-step-number">{index < step ? <Icon name="check" size={16}/> : index + 1}</span><span>{label}</span>
      </button>)}
    </nav>

    <div className="editor-layout">
      <div className="editor-main">
        <section className="panel editor-content" ref={editorContentRef} aria-busy={busy}>
          {sourceNeedsReview && <div className="editor-source-review" role="status"><Icon name="edit" size={18}/><div><strong>Описание изменилось, контекст карточки сохранен</strong><p>Исходное описание помогает подобрать новые вопросы. Оно не заменяет готовую карточку. Проверьте поле «Контекст» и подтвердите его снова.</p><button className="btn btn-ghost" type="button" disabled={busy} onClick={() => { goToStep(2); requestAnimationFrame(() => document.getElementById('editor-field-context')?.focus()) }}>Проверить контекст карточки <Icon name="arrow" size={14}/></button></div></div>}
          {step === 0 && <>
            <div className="editor-section-heading"><span className="editor-section-icon"><Icon name="edit" size={23}/></span><div><h2 tabIndex={-1} data-editor-heading>Начнем с вашей идеи</h2><p className="muted">Можно своими словами. Необязательно знать все детали сразу.</p></div></div>
            <div className="field editor-field">
              <label htmlFor="editor-description">Описание задачи</label>
              <textarea id="editor-description" className="editor-source" rows={8} maxLength={20_000} value={draft.source} disabled={busy} onChange={(event) => changeSource(event.target.value)} aria-invalid={Boolean(sourceError)} aria-describedby={sourceError ? 'editor-source-error' : 'editor-source-hint'} placeholder="Например: мы получаем много обращений от клиентов и разбираем их вручную. Хотим быстрее находить частые вопросы и понимать, что стоит улучшить…"/>
              <div className="editor-input-footer"><span id="editor-source-hint">Опишите текущую ситуацию, проблему и ваши ожидания.</span><span>{draft.source.length.toLocaleString('ru-RU')} / 20 000</span></div>
              {sourceError && <p className="form-error" id="editor-source-error" role="alert">{sourceError}</p>}
            </div>
            <AIConnectionStatus/>
            <div className="editor-ai-note"><Icon name="spark" size={19}/><div><strong>От описания к понятной карточке</strong><p>Помощник сначала задаст вопросы, затем подготовит карточку из вашего описания и ответов. Неизвестные сведения останутся пустыми. Проверьте результат и подтвердите сведения перед публикацией.</p><button type="button" className="btn btn-ghost editor-manual-card" disabled={busy || answersPending} onClick={openManualCard}>Заполнить карточку вручную<Icon name="arrow" size={15}/></button></div></div>
          </>}

          {step === 1 && <>
            <div className="editor-section-heading"><span className="editor-section-icon"><Icon name="message" size={23}/></span><div><h2 tabIndex={-1} data-editor-heading>Добавим важные детали</h2><p className="muted">Ответьте на то, что уже известно. К остальному можно вернуться позже.</p></div></div>
            <p className="editor-analysis-summary" role="status">{analysisSummary}</p>
            <div className="editor-questions">{questions.map((question, index) => <div className="editor-question" key={question.id}>
              <span className="editor-question-number">{String(index + 1).padStart(2, '0')}</span>
              <div className="field editor-field"><label htmlFor={`editor-answer-${question.id}`}>{FIELD_LABELS[CARD_TO_FIELD[question.field]]}</label><p className="editor-question-text" id={`editor-question-${question.id}`}>{question.question}</p><textarea id={`editor-answer-${question.id}`} rows={3} maxLength={question.field === 'title' ? 160 : 20_000} disabled={busy} value={answers[question.id] ?? ''} onChange={(event) => editAnswer(question.id, event.target.value)} aria-describedby={`editor-question-${question.id} editor-answer-hint-${question.id} editor-answer-example-${question.id}`} placeholder="Ваш ответ"/><p className="editor-field-hint" id={`editor-answer-hint-${question.id}`}>{question.hint}</p><div className="editor-answer-example" id={`editor-answer-example-${question.id}`}><strong>Пример ответа</strong><p>{question.example}</p><span>Иллюстрация. Адаптируйте под свою ситуацию — пример не заполняет поле автоматически.</span></div></div>
            </div>)}</div>
            <p className="editor-answer-note">Ответы попадут в карточку после нажатия «Сформировать карточку». Неизвестные детали можно пропустить.</p>
          </>}

          {step === 2 && <>
            <div className="editor-section-heading"><span className="editor-section-icon"><Icon name="briefcase" size={23}/></span><div><h2 tabIndex={-1} data-editor-heading>Карточка вашей задачи</h2><p className="muted">Проверьте сведения перед публикацией. Поля со звездочкой обязательны для публикации.</p></div></div>
            {cardGenerated && <div className="editor-generated-note" role="status"><Icon name="spark" size={18}/><p>{missingCardFields.length ? `Карточка сформирована. Пока неизвестно: ${missingCardFields.map((key) => FIELD_LABELS[key].toLowerCase()).join(', ')}. Заполните то, что знаете, и проверьте остальные сведения.` : 'Карточка сформирована из описания и ответов. Проверьте сведения и исправьте их при необходимости.'}</p></div>}
            <datalist id="editor-topics">{TOPICS.map((topic) => <option value={topic} key={topic}/>)}</datalist>
            <h3 className="editor-group-title"><span>01</span> Основная информация</h3>
            <div className="editor-form-grid">
              {(['title', 'topic', 'context', 'need'] as FieldKey[]).map((id) => <CardField key={id} id={id} draft={draft} onChange={editField} error={fieldErrors[id]} disabled={busy} wide={id === 'context' || id === 'need'}/>)}
            </div>
            <h3 className="editor-group-title"><span>02</span> Результат и условия</h3>
            <div className="editor-form-grid">
              {(['result', 'success', 'users', 'data', 'constraints'] as FieldKey[]).map((id) => <CardField key={id} id={id} draft={draft} onChange={editField} disabled={busy} wide={id === 'constraints'}/>)}
            </div>
            <h3 className="editor-group-title"><span>03</span> Связь с командой</h3>
            <div className="editor-form-grid">
              <CardField id="contact" draft={draft} onChange={editField} disabled={busy} wide/>
              <CardField id="interaction" draft={draft} onChange={editField} disabled={busy} wide/>
            </div>

            <div className={`editor-confirmation ${allConfirmed ? 'is-confirmed' : ''}`}>
              <span className="editor-confirmation-icon"><Icon name={allConfirmed ? 'check' : 'shield'} size={22}/></span>
              <div><strong>{allConfirmed ? 'Сведения подтверждены' : 'Последний шаг — ваше подтверждение'}</strong><p>{allConfirmed ? 'Рейтинг пересчитан. После изменения поля потребуется подтвердить его снова.' : 'Проверьте заполненные поля. После вашего подтверждения система рассчитает рейтинг по фиксированным правилам.'}</p><button id="editor-confirm" className="btn btn-secondary" type="button" onClick={() => void confirmFields()} disabled={busy || !filledFields.length || allConfirmed}>{operation === 'confirm' ? <><span className="editor-spinner"/>Подтверждаем…</> : <><Icon name="check" size={17}/>{allConfirmed ? 'Все сведения подтверждены' : 'Подтвердить сведения'}</>}</button></div>
            </div>
          </>}

          {formError && <p className="form-error editor-form-error" role="alert">{formError}</p>}
          {(saveFailed || answersPending || Boolean(formError && questions.length)) && <button className="btn btn-secondary editor-download-draft" type="button" onClick={downloadDraft}><Icon name="folder" size={16}/> Скачать текущий черновик</button>}
          {answersPending && <p className="editor-pending-note">Чтобы сохранить ответы в задаче, сначала сформируйте карточку. Скачиваемый черновик содержит и описание, и ответы.</p>}
          <div className="editor-actions">
            <div>{step > 0 && <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => goToStep(step === 2 && !questions.length ? 0 : (step - 1) as Step)}><Icon name="back" size={17}/> Назад</button>}</div>
            <div className="editor-actions-right">
              {!draft.published && <button className="btn btn-secondary" type="button" onClick={() => void save(false)} disabled={busy || answersPending}>Сохранить черновик</button>}
              {step === 0 && <button className="btn btn-primary" type="button" onClick={() => void runAnalysis()} disabled={busy}>{operation === 'questions' ? <><span className="editor-spinner"/> Готовим вопросы…</> : <><Icon name="spark" size={17}/> Получить вопросы</>}</button>}
              {step === 1 && <button className="btn btn-primary" type="button" onClick={() => void runGeneration()} disabled={busy}>{operation === 'card' ? <><span className="editor-spinner"/>Формируем карточку…</> : <>Сформировать карточку<Icon name="arrow" size={17}/></>}</button>}
              {step === 2 && <button className="btn btn-primary" type="button" onClick={() => void save(true)} disabled={busy}>{operation === 'publish' ? <><span className="editor-spinner"/>Проверяем публикацию…</> : <>{draft.published ? 'Сохранить изменения' : 'Опубликовать задачу'}<Icon name="arrow" size={17}/></>}</button>}
            </div>
          </div>
        </section>
        <p className="editor-bottom-note"><Icon name="shield" size={15}/>{draft.published ? 'Изменения появятся в каталоге после подтверждения сведений и сохранения.' : 'Задача появится в каталоге только после вашего подтверждения и публикации.'}</p>
      </div>

      <aside className="editor-aside">
        <RatingPanel task={draft} rating={serverRating}/>
        <div className="editor-side-note"><span className="editor-side-note-icon"><Icon name="people" size={20}/></span><h3>Понятная задача притягивает команды</h3><p>Чем больше деталей, тем точнее предложения студентов. Даже с низким рейтингом задачу можно опубликовать и дополнить позже.</p><div className="editor-side-stat"><strong>{filledFields.length}<span> / 11</span></strong><span>полей заполнено</span></div></div>
      </aside>
    </div>
  </div>
}
