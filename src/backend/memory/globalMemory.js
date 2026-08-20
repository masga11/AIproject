import initSqlJs from 'sql.js'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '../../data')
const DB_PATH = path.join(DATA_DIR, 'debate_history.db')

export class GlobalMemoryManager {
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
        console.log('[GlobalMemory] Загружена БД из', this.dbPath)
      } else {
        this.db = new SQL.Database()
        console.log('[GlobalMemory] Создана новая БД')
      }
    } catch (err) {
      console.error('[GlobalMemory] Ошибка загрузки БД:', err)
      this.db = new SQL.Database()
    }

    // Таблица дебатов
    this.db.run(`
      CREATE TABLE IF NOT EXISTS debates (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        provider TEXT,
        model TEXT,
        rounds INTEGER,
        winner TEXT
      )
    `)

    // Таблица реплик агентов
    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        debate_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        agent_role TEXT NOT NULL,
        round INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (debate_id) REFERENCES debates(id)
      )
    `)

    // Таблица извлечённых фактов/знаний
    this.db.run(`
      CREATE TABLE IF NOT EXISTS knowledge_fragments (
        id TEXT PRIMARY KEY,
        debate_id TEXT NOT NULL,
        fragment_type TEXT NOT NULL,
        content TEXT NOT NULL,
        topic TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        relevance_score REAL DEFAULT 1.0,
        FOREIGN KEY (debate_id) REFERENCES debates(id)
      )
    `)

    // Таблица узлов графа аргументов
    this.db.run(`
      CREATE TABLE IF NOT EXISTS argument_nodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        debate_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        label TEXT NOT NULL,
        type TEXT NOT NULL,
        agent TEXT NOT NULL,
        round INTEGER NOT NULL,
        sentiment REAL DEFAULT 0,
        created_at INTEGER NOT NULL,
        UNIQUE(debate_id, node_id)
      )
    `)

    // Таблица связей графа аргументов
    this.db.run(`
      CREATE TABLE IF NOT EXISTS argument_edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        debate_id TEXT NOT NULL,
        from_node TEXT NOT NULL,
        to_node TEXT NOT NULL,
        type TEXT NOT NULL,
        weight REAL DEFAULT 1,
        created_at INTEGER NOT NULL,
        UNIQUE(debate_id, from_node, to_node)
      )
    `)

    // Индексы для поиска
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_messages_debate ON messages(debate_id)
    `)
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_topic ON knowledge_fragments(topic)
    `)
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_type ON knowledge_fragments(fragment_type)
    `)
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_arg_nodes_debate ON argument_nodes(debate_id)
    `)
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_arg_edges_debate ON argument_edges(debate_id)
    `)

    this.initialized = true
    console.log('[GlobalMemory] Инициализирована in-memory БД')
    return this.db
  }

  // Сохранение БД на диск
  save() {
    if (!this.db) return
    try {
      const data = this.db.export()
      const buffer = Buffer.from(data)
      fs.writeFileSync(this.dbPath, buffer)
      console.log('[GlobalMemory] БД сохранена в', this.dbPath)
    } catch (err) {
      console.error('[GlobalMemory] Ошибка сохранения БД:', err)
    }
  }

  // Сохранение дебата
  saveDebate(topic, provider, model, rounds, winner = null) {
    if (!this.db) throw new Error('GlobalMemory не инициализирована')

    const id = uuidv4()
    const createdAt = Date.now()

    this.db.run(
      `INSERT INTO debates (id, topic, created_at, provider, model, rounds, winner)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, topic, createdAt, provider, model, rounds, winner]
    )

    // Сохраняем на диск после каждого дебата
    this.save()

    return id
  }

  // Сохранение сообщения агента
  saveMessage(debateId, agentName, agentRole, round, content) {
    if (!this.db) throw new Error('GlobalMemory не инициализирована')

    const id = uuidv4()
    const createdAt = Date.now()

    this.db.run(
      `INSERT INTO messages (id, debate_id, agent_name, agent_role, round, content, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, debateId, agentName, agentRole, round, content, createdAt]
    )
    
    // Сохраняем на диск периодически (каждые 10 сообщений)
    const msgCount = this.db.exec('SELECT COUNT(*) FROM messages')[0]?.values?.[0]?.[0] || 0
    if (msgCount % 10 === 0) {
      this.save()
    }
  }

  // Обновление победителя
  updateWinner(debateId, winner) {
    if (!this.db) throw new Error('GlobalMemory не инициализирована')

    this.db.run(`UPDATE debates SET winner = ? WHERE id = ?`, [winner, debateId])
    this.save()
  }

  // Сохранение фрагмента знания
  saveKnowledgeFragment(debateId, fragmentType, content, topic, relevance = 1.0) {
    if (!this.db) throw new Error('GlobalMemory не инициализирована')

    const id = uuidv4()
    const createdAt = Date.now()

    this.db.run(
      `INSERT INTO knowledge_fragments (id, debate_id, fragment_type, content, topic, created_at, relevance_score)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, debateId, fragmentType, content, topic, createdAt, relevance]
    )
    
    // Знания сохраняем сразу - они важны
    this.save()
  }

  // Сохранение графа аргументов
  saveArgumentGraph(debateId, nodes, edges) {
    if (!this.db) throw new Error('GlobalMemory не инициализирована')

    const createdAt = Date.now()

    try {
      // Сохраняем узлы
      for (const node of nodes) {
        this.db.run(
          `INSERT OR REPLACE INTO argument_nodes 
           (debate_id, node_id, label, type, agent, round, sentiment, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [debateId, node.id, node.label, node.type, node.agent, node.round, node.sentiment || 0, createdAt]
        )
      }

      // Сохраняем связи
      for (const edge of edges) {
        this.db.run(
          `INSERT OR REPLACE INTO argument_edges 
           (debate_id, from_node, to_node, type, weight, created_at) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [debateId, edge.from, edge.to, edge.type, edge.weight, createdAt]
        )
      }

      console.log(`[GlobalMemory] Сохранено ${nodes.length} узлов и ${edges.length} связей графа`)
      this.save()
    } catch (err) {
      console.error('[GlobalMemory] Ошибка сохранения графа:', err.message)
    }
  }

  // Загрузка графа аргументов
  getArgumentGraph(debateId) {
    if (!this.db) return { nodes: [], edges: [] }

    try {
      const nodesResult = this.db.exec(
        'SELECT * FROM argument_nodes WHERE debate_id = ? ORDER BY round, node_id',
        [debateId]
      )

      const edgesResult = this.db.exec(
        'SELECT * FROM argument_edges WHERE debate_id = ? ORDER BY from_node',
        [debateId]
      )

      const nodes = nodesResult.length > 0 && nodesResult[0].values
        ? nodesResult[0].values.map(row => ({
            id: row[2], // node_id
            label: row[3],
            type: row[4],
            agent: row[5],
            round: row[6],
            sentiment: row[7],
          }))
        : []

      const edges = edgesResult.length > 0 && edgesResult[0].values
        ? edgesResult[0].values.map(row => ({
            from: row[2],
            to: row[3],
            type: row[4],
            weight: row[5],
          }))
        : []

      return { nodes, edges }
    } catch (err) {
      console.error('[GlobalMemory] Ошибка загрузки графа:', err.message)
      return { nodes: [], edges: [] }
    }
  }

  // Извлечение знаний из дебата (вызывается после судейского вердикта)
  async extractKnowledge(debateId, topic, judgeVerdict, knowledgeExtractor) {
    if (!this.db) return []

    // Получаем все сообщения дебата
    const messages = this.db.exec(`
      SELECT agent_name, agent_role, round, content 
      FROM messages 
      WHERE debate_id = ?
      ORDER BY round, agent_name
    `, [debateId])

    if (!messages.length || !messages[0].values) return []

    const transcript = messages[0].values
      .map(([agent, role, round, content]) => `[${agent} (${role}), Раунд ${round}]: ${content}`)
      .join('\n\n')

    // Просим LLM извлечь ключевые факты и аргументы
    const fragments = await knowledgeExtractor(topic, transcript, judgeVerdict)

    // Сохраняем фрагменты
    for (const fragment of fragments) {
      const id = uuidv4()
      this.db.run(
        `INSERT INTO knowledge_fragments (id, debate_id, fragment_type, content, topic, created_at, relevance_score)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, debateId, fragment.type, fragment.content, topic, Date.now(), fragment.relevance || 1.0]
      )
    }

    return fragments
  }

  // Поиск релевантного контекста по теме
  findRelevantContext(topic, limit = 5) {
    if (!this.db) return { debates: [], knowledge: [] }

    // Ищем похожие дебаты (простой поиск по вхождению слов)
    const topicWords = topic.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    
    let debateResults = []
    let knowledgeResults = []

    if (topicWords.length > 0) {
      // Поиск по темам дебатов
      const debateQuery = topicWords.map(() => '?').join(' OR ')
      const debateParams = topicWords.map(w => `%${w}%`)
      
      const debateRows = this.db.exec(`
        SELECT id, topic, created_at, rounds, winner
        FROM debates
        WHERE ${topicWords.map(() => `topic LIKE ?`).join(' OR ')}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `, debateParams)

      if (debateRows.length && debateRows[0].values) {
        debateResults = debateRows[0].values.map(([id, t, createdAt, rounds, winner]) => ({
          id, topic: t, createdAt, rounds, winner
        }))
      }

      // Поиск по знаниям
      const knowledgeQuery = topicWords.map(() => `topic LIKE ? OR content LIKE ?`).join(' OR ')
      const knowledgeParams = topicWords.flatMap(w => [`%${w}%`, `%${w}%`])
      
      const knowledgeRows = this.db.exec(`
        SELECT id, debate_id, fragment_type, content, topic, relevance_score
        FROM knowledge_fragments
        WHERE ${topicWords.map(() => `topic LIKE ? OR content LIKE ?`).join(' OR ')}
        ORDER BY relevance_score DESC, created_at DESC
        LIMIT ${limit * 2}
      `, knowledgeParams)

      if (knowledgeRows.length && knowledgeRows[0].values) {
        knowledgeResults = knowledgeRows[0].values.map(([id, debateId, type, content, kTopic, score]) => ({
          id, debateId, type, content, topic: kTopic, relevanceScore: score
        }))
      }
    }

    // Если не нашли по ключевым словам, берём последние дебаты
    if (debateResults.length === 0 && knowledgeResults.length === 0) {
      const recentDebates = this.db.exec(`
        SELECT id, topic, created_at, rounds, winner
        FROM debates
        ORDER BY created_at DESC
        LIMIT ${limit}
      `)

      if (recentDebates.length && recentDebates[0].values) {
        debateResults = recentDebates[0].values.map(([id, t, createdAt, rounds, winner]) => ({
          id, topic: t, createdAt, rounds, winner
        }))
      }
    }

    return { debates: debateResults, knowledge: knowledgeResults }
  }

  // Форматирование контекста для промпта
  formatContextForPrompt(topic) {
    const { debates, knowledge } = this.findRelevantContext(topic)
    
    let context = ''

    if (knowledge.length > 0) {
      context += '\n=== РЕЛЕВАНТНЫЕ ЗНАНИЯ ИЗ ПРОШЛЫХ ДЕБАТОВ ===\n'
      knowledge.forEach((k, i) => {
        context += `\n[${i + 1}] ${k.type.toUpperCase()}: ${k.content}\n`
        context += `   (из дебатов: "${k.topic}")\n`
      })
    }

    if (debates.length > 0) {
      context += '\n=== ПОХОЖИЕ ДЕБАТЫ ===\n'
      debates.slice(0, 3).forEach((d, i) => {
        const date = new Date(d.createdAt).toLocaleDateString('ru-RU')
        context += `\n[${i + 1}] "${d.topic}" (${date}, ${d.rounds} раундов)`
        if (d.winner) context += ` — Победитель: ${d.winner}`
        context += '\n'
      })
    }

    return context.trim()
  }

  // Статистика
  getStats() {
    if (!this.db) return { totalDebates: 0, totalMessages: 0, totalKnowledge: 0 }

    const debates = this.db.exec('SELECT COUNT(*) FROM debates')
    const messages = this.db.exec('SELECT COUNT(*) FROM messages')
    const knowledge = this.db.exec('SELECT COUNT(*) FROM knowledge_fragments')

    return {
      totalDebates: debates[0]?.values?.[0]?.[0] || 0,
      totalMessages: messages[0]?.values?.[0]?.[0] || 0,
      totalKnowledge: knowledge[0]?.values?.[0]?.[0] || 0
    }
  }

  // Очистка (для тестов)
  clear() {
    if (!this.db) return
    this.db.run('DELETE FROM knowledge_fragments')
    this.db.run('DELETE FROM messages')
    this.db.run('DELETE FROM debates')
    this.save()
  }
  
  // Получение турниров (дебаты с темой "Tournament: ...")
  getTournamentDebates(limit = 50) {
    if (!this.db) return []

    const rows = this.db.exec(`
      SELECT id, topic, created_at, provider, model, rounds, winner
      FROM debates
      WHERE topic LIKE 'Tournament: %'
      ORDER BY created_at DESC
      LIMIT ${limit}
    `)

    if (!rows.length || !rows[0].values) return []

    return rows[0].values.map(([id, topic, createdAt, provider, model, rounds, winner]) => ({
      id, topic: topic.replace(/^Tournament:\s*/, ''), createdAt, provider, model, rounds, winner
    }))
  }

  // Получение всех дебатов для истории
  getAllDebates(limit = 50) {
    if (!this.db) return []
    
    const rows = this.db.exec(`
      SELECT id, topic, created_at, provider, model, rounds, winner
      FROM debates
      ORDER BY created_at DESC
      LIMIT ${limit}
    `)
    
    if (!rows.length || !rows[0].values) return []
    
    return rows[0].values.map(([id, topic, createdAt, provider, model, rounds, winner]) => ({
      id, topic, createdAt, provider, model, rounds, winner
    }))
  }
  
  // Получение полного дебата с сообщениями
  getDebateWithMessages(debateId) {
    if (!this.db) return null
    
    const debateRows = this.db.exec(`
      SELECT id, topic, created_at, provider, model, rounds, winner
      FROM debates
      WHERE id = ?
    `, [debateId])
    
    if (!debateRows.length || !debateRows[0].values) return null
    
    const [id, topic, createdAt, provider, model, rounds, winner] = debateRows[0].values[0]
    
    const messageRows = this.db.exec(`
      SELECT agent_name, agent_role, round, content, created_at
      FROM messages
      WHERE debate_id = ?
      ORDER BY round, created_at
    `, [debateId])
    
    const messages = messageRows.length && messageRows[0].values 
      ? messageRows[0].values.map(([agentName, agentRole, round, content, msgCreatedAt]) => ({
          agentName, agentRole, round, content, createdAt: msgCreatedAt
        }))
      : []
    
    return {
      id, topic, createdAt, provider, model, rounds, winner, messages
    }
  }
  
  // Расширенная аналитика
  getAnalytics() {
    if (!this.db) return { 
      totalDebates: 0, 
      totalMessages: 0, 
      totalKnowledge: 0,
      totalArgumentNodes: 0,
      totalArgumentEdges: 0,
      winRate: {},
      agentParticipation: {},
      avgRounds: 0,
      debatesByProvider: {},
      recentActivity: [],
      argumentStats: {}
    }

    // Базовая статистика
    const debates = this.db.exec('SELECT COUNT(*) FROM debates')
    const messages = this.db.exec('SELECT COUNT(*) FROM messages')
    const knowledge = this.db.exec('SELECT COUNT(*) FROM knowledge_fragments')
    const argNodes = this.db.exec('SELECT COUNT(*) FROM argument_nodes')
    const argEdges = this.db.exec('SELECT COUNT(*) FROM argument_edges')

    // Win rate по агентам
    const winRateRows = this.db.exec(`
      SELECT winner, COUNT(*) as wins
      FROM debates
      WHERE winner IS NOT NULL
      GROUP BY winner
    `)
    const winRate = {}
    if (winRateRows.length && winRateRows[0].values) {
      for (const [winner, wins] of winRateRows[0].values) {
        winRate[winner] = wins
      }
    }

    // Участие агентов в дебатах
    const participationRows = this.db.exec(`
      SELECT agent_name, COUNT(DISTINCT debate_id) as debates, COUNT(*) as messages
      FROM messages
      GROUP BY agent_name
      ORDER BY messages DESC
    `)
    const agentParticipation = {}
    if (participationRows.length && participationRows[0].values) {
      for (const [name, debates, msgs] of participationRows[0].values) {
        agentParticipation[name] = { debates, messages: msgs }
      }
    }

    // Среднее количество раундов
    const avgRoundsRows = this.db.exec('SELECT AVG(rounds) FROM debates')
    const avgRounds = avgRoundsRows[0]?.values?.[0]?.[0] || 0

    // Дебаты по провайдерам
    const providerRows = this.db.exec(`
      SELECT provider, COUNT(*) as count
      FROM debates
      WHERE provider IS NOT NULL
      GROUP BY provider
    `)
    const debatesByProvider = {}
    if (providerRows.length && providerRows[0].values) {
      for (const [provider, count] of providerRows[0].values) {
        debatesByProvider[provider] = count
      }
    }

    // Статистика аргументов по типам
    const argTypeRows = this.db.exec(`
      SELECT type, COUNT(*) as count
      FROM argument_nodes
      GROUP BY type
    `)
    const argumentStats = { byType: {}, byAgent: {}, avgSentiment: 0 }
    if (argTypeRows.length && argTypeRows[0].values) {
      for (const [type, count] of argTypeRows[0].values) {
        argumentStats.byType[type] = count
      }
    }

    // Аргументы по агентам
    const argAgentRows = this.db.exec(`
      SELECT agent, COUNT(*) as count
      FROM argument_nodes
      GROUP BY agent
    `)
    if (argAgentRows.length && argAgentRows[0].values) {
      for (const [agent, count] of argAgentRows[0].values) {
        argumentStats.byAgent[agent] = count
      }
    }

    // Средний сентимент
    const sentimentRows = this.db.exec('SELECT AVG(sentiment) FROM argument_nodes')
    argumentStats.avgSentiment = sentimentRows[0]?.values?.[0]?.[0] || 0

    // Недавняя активность
    const recentRows = this.db.exec(`
      SELECT id, topic, created_at, winner
      FROM debates
      ORDER BY created_at DESC
      LIMIT 10
    `)
    const recentActivity = []
    if (recentRows.length && recentRows[0].values) {
      for (const [id, topic, createdAt, winner] of recentRows[0].values) {
        recentActivity.push({ id, topic, createdAt, winner })
      }
    }

    return {
      totalDebates: debates[0]?.values?.[0]?.[0] || 0,
      totalMessages: messages[0]?.values?.[0]?.[0] || 0,
      totalKnowledge: knowledge[0]?.values?.[0]?.[0] || 0,
      totalArgumentNodes: argNodes[0]?.values?.[0]?.[0] || 0,
      totalArgumentEdges: argEdges[0]?.values?.[0]?.[0] || 0,
      winRate,
      agentParticipation,
      avgRounds,
      debatesByProvider,
      recentActivity,
      argumentStats,
    }
  }

  // Получение графа аргументов для конкретного дебата (публичный метод)
  getDebateArgumentGraph(debateId) {
    return this.getArgumentGraph(debateId)
  }
}

// Singleton
export const globalMemory = new GlobalMemoryManager()
