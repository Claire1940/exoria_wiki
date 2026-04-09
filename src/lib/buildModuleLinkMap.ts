import { getAllContent, CONTENT_TYPES } from '@/lib/content'
import type { Language, ContentItem } from '@/lib/content'

export interface ArticleLink {
  url: string
  title: string
}

export type ModuleLinkMap = Record<string, ArticleLink | null>

interface ArticleWithType extends ContentItem {
  contentType: string
}

// Module sub-field mapping: moduleKey -> { field, nameKey }
// nameKey='' means skip sub-item matching (identifiers / editorial titles)
const MODULE_FIELDS: Record<string, { field: string; nameKey: string }> = {
  exoriaCodes: { field: 'codes', nameKey: '' }, // code identifiers, skip sub-items
  exoriaTrelloAndDiscord: { field: 'cards', nameKey: 'title' },
  exoriaBeginnerGuide: { field: 'steps', nameKey: 'title' },
  exoriaPurityPathGuide: { field: 'faqs', nameKey: 'question' },
  exoriaClassesGuide: { field: 'cards', nameKey: 'title' },
  exoriaWeaponsGuide: { field: 'rows', nameKey: 'name' },
  exoriaRacesGuide: { field: 'cards', nameKey: '' }, // editorial titles, skip sub-items
  exoriaSkillTreeGuide: { field: 'faqs', nameKey: 'question' },
  exoriaBossesGuide: { field: 'cards', nameKey: 'title' },
  exoriaDungeonsGuide: { field: 'cards', nameKey: '' }, // editorial titles, skip sub-items
  exoriaQuestsGuide: { field: 'steps', nameKey: '' }, // editorial titles, skip sub-items
  exoriaCardsGuide: { field: 'cards', nameKey: '' }, // editorial titles, skip sub-items
  exoriaAccessoriesGuide: { field: 'items', nameKey: 'accessoryLayer' },
  exoriaEventsGuide: { field: 'items', nameKey: 'name' },
  exoriaUpdate2PatchNotes: { field: 'items', nameKey: 'label' },
  exoriaReleaseDate: { field: 'items', nameKey: '' }, // milestone identifiers, skip sub-items
}

// Extra semantic keywords per module to boost matching for h2 titles
// These supplement the module title text when matching against articles
const MODULE_EXTRA_KEYWORDS: Record<string, string[]> = {
  exoriaCodes: ['codes', 'free rolls', 'redeem', 'rewards', 'loading screen'],
  exoriaTrelloAndDiscord: ['trello', 'discord', 'official', 'community', 'announcements'],
  exoriaBeginnerGuide: ['beginner', 'starter', 'guide', 'progression', 'basics', 'getting started'],
  exoriaPurityPathGuide: ['purity', 'path', 'alignment', 'moral', 'quests', 'purity path'],
  exoriaClassesGuide: ['classes', 'sword', 'frontline', 'builds', 'class guide'],
  exoriaWeaponsGuide: ['weapons', 'sword', 'combat', 'melee', 'weapon guide'],
  exoriaRacesGuide: ['races', 'race', 'character', 'reroll', 'best race'],
  exoriaSkillTreeGuide: ['skill tree', 'skills', 'unlock', 'progression', 'skill'],
  exoriaBossesGuide: ['bosses', 'malphas', 'farming', 'rare drops', 'boss guide'],
  exoriaDungeonsGuide: ['dungeons', 'dungeon', 'mechanics', 'boss encounters'],
  exoriaQuestsGuide: ['quests', 'quest', 'progression', 'grinding', 'quest guide'],
  exoriaCardsGuide: ['cards', 'card', 'collecting', 'card system'],
  exoriaAccessoriesGuide: ['accessories', 'artifacts', 'build', 'extras', 'accessory'],
  exoriaEventsGuide: ['events', 'timed rewards', 'discord', 'live activity'],
  exoriaUpdate2PatchNotes: ['update', 'patch', 'notes', 'changelog', 'early access'],
  exoriaReleaseDate: ['release date', 'launch', 'early access', 'timeline', 'free to play'],
}

