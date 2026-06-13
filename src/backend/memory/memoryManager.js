export class MemoryManager {
  constructor(limit = 30) {
    this.limit = limit
    this.entries = []
  }

  add(entry) {
    this.entries.push({ ...entry, timestamp: Date.now() })

    if (this.entries.length > this.limit) {
      this.entries.shift()
    }
  }

  recall() {
    return this.entries
  }

  toHistory() {
    return this.entries.map((entry) => ({
      role: 'user',
      content: `[${entry.agent} (${entry.role})]: ${entry.text}`,
    }))
  }

  clear() {
    this.entries = []
  }
}
