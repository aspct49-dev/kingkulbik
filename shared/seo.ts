/*
 * Search and share details for every page: the browser title, the description
 * search engines and link previews show, and whether the page should be
 * indexed. Used in two places:
 *   - the build (vite.config.ts) writes a copy of index.html per public page
 *     with these tags already in it, plus sitemap.xml and robots.txt, so
 *     crawlers and Discord/X previews see them without running the app;
 *   - the app (App.tsx) updates them as you move between pages.
 */

export const SITE_NAME = 'King Kulbik'
export const STAKE_CODE = 'KINGKULBIK'
/** Used when SITE_URL isn't set at build time */
export const DEFAULT_SITE_URL = 'https://kingkulbik.vercel.app'
export const OG_IMAGE = '/og-image.png'

export type PageSeo = {
  /** Shown as "<title> | King Kulbik" (the home page uses its own full title) */
  title: string
  description: string
  /** false: kept out of search (accounts, admin, overlays) */
  index: boolean
}

export const HOME_TITLE = 'King Kulbik | Stake Code KINGKULBIK: Leaderboards, Rewards & Raffles'

export const PAGES: Record<string, PageSeo> = {
  '/': {
    title: HOME_TITLE,
    description:
      'Play on Stake with code KINGKULBIK and compete on the $40,000 monthly leaderboards. Rank up milestones, raffles, challenges, King Points rewards and free originals.',
    index: true,
  },
  '/leaderboard': {
    title: 'Stake Leaderboard: $40,000 Monthly',
    description:
      'Live Stake leaderboard for code KINGKULBIK. Wager under the code to climb the $30,000 weighted race and the $10,000 Stake Exclusive board every month.',
    index: true,
  },
  '/rewards': {
    title: 'Kulbik Rewards',
    description:
      'Every reward for playing under code KINGKULBIK: tripled weekly bonus, 10% weekly lossback, wager milestones, a free $21 on sign up, weekly $1,000 raffles and the $40K race.',
    index: true,
  },
  '/milestones': {
    title: 'Rank Up Milestones',
    description:
      'Claim a cash prize at every wager milestone under code KINGKULBIK, from Bronze at $10,000 wagered up to Platinum VI. Track your progress live.',
    index: true,
  },
  '/challenges': {
    title: 'Slot Challenges',
    description: 'Hit the target multiplier on featured Stake slots under code KINGKULBIK and win the challenge prize.',
    index: true,
  },
  '/raffles': {
    title: 'Raffles',
    description:
      'Monthly viewer raffles: watch King Kulbik on Kick or wager under code KINGKULBIK to earn tickets. Provably fair draws live on stream.',
    index: true,
  },
  '/item-store': {
    title: 'Item Store',
    description: 'Spend the King Points you earn on the Kick stream on real items and balance top-ups.',
    index: true,
  },
  '/referral': {
    title: '$1,000 Referral',
    description: 'Earn $1,000 for referring an eligible high roller to Stake under code KINGKULBIK.',
    index: true,
  },
  '/bonus-hunt': {
    title: 'Bonus Hunt',
    description: 'Follow King Kulbik’s bonus hunts live: every bonus, its bet and payout, break-even and the best wins.',
    index: true,
  },
  '/guess-the-balance': {
    title: 'Guess the Balance',
    description: 'Guess where the bonus hunt finishes. The closest guess wins the prize.',
    index: true,
  },
  '/tournaments': {
    title: 'Slot Tournaments',
    description: 'Head-to-head slot battles from the King Kulbik stream: the highest multiplier goes through, round by round.',
    index: true,
  },
  '/socials': {
    title: 'Socials & Video',
    description: 'Watch King Kulbik live on Kick, catch up on past streams and follow on X and Discord.',
    index: true,
  },
  '/coinflip': {
    title: 'Coinflip',
    description: 'Provably fair Coinflip played with King Points. Call heads or tails and build a streak.',
    index: true,
  },
  '/keno': {
    title: 'Keno',
    description: 'Provably fair Keno played with King Points. Pick up to 10 tiles and choose your risk.',
    index: true,
  },
  '/account': {
    title: 'Your Account',
    description: 'Your King Kulbik account, linked Kick and Stake accounts, milestones and bet history.',
    index: false,
  },
  '/admin': { title: 'Admin Panel', description: 'King Kulbik admin.', index: false },
}

export const NOT_FOUND: PageSeo = {
  title: 'Page not found',
  description: 'This page does not exist on King Kulbik.',
  index: false,
}

export const fullTitle = (path: string, page: PageSeo) => (path === '/' ? page.title : `${page.title} | ${SITE_NAME}`)

/** Search engines may crawl everything except these */
export const DISALLOW = ['/api/', '/admin', '/account', '/overlay/']

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The <head> tags for one page, between the <!--seo--> markers in index.html.
 * `siteUrl` is the public origin (https://…, no trailing slash): canonical
 * links, share previews and the sitemap need absolute addresses.
 */
export function seoHead(path: string, page: PageSeo, siteUrl: string) {
  const url = siteUrl + (path === '/' ? '/' : path)
  const title = escape(fullTitle(path, page))
  const description = escape(page.description)
  const image = siteUrl + OG_IMAGE
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta name="robots" content="${page.index ? 'index, follow' : 'noindex, nofollow'}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
  ].join('\n    ')
}

/** sitemap.xml: every indexable page */
export function sitemap(siteUrl: string) {
  const urls = Object.entries(PAGES)
    .filter(([, page]) => page.index)
    .map(([path]) => `  <url><loc>${siteUrl}${path === '/' ? '/' : path}</loc></url>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
}

export function robots(siteUrl: string) {
  return ['User-agent: *', ...DISALLOW.map((p) => `Disallow: ${p}`), '', `Sitemap: ${siteUrl}/sitemap.xml`, ''].join('\n')
}