const FILLER_WORDS = ['exoria', 'roblox', '2026', '2025', 'complete', 'the', 'and', 'for', 'how', 'with', 'our', 'this', 'your', 'all', 'from', 'learn', 'master']

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getSignificantTokens(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter(w => w.length > 2 && !FILLER_WORDS.includes(w))
}

function matchScore(queryText: string, article: ArticleWithType, extraKeywords?: string[]): number {
  const normalizedQuery = normalize(queryText)
  const normalizedTitle = normalize(article.frontmatter.title)
  const normalizedDesc = normalize(article.frontmatter.description || '')
  const normalizedSlug = article.slug.replace(/-/g, ' ').toLowerCase()

  let score = 0

  // Exact phrase match in title (stripped of "Exoria")
  const strippedQuery = normalizedQuery.replace(/exoria\s*/g, '').trim()
  const strippedTitle = normalizedTitle.replace(/exoria\s*/g, '').trim()
  if (strippedQuery.length > 3 && strippedTitle.includes(strippedQuery)) {
    score += 100
  }

  // Token overlap from query text
  const queryTokens = getSignificantTokens(queryText)
  for (const token of queryTokens) {
    if (normalizedTitle.includes(token)) score += 20
    if (normalizedDesc.includes(token)) score += 5
    if (normalizedSlug.includes(token)) score += 15
  }

  // Extra keywords scoring (for module h2 titles)
  if (extraKeywords) {
    for (const kw of extraKeywords) {
      const normalizedKw = normalize(kw)
      if (normalizedTitle.includes(normalizedKw)) score += 15
      if (normalizedDesc.includes(normalizedKw)) score += 5
      if (normalizedSlug.includes(normalizedKw)) score += 10
    }
  }

  return score
}

function findBestMatch(
  queryText: string,
  articles: ArticleWithType[],
  extraKeywords?: string[],
  threshold = 20,
): ArticleLink | null {
  let bestScore = 0
  let bestArticle: ArticleWithType | null = null

  for (const article of articles) {
    const score = matchScore(queryText, article, extraKeywords)
    if (score > bestScore) {
      bestScore = score
      bestArticle = article
    }
  }

  if (bestScore >= threshold && bestArticle) {
    return {
      url: `/${bestArticle.contentType}/${bestArticle.slug}`,
      title: bestArticle.frontmatter.title,
    }
  }

  return null
}

export async function buildModuleLinkMap(locale: Language): Promise<ModuleLinkMap> {
  // 1. Load all articles across all content types
  const allArticles: ArticleWithType[] = []
  for (const contentType of CONTENT_TYPES) {
    const items = await getAllContent(contentType, locale)
    for (const item of items) {
      allArticles.push({ ...item, contentType })
    }
  }

  // 2. Load module data from en.json (use English for keyword matching)
  const enMessages = (await import('../locales/en.json')).default as any

  const linkMap: ModuleLinkMap = {}

  // 3. For each module, match h2 title and sub-items
  for (const [moduleKey, fieldConfig] of Object.entries(MODULE_FIELDS)) {
    const moduleData = enMessages.modules?.[moduleKey]
    if (!moduleData) continue

    // Match module h2 title (use extra keywords + lower threshold for broader matching)
    const moduleTitle = moduleData.title as string
    if (moduleTitle) {
      const extraKw = MODULE_EXTRA_KEYWORDS[moduleKey] || []
      linkMap[moduleKey] = findBestMatch(moduleTitle, allArticles, extraKw, 15)
    }

    // Match sub-items
    const subItems = moduleData[fieldConfig.field] as any[]
    if (Array.isArray(subItems)) {
      for (let i = 0; i < subItems.length; i++) {
        const itemName = subItems[i]?.[fieldConfig.nameKey] as string
        if (itemName) {
          const key = `${moduleKey}::${fieldConfig.field}::${i}`
          linkMap[key] = findBestMatch(itemName, allArticles)
        }
      }
    }
  }

  return linkMap
}
