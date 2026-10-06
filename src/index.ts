import { Plugin } from "@opencode/plugin"
import fs from "node:fs"
import path from "node:path"

// Emoji prefixes for titles
const EMOJI_KEYWORD = "🔍"  // Used for quick keyword-based titles
const EMOJI_AI = "✨"       // Used for AI-generated titles

interface PluginConfig {
  model: string | null
  provider: string | null
  maxLength: number
  disabled: boolean
  debug: boolean | string  // true, false, or path to log file
}

// Known cheap/fast model patterns - ordered by preference
// Priority: fast (often free) > flash (very cheap) > haiku (cheap) > other cheap patterns
const CHEAP_MODEL_PATTERNS = [
  /luna/i,
  /fast/i,      // Grok Code Fast, etc. (often free)
  /flash/i,     // Gemini Flash (very cheap)
  /haiku/i,     // Claude Haiku (cheap)
  /mini/i,
  /instant/i,
  /small/i,
  /lite/i,
  /turbo/i,
  /8b/i,
  /7b/i,
]

function findCheapestFromModels(models: any, log: ReturnType<typeof createLogger>): string | null {
  // Handle both array and object formats
  let modelIds: string[] = []
  
  if (Array.isArray(models)) {
    modelIds = models
      .map((m: any) => m.id || m.name || m)
      .filter((id): id is string => typeof id === "string")
  } else if (models && typeof models === "object") {
    // Models is an object with model IDs as keys
    modelIds = Object.keys(models)
  }
  
  if (modelIds.length === 0) return null
  
  log.debug(`Available models: ${modelIds.slice(0, 10).join(", ")}${modelIds.length > 10 ? "..." : ""}`)
  
  // Try to find a cheap model by pattern matching
  for (const pattern of CHEAP_MODEL_PATTERNS) {
    const match = modelIds.find(id => pattern.test(id))
    if (match) {
      log.debug(`Found cheap model by pattern ${pattern}: ${match}`)
      return match
    }
  }
  
  // No cheap model found, return first available
  log.debug(`No cheap model pattern matched, using first: ${modelIds[0]}`)
  return modelIds[0] || null
}

function loadConfig(): PluginConfig {
  const env = process.env
  const debugEnv = env.OPENCODE_AUTOTITLE_DEBUG
  const requestedLength = Number(env.OPENCODE_AUTOTITLE_MAX_LENGTH)
  
  // Debug can be: "1", "true" (enable stderr), or a file path
  let debug: boolean | string = false
  if (debugEnv) {
    if (debugEnv === "1" || debugEnv === "true") {
      debug = true
    } else if (debugEnv !== "0" && debugEnv !== "false") {
      // Treat as file path
      debug = debugEnv
    }
  }
  
  return {
    model: env.OPENCODE_AUTOTITLE_MODEL || null,
    provider: env.OPENCODE_AUTOTITLE_PROVIDER || null,
    maxLength: Number.isInteger(requestedLength) && requestedLength >= 4 ? requestedLength : 60,
    disabled: env.OPENCODE_AUTOTITLE_DISABLED === "1" || env.OPENCODE_AUTOTITLE_DISABLED === "true",
    debug,
  }
}

function createLogger(debug: boolean | string) {
  const logFile = typeof debug === "string" ? debug : null
  let logPath: string | null = null
  if (logFile) {
    try {
      logPath = path.isAbsolute(logFile) ? logFile : path.resolve(process.cwd(), logFile)
      fs.mkdirSync(path.dirname(logPath), { recursive: true })
    } catch {
      logPath = null
    }
  }
  const write = (level: "debug" | "error", message: string) => {
    if (level === "debug" && !debug) return
    const line = `[autotitle] ${new Date().toISOString()} ${level.toUpperCase()}: ${message}\n`
    if (logPath) {
      try { fs.appendFileSync(logPath, line); return } catch { /* stderr fallback */ }
    }
    console.error(line.trimEnd())
  }
  return { debug: (message: string) => write("debug", message), error: (message: string) => write("error", message) }
}

function isTimestampTitle(title: string | undefined): boolean {
  if (!title) return true
  if (title.trim() === "") return true
  
  const timestampPatterns = [
    /^\d{4}-\d{2}-\d{2}/, // 2024-01-15...
    /^\d{1,2}\/\d{1,2}\/\d{2,4}/, // 1/15/24 or 01/15/2024
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i,
    /^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i,
    /^Session\s+\d+/i,
    /^New\s+Session/i,
    /^Untitled/i,
  ]
  
  return timestampPatterns.some(pattern => pattern.test(title.trim()))
}

