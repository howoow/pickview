import type { PickviewApi } from '../../shared/types'

declare global {
  interface Window {
    pickview: PickviewApi
  }
}

export {}
