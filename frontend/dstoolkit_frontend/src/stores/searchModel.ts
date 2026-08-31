import { defineStore } from 'pinia'
import { useAuthStore } from '@/stores/auth'

const SEARCH_MODEL_KEY = 'dstoolkit_search_model'

export type SearchModel = 'local_v1' | 'cloud_v1' | 'cloud_v2'

export const useSearchModelStore = defineStore('searchModel', {
  state: () => ({
    model: (localStorage.getItem(SEARCH_MODEL_KEY) || 'local_v1') as SearchModel,
  }),
  getters: {
    isLocalV1: (s) => s.model === 'local_v1',
    isCloudV1: (s) => s.model === 'cloud_v1',
    isCloudV2: (s) => s.model === 'cloud_v2',
  },
  actions: {
    setModel(m: SearchModel): boolean {
      // cloud_v2 is disabled in UI; guard against accidental calls.
      if (m === 'cloud_v2') {
        return false
      }
      // cloud_v1 requires cloud sync to be enabled; UI handles the warning.
      if (m === 'cloud_v1') {
        if (!useAuthStore().cloudSyncEnabled) {
          return false
        }
      }
      // local_v1 is always allowed; cloud_v1 reaching here passed the check.
      this.model = m
      localStorage.setItem(SEARCH_MODEL_KEY, m)
      return true
    },
    syncFromAuth(): void {
      // Safety net: if cloud sync was toggled off while on cloud_v1, reset.
      if (this.model === 'cloud_v1' && !useAuthStore().cloudSyncEnabled) {
        this.model = 'local_v1'
        localStorage.setItem(SEARCH_MODEL_KEY, 'local_v1')
      }
    },
  },
})