// Check if title was set by our plugin (has our emoji prefix)
function hasPluginEmoji(title: string | undefined): boolean {
  if (!title) return false
  return title.startsWith(EMOJI_KEYWORD) || title.startsWith(EMOJI_AI)
}

// Check if we should modify this title
// Returns true if: default/timestamp title OR has our emoji prefix
// Returns false if: custom user title (no emoji from us)
function shouldModifyTitle(title: string | undefined): boolean {
  if (isTimestampTitle(title)) return true
  if (hasPluginEmoji(title)) return true
  return false
}

function sanitizeTitle(title: string, maxLength: number): string {
  return title
    .replace(/[^\w\s.\-]/g, "")  // Keep dots for filenames like AGENTS.md
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "must", "shall", "can", "need", "dare",
    "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
    "into", "through", "during", "before", "after", "above", "below",
    "between", "under", "again", "further", "then", "once", "here",
    "there", "when", "where", "why", "how", "all", "each", "few",
    "more", "most", "other", "some", "such", "no", "nor", "not",
    "only", "own", "same", "so", "than", "too", "very", "just",
    "and", "but", "if", "or", "because", "until", "while", "this",
    "that", "these", "those", "i", "me", "my", "myself", "we", "our",
    "you", "your", "he", "him", "his", "she", "her", "it", "its",
    "they", "them", "their", "what", "which", "who", "whom", "please",
    "help", "want", "like", "make", "create", "write", "add", "get",
    // Additional common verbs that don't add meaning
    "came", "come", "goes", "going", "went", "give", "gave", "take", "took",
    "put", "see", "saw", "know", "knew", "think", "thought", "tell", "told",
    "ask", "asked", "use", "used", "find", "found", "let", "try", "tried",
    "look", "looking", "need", "needed", "seem", "seemed", "work", "working",
  ])

  // Return words in order they appear (preserving sequence), not by frequency
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))

  // Remove duplicates while preserving order
  const seen = new Set<string>()
  const uniqueWords: string[] = []
  for (const word of words) {
    if (!seen.has(word)) {
      seen.add(word)
      uniqueWords.push(word)
    }
  }

  return uniqueWords.slice(0, 6)
}

function inferIntent(text: string): string {
  const t = text.toLowerCase()
  
  if (/\b(test|pytest|jest|spec|vitest|testing)\b/.test(t)) return "testing"
  if (/\b(debug|trace|breakpoint|stack|error|issue)\b/.test(t)) return "debugging"
  if (/\b(fix|bug|broken|patch|resolve)\b/.test(t)) return "fix"
  if (/\b(refactor|cleanup|reorganize|restructure|clean)\b/.test(t)) return "refactor"
  if (/\b(doc|readme|documentation|comment)\b/.test(t)) return "docs"
  if (/\b(review|pr|pull.?request)\b/.test(t)) return "review"
  if (/\b(deploy|docker|k8s|terraform|ci|cd|pipeline)\b/.test(t)) return "devops"
  if (/\b(api|endpoint|route|controller)\b/.test(t)) return "api"
  if (/\b(ui|frontend|component|style|css)\b/.test(t)) return "ui"
  if (/\b(database|db|sql|query|migration)\b/.test(t)) return "database"
  if (/\b(auth|login|password|session|token)\b/.test(t)) return "auth"
  if (/\b(config|setup|install|configure)\b/.test(t)) return "setup"
  
  return ""
}

function generateFallbackTitle(text: string, maxLength: number): string {
  const keywords = extractKeywords(text)
  
  // Debug logging handled by caller
  
  // For very short inputs, try to use the whole message as-is
  const cleanedText = text.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim()
  if (cleanedText.length <= maxLength && cleanedText.length > 3) {
    // Capitalize first letter of each word for title case
    const titleCased = cleanedText
      .split(" ")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ")
    return titleCased
  }
  
  if (keywords.length === 0) {
    return ""
  }
  
  // Join keywords in order (they're already in original word order)
  // Take enough keywords to fit in maxLength
  let title = ""
  for (const keyword of keywords) {
    const capitalized = keyword.charAt(0).toUpperCase() + keyword.slice(1)
    const potential = title ? `${title} ${capitalized}` : capitalized
    if (potential.length <= maxLength) {
      title = potential
    } else {
      break
    }
  }
  
  return sanitizeTitle(title, maxLength)
}

