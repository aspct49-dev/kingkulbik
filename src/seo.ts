import { fullTitle, NOT_FOUND, PAGES } from '../shared/seo'

/**
 * The site's public address, from the canonical link the build wrote into the
 * first page loaded (so links stay on the real domain even when the site is
 * opened at another address); the current origin in development.
 */
const siteUrl = (() => {
  const href = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href
  try {
    return href ? new URL(href).origin : window.location.origin
  } catch {
    return window.location.origin
  }
})()

/** Set the attribute on the tag the build put in <head> (created if missing, e.g. in development) */
function setTag(selector: string, attr: 'content' | 'href', value: string, create: () => HTMLElement) {
  let el = document.head.querySelector(selector)
  if (!el) {
    el = create()
    document.head.appendChild(el)
  }
  el.setAttribute(attr, value)
}

const meta = (key: 'name' | 'property', value: string) => () => {
  const el = document.createElement('meta')
  el.setAttribute(key, value)
  return el
}

/**
 * Keep the title, description, canonical link and share tags in step with the
 * page being shown (the build writes them for each page's first load; this
 * covers moving between pages in the app).
 */
export function applySeo(pathname: string) {
  const page = PAGES[pathname] ?? NOT_FOUND
  const title = fullTitle(pathname, page)
  const url = siteUrl + pathname
  document.title = title
  setTag('meta[name="description"]', 'content', page.description, meta('name', 'description'))
  setTag('meta[name="robots"]', 'content', page.index ? 'index, follow' : 'noindex, nofollow', meta('name', 'robots'))
  setTag('link[rel="canonical"]', 'href', url, () => Object.assign(document.createElement('link'), { rel: 'canonical' }))
  setTag('meta[property="og:title"]', 'content', title, meta('property', 'og:title'))
  setTag('meta[property="og:description"]', 'content', page.description, meta('property', 'og:description'))
  setTag('meta[property="og:url"]', 'content', url, meta('property', 'og:url'))
  setTag('meta[name="twitter:title"]', 'content', title, meta('name', 'twitter:title'))
  setTag('meta[name="twitter:description"]', 'content', page.description, meta('name', 'twitter:description'))
}
