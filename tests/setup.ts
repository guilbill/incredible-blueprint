import { vi } from 'vitest'
import { setLang } from '../src/i18n'

// Without a storage, nothing is saved and Node does not warn about its missing --localstorage-file.
vi.stubGlobal('localStorage', undefined)
setLang('fr')
vi.unstubAllGlobals()