// The V2 title hook receives AI SDK messages with text parts.
function titleContext(messages: ReadonlyArray<{ role: string; content: ReadonlyArray<{ type: string; text?: string | null }> }>): { user: string; assistant: string } {
  const text = (role: "user" | "assistant") => messages
    .filter(message => message.role === role)
    .flatMap(message => message.content)
    .filter(part => part.type === "text")
    .map(part => part.text ?? "")
    .join(" ")
  return { user: text("user").slice(0, 300), assistant: text("assistant").slice(0, 400) }
}

function modelRef(value: string, provider: string): { providerID: string; id: string; variant?: string } {
  const variantStart = value.indexOf("#")
  const base = variantStart < 0 ? value : value.slice(0, variantStart)
  const separator = base.indexOf("/")
  const reference = separator < 0
    ? { providerID: provider, id: base }
    : { providerID: base.slice(0, separator), id: base.slice(separator + 1) }
  return variantStart < 0 ? reference : { ...reference, variant: value.slice(variantStart + 1) }
}

function automaticCandidate(model: { id: string; name: string; enabled?: boolean }): boolean {
  return model.enabled !== false && !/astra|fable|kimi[-_ ]?k3|qwen[-_ ]?max/i.test(`${model.id} ${model.name}`)
}

export {
  isTimestampTitle,
  hasPluginEmoji,
  shouldModifyTitle,
  sanitizeTitle,
  extractKeywords,
  inferIntent,
  generateFallbackTitle,
  findCheapestFromModels,
  loadConfig,
  titleContext,
  CHEAP_MODEL_PATTERNS,
}

export const AutoTitle = Plugin.define({
  id: "autotitle",
  async setup(ctx) {
    const config = loadConfig()
    if (config.disabled) return
    const log = createLogger(config.debug)
    const pending = new Map<string, Promise<string | undefined>>()
    const registration = await ctx.session.hook("title", async event => {
      if (event.result !== undefined) return
      const id = event.sessionID
      let task = pending.get(id)
      if (!task) {
        task = (async (): Promise<string | undefined> => {
          try {
            const session = await ctx.session.get({ sessionID: id })
            if (!shouldModifyTitle(session.title)) return session.title
            const { user, assistant } = titleContext(event.messages)
            if (!user) return undefined
            const fallback = generateFallbackTitle(user, Math.max(1, config.maxLength - 3))
            const fallbackTitle = fallback ? `${EMOJI_KEYWORD} ${fallback}` : undefined
            try {
              const available = (await ctx.model.list()).data
              const requested = config.model ? modelRef(config.model, config.provider ?? event.model.providerID) : null
              const eligible = available.filter(automaticCandidate)
              const candidates = config.provider
                ? eligible.filter(model => model.providerID === config.provider)
                : eligible
              const preferred = requested ?? (() => {
                for (const pattern of CHEAP_MODEL_PATTERNS) {
                  const match = candidates.find(model => pattern.test(model.id) || pattern.test(model.name))
                  if (match) return { providerID: match.providerID, id: match.id }
                }
                const fallbackModel = candidates.find(model => model.providerID === event.model.providerID && model.id === event.model.id) ?? candidates[0]
                if (!fallbackModel) throw new Error("No eligible automatic title model")
                return { providerID: fallbackModel.providerID, id: fallbackModel.id }
              })()
              const prompt = `Generate a concise, specific title (3-6 words, at most ${Math.max(1, config.maxLength - 2)} characters) for this conversation. Return only the title, without emoji, quotes or punctuation. Keep filenames and issue references.\nUser: ${user}\nAssistant: ${assistant}`
              const response = await ctx.generate.text({ model: preferred, prompt })
              const firstLine = response.text.split(/\r?\n/).find(line => line.trim()) ?? ""
              const generated = sanitizeTitle(firstLine, Math.max(1, config.maxLength - 2))
              const latest = await ctx.session.get({ sessionID: id })
              if (!shouldModifyTitle(latest.title)) return latest.title
              return generated ? `${EMOJI_AI} ${generated}` : fallbackTitle
            } catch {
              log.debug("AI title unavailable; using keyword fallback")
              const latest = await ctx.session.get({ sessionID: id })
              return shouldModifyTitle(latest.title) ? fallbackTitle : latest.title
            }
          } catch {
            log.error("Title hook failed")
            return undefined
          }
        })()
        pending.set(id, task)
      }
      try {
        event.result = await task
      } finally {
        if (pending.get(id) === task) pending.delete(id)
      }
    })
    return () => registration.dispose()
  },
})

export default AutoTitle
