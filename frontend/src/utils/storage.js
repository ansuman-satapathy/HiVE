const STORAGE_KEY = 'hive_token'
const LEGACY_STORAGE_KEY = 'docagent_token'

export const tokenStorage = {
  getToken: () => {
    return localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY)
  },

  setToken: (token) => {
    if (token) {
      localStorage.setItem(STORAGE_KEY, token)
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    } else {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    }
  },

  clearToken: () => {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  }
}
