const STORAGE_KEY = 'docagent_token'

export const tokenStorage = {
  getToken: () => {
    return localStorage.getItem(STORAGE_KEY)
  },

  setToken: (token) => {
    if (token) {
      localStorage.setItem(STORAGE_KEY, token)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  },

  clearToken: () => {
    localStorage.removeItem(STORAGE_KEY)
  }
}
