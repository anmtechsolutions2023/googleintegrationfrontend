const isDev = process.env.NODE_ENV !== 'production'

const logger = {
  debug: (...args) => {
    if (isDev) console.debug('[debug]', ...args)
  },
  info: (...args) => console.info('[info]', ...args),
  warn: (...args) => console.warn('[warn]', ...args),
  error: (...args) => console.error('[error]', ...args),
}

export default logger
