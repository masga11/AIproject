import initSqlJs from 'sql.js'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '../../data')
const DB_PATH = path.join(DATA_DIR, 'custom_agents.db')

export class CustomAgentManager {
  constructor() {
    this.db = null
    this.initialized = false
    this.dbPath = DB_PATH
  }

  async init() {
    if (this.initialized) return this.db

    // Создаём директорию если не существует
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }

    const SQL = await initSqlJs()
    
    // Загружаем существующую БД или создаём новую
    try {
      if (fs.existsSync(this.dbPath)) {
        const buffer = fs.readFileSync(this.dbPath)
        this.db = new SQL.Database(buffer)
        console.log('[CustomAgents] Загружена БД из', this.dbPath)
      } else {
        this.db = new SQL.Database()
        console.log('[CustomAgents] Создана новая БД')
      }
    } catch (err) {
      console.error('[CustomAgents] Ошибка загрузки БД:', err)
      this.db = new SQL.Database()
    }

    // Таблица пользовательских агентов
    this.db.run(`
      CREATE TABLE IF NOT EXISTS custom_agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        color TEXT DEFAULT '#8b5cf6',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_active INTEGER DEFAULT 1
      )
    `)

    // Индекс для быстрого поиска
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_custom_agents_active ON custom_agents(is_active)
    `)

    this.initialized = true
    console.log('[CustomAgents] Инициализирована in-memory БД')
    return this.db
  }

  // Сохранение БД на диск
  save() {
    if (!this.db) return
    try {
      const data = this.db.export()
      const buffer = Buffer.from(data)
      fs.writeFileSync(this.dbPath, buffer)
      console.log('[CustomAgents] БД сохранена в', this.dbPath)
    } catch (err) {
      console.error('[CustomAgents] Ошибка сохранения БД:', err)
    }
  }

  // Создание нового агента
  createAgent(name, role, systemPrompt, color = '#8b5cf6') {
    if (!this.db) throw new Error('CustomAgentManager не инициализирован')

    const id = uuidv4()
    const now = Date.now()

    this.db.run(
      `INSERT INTO custom_agents (id, name, role, system_prompt, color, created_at, updated_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [id, name.trim(), role.trim(), systemPrompt.trim(), color, now, now]
    )

    this.save()
    return this.getAgentById(id)
  }

  // Обновление существующего агента
  updateAgent(id, name, role, systemPrompt, color) {
    if (!this.db) throw new Error('CustomAgentManager не инициализирован')

    const now = Date.now()
    
    this.db.run(
      `UPDATE custom_agents 
       SET name = ?, role = ?, system_prompt = ?, color = ?, updated_at = ?
       WHERE id = ?`,
      [name.trim(), role.trim(), systemPrompt.trim(), color, now, id]
    )

    this.save()
    return this.getAgentById(id)
  }

  // Удаление агента (мягкое удаление через is_active)
  deleteAgent(id) {
    if (!this.db) throw new Error('CustomAgentManager не инициализирован')

    this.db.run(
      `UPDATE custom_agents SET is_active = 0 WHERE id = ?`,
      [id]
    )

    this.save()
  }

  // Полное удаление агента
  hardDeleteAgent(id) {
    if (!this.db) throw new Error('CustomAgentManager не инициализирован')

    this.db.run(`DELETE FROM custom_agents WHERE id = ?`, [id])
    this.save()
  }

  // Получение агента по ID
  getAgentById(id) {
    if (!this.db) return null

    const rows = this.db.exec(
      `SELECT id, name, role, system_prompt, color, created_at, updated_at, is_active
       FROM custom_agents
       WHERE id = ?`,
      [id]
    )

    if (!rows.length || !rows[0].values || !rows[0].values[0]) return null

    const [agentId, name, role, systemPrompt, color, createdAt, updatedAt, isActive] = rows[0].values[0]
    
    return {
      id: agentId,
      name,
      role,
      systemPrompt,
      color,
      createdAt,
      updatedAt,
      isActive: Boolean(isActive),
      isCustom: true
    }
  }

  // Получение всех активных пользовательских агентов
  getAllActiveAgents() {
    if (!this.db) return []

    const rows = this.db.exec(`
      SELECT id, name, role, system_prompt, color, created_at, updated_at, is_active
      FROM custom_agents
      WHERE is_active = 1
      ORDER BY created_at DESC
    `)

    if (!rows.length || !rows[0].values) return []

    return rows[0].values.map(([id, name, role, systemPrompt, color, createdAt, updatedAt, isActive]) => ({
      id,
      name,
      role,
      systemPrompt,
      color,
      createdAt,
      updatedAt,
      isActive: Boolean(isActive),
      isCustom: true
    }))
  }

  // Получение всех агентов (включая неактивные)
  getAllAgents() {
    if (!this.db) return []

    const rows = this.db.exec(`
      SELECT id, name, role, system_prompt, color, created_at, updated_at, is_active
      FROM custom_agents
      ORDER BY created_at DESC
    `)

    if (!rows.length || !rows[0].values) return []

    return rows[0].values.map(([id, name, role, systemPrompt, color, createdAt, updatedAt, isActive]) => ({
      id,
      name,
      role,
      systemPrompt,
      color,
      createdAt,
      updatedAt,
      isActive: Boolean(isActive),
      isCustom: true
    }))
  }

  // Проверка существования агента по имени
  agentExistsByName(name) {
    if (!this.db) return false

    const rows = this.db.exec(
      `SELECT COUNT(*) FROM custom_agents WHERE name = ? AND is_active = 1`,
      [name.trim()]
    )

    return rows.length && rows[0].values && rows[0].values[0][0] > 0
  }

  // Статистика
  getStats() {
    if (!this.db) return { totalAgents: 0, activeAgents: 0 }

    const total = this.db.exec('SELECT COUNT(*) FROM custom_agents')
    const active = this.db.exec('SELECT COUNT(*) FROM custom_agents WHERE is_active = 1')

    return {
      totalAgents: total[0]?.values?.[0]?.[0] || 0,
      activeAgents: active[0]?.values?.[0]?.[0] || 0
    }
  }

  // Очистка всех данных (для тестов)
  clear() {
    if (!this.db) return
    this.db.run('DELETE FROM custom_agents')
    this.save()
  }
}

// Singleton
export const customAgentManager = new CustomAgentManager()
