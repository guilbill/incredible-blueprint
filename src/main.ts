import './ui/style.css'
import type { Level } from './level/types'
import { loadProgress } from './storage'
import { loadLevels, mountLevelList } from './ui/levels'
import { mountPlay } from './ui/play'

const app = document.querySelector<HTMLDivElement>('#app')!
const levels = loadLevels()
let unmount: () => void = () => {}

function showList(): void {
  unmount()
  unmount = mountLevelList(app, levels, loadProgress(), { onPlay: play })
}

function play(level: Level): void {
  unmount()
  unmount = mountPlay(app, level, {
    onWin: () => {
      const next = levels[levels.indexOf(level) + 1]
      if (next) play(next)
      else showList()
    },
    onBack: showList,
  })
}

showList()
