import { partLabel, t } from '../i18n'
import { encodeLevel, levelToFile, shareUrl } from '../level/codec'
import { saveCustomLevel } from '../level/custom'
import type { Level, Solution } from '../level/types'
import { el } from '../ui/dom'
import { mountPlay } from '../ui/play'
import { goalsPanel } from './goals-panel'
import { loadLocks, pruneLocks, saveLocks } from './locks'
import { ALL_KINDS, type EditorModel } from './model'

export interface EditorOpts {
  /** The author won their own level in test mode (the model is already verified and saved). */
  onTestWin(sol: Solution): void
  onBack(): void
}

/** What the author's board edits: no fixed parts of its own, every kind without limit. */
function boardLevel(model: EditorModel): Level {
  return { ...model.level, fixed: [], fixedLinks: [], goals: [], inventory: ALL_KINDS.map((kind) => ({ kind, count: Infinity })) }
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = el('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * Level editor: the play board in author mode (fixed parts), a side panel for the title, goals and
 * player inventory, and a test mode that plays the level for real. The level is saved on every
 * change; sharing and exporting need a win in test mode since the last edit.
 */
export function mountEditor(root: HTMLElement, model: EditorModel, opts: EditorOpts): () => void {
  let unmountView: () => void = () => {}
  let tracing: { part: string; hold: number } | undefined
  let saved = true
  let noticeTimer = 0
  /** Locked parts of the board: an author aid kept next to the level, never in it. */
  let locks = pruneLocks(loadLocks(model.level.id), model.level.fixed)

  function persist(): void {
    saved = saveCustomLevel(model.level)
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && tracing) {
      tracing = undefined
      refresh()
    }
  }

  // Elements of the author view, rebuilt by showAuthor().
  let refresh: () => void = () => {}

  function showAuthor(): void {
    unmountView()
    tracing = undefined

    // ---- toolbar ----
    const status = el('span', 'status')
    const testBtn = el('button', 'btn primary', t('editor.test'))
    const shareBtn = el('button', 'btn', t('editor.share'))
    const exportBtn = el('button', 'btn', t('editor.export'))
    testBtn.title = t('editor.testTitle')
    const shareBox = el('div', 'sharebox')
    shareBox.hidden = true
    const toolbar = [el('h1', '', t('editor.title')), status, el('span', 'spacer'), testBtn, shareBtn, exportBtn, shareBox]

    testBtn.addEventListener('click', showTest)
    exportBtn.addEventListener('click', () => {
      if (model.canShare) download(levelToFile(model.level), `${model.level.id}.tim.json`)
    })
    shareBtn.addEventListener('click', () => void share(shareBox))

    // ---- side panel ----
    const side = el('aside')
    const titleIn = el('input')
    titleIn.value = model.level.title
    titleIn.maxLength = 60
    titleIn.addEventListener('input', () => {
      model.setTitle(titleIn.value)
      changed()
    })
    const goalIn = el('textarea')
    goalIn.value = model.level.goalText
    goalIn.rows = 3
    goalIn.maxLength = 300
    goalIn.placeholder = t('editor.goalPlaceholder')
    goalIn.addEventListener('input', () => {
      model.setGoalText(goalIn.value)
      changed()
    })
    const levelBox = el('section')
    const titleLabel = el('label', '', t('editor.titleLabel'))
    titleLabel.append(titleIn)
    const goalLabel = el('label', '', t('editor.goalLabel'))
    goalLabel.append(goalIn)
    levelBox.append(el('h2', '', t('editor.level')), titleLabel, goalLabel)

    const goals = goalsPanel(model, {
      changed,
      trace: (t) => {
        tracing = t
        refresh()
      },
      tracing: () => !!tracing,
    })

    const inv = el('section', 'inv')
    inv.append(el('h2', '', t('editor.inventory')))
    const counts = new Map<string, HTMLSpanElement>()
    for (const kind of ALL_KINDS) {
      const row = el('div', 'row')
      const dec = el('button', 'btn small', '−')
      const inc = el('button', 'btn small', '+')
      const value = el('span', 'value')
      const count = () => model.level.inventory.find((it) => it.kind === kind)?.count ?? 0
      dec.addEventListener('click', () => {
        if (count() > 0) {
          model.setInventory(kind, count() - 1)
          changed()
        }
      })
      inc.addEventListener('click', () => {
        if (count() < 99) {
          model.setInventory(kind, count() + 1)
          changed()
        }
      })
      row.append(el('span', 'label', partLabel(kind)), dec, value, inc)
      counts.set(kind, value)
      inv.append(row)
    }
    const notice = el('p', 'notice')
    notice.setAttribute('role', 'status')
    notice.hidden = true
    goals.el.insertBefore(notice, goals.el.children[1] ?? null)
    side.append(levelBox, goals.el, inv)

    refresh = () => {
      goals.refresh()
      for (const [kind, value] of counts) {
        const n = model.level.inventory.find((it) => it.kind === kind)?.count ?? 0
        value.textContent = String(n)
        value.parentElement!.classList.toggle('zero', n === 0)
      }
      testBtn.disabled = !model.canTest
      shareBtn.disabled = exportBtn.disabled = !model.canShare
      shareBtn.title = exportBtn.title = model.canShare ? '' : t('editor.shareFirst')
      if (!model.canShare) shareBox.hidden = true
      status.className = `status ${model.canShare ? 'ok' : ''}`
      status.textContent = !saved ? t('editor.unsaved') : !model.canTest ? t('editor.noGoal') : model.canShare ? t('level.verified') : t('level.untested')
    }

    /** The traced part was removed: drop the zone in progress and say why. */
    function cancelTracing(): void {
      tracing = undefined
      notice.textContent = t('editor.traceCancelled')
      notice.hidden = false
      window.clearTimeout(noticeTimer)
      noticeTimer = window.setTimeout(() => (notice.hidden = true), 3000)
      refresh()
    }

    function changed(): void {
      persist()
      refresh()
    }

    unmountView = mountPlay(root, boardLevel(model), {
      onWin: () => {},
      onBack: opts.onBack,
      author: {
        initial: structuredClone({ placements: model.level.fixed, links: model.level.fixedLinks }),
        onChange: (sol) => {
          model.setFixed(sol.placements, sol.links)
          const kept = pruneLocks(locks, sol.placements)
          if (kept.size !== locks.size) {
            locks = kept
            saveLocks(model.level.id, locks)
          }
          if (tracing && !model.hasTarget(tracing.part)) cancelTracing()
          changed()
        },
        goals: () => model.level.goals,
        locked: () => locks,
        setLocked: (ids, on) => {
          locks = new Set(locks)
          for (const id of ids) on ? locks.add(id) : locks.delete(id)
          saveLocks(model.level.id, locks)
        },
        tracing: () => !!tracing,
        onTraced: (zone) => {
          if (!tracing) return
          const added = model.addGoal({ type: 'inZone', part: tracing.part, zone, hold: tracing.hold })
          if (!added) return cancelTracing()
          tracing = undefined
          changed()
        },
        toolbar,
        side,
      },
    })
    refresh()
  }

  async function share(box: HTMLElement): Promise<void> {
    if (!model.canShare) return
    const url = shareUrl(await encodeLevel(model.level))
    let copied = false
    try {
      await navigator.clipboard.writeText(url)
      copied = true
    } catch {
      copied = false
    }
    const field = el('input')
    field.readOnly = true
    field.value = url
    const close = el('button', 'btn small ghost', t('common.close'))
    close.addEventListener('click', () => (box.hidden = true))
    box.replaceChildren(el('span', copied ? 'ok' : '', copied ? t('editor.copied') : t('editor.copyThis')), field, close)
    box.hidden = false
    field.focus()
    field.select()
  }

  function showTest(): void {
    if (!model.canTest) return
    unmountView()
    unmountView = mountPlay(root, structuredClone(model.level), {
      backLabel: t('editor.back'),
      nextLabel: t('editor.backToEditor'),
      onBack: showAuthor,
      onWin: showAuthor,
      onSolved: (sol) => {
        model.onTestWin(sol)
        persist()
        opts.onTestWin(sol)
      },
    })
  }

  window.addEventListener('keydown', onKey)
  // Nothing is stored before the first real edit: an untouched "+ Nouveau niveau" leaves no empty level behind.
  showAuthor()
  return () => {
    window.removeEventListener('keydown', onKey)
    window.clearTimeout(noticeTimer)
    unmountView()
  }
}
