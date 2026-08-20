// Анализ аргументов и построение графа связей
import { globalMemory } from './memory/globalMemory.js'

export class ArgumentGraphBuilder {
  constructor() {
    this.nodes = []
    this.edges = []
    this.nodeIndex = new Map()
  }

  // Добавление узла (аргумента/тезиса)
  addNode(id, label, type, agent, round, sentiment = 0) {
    if (!this.nodeIndex.has(id)) {
      const node = {
        id,
        label,
        type, // 'claim', 'counterargument', 'evidence', 'question', 'conclusion'
        agent,
        round,
        sentiment, // -1 (негатив) до 1 (позитив)
        group: agent,
      }
      this.nodes.push(node)
      this.nodeIndex.set(id, node)
    }
    return this.nodeIndex.get(id)
  }

  // Добавление связи между аргументами
  addEdge(source, target, type, weight = 1) {
    const edge = {
      from: source,
      to: target,
      type, // 'supports', 'attacks', 'questions', 'references'
      weight,
      arrows: 'to',
    }
    this.edges.push(edge)
    return edge
  }

  // Парсинг ответа агента для выделения аргументов
  async extractArguments(client, model, text, agent, round, topic) {
    const prompt = `Проанализируй текст выступления в дебатах. Выдели ключевые утверждения и их типы.

Тема: "${topic}"
Агент: ${agent}
Раунд: ${round}

Текст:
${text}

Верни JSON массив объектов:
[
  {"type": "claim|counterargument|evidence|question|conclusion", "text": "краткая формулировка", "sentiment": 0.5},
  ...
]

Типы:
- claim: основное утверждение позиции
- counterargument: опровержение аргумента оппонента
- evidence: факт, статистика, пример
- question: вопрос оппоненту
- conclusion: вывод/резюме

sentiment: от -1 (негатив к оппоненту) до 1 (позитив к своей позиции)

Отвечай ТОЛЬКО JSON массивом.`

    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: 'Ты JSON API. Отвечай только валидным JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 800,
      })

      const jsonMatch = response.choices?.[0]?.message?.content?.match(/\[[\s\S]*\]/)
      const jsonStr = jsonMatch ? jsonMatch[0] : '[]'
      return JSON.parse(jsonStr)
    } catch (err) {
      console.error('[ArgumentGraph] Ошибка извлечения аргументов:', err.message)
      return []
    }
  }

  // Построение графа из транскрипта дебатов
  async buildFromDebate(client, model, debateData, topic) {
    this.nodes = []
    this.edges = []
    this.nodeIndex = new Map()

    const messages = debateData.messages || []
    
    for (const msg of messages) {
      const agent = msg.agent
      const round = msg.round
      const text = msg.text || msg.content
      
      // Извлекаем аргументы из текста
      const arguments_ = await this.extractArguments(client, model, text, agent, round, topic)
      
      let prevNodeId = null
      
      for (let i = 0; i < arguments_.length; i++) {
        const arg = arguments_[i]
        const nodeId = `${agent}-r${round}-a${i}`
        
        this.addNode(nodeId, arg.text, arg.type, agent, round, arg.sentiment)
        
        // Связываем аргументы внутри одного выступления
        if (prevNodeId) {
          this.addEdge(prevNodeId, nodeId, 'continues', 0.5)
        }
        prevNodeId = nodeId
        
        // Ищем связанные аргументы из предыдущих раундов
        if (arg.type === 'counterargument' && round > 1) {
          const relatedNodes = this.findRelatedNodes(agent, round - 1)
          for (const related of relatedNodes) {
            if (related.agent !== agent) {
              this.addEdge(nodeId, related.id, 'attacks', 1)
            }
          }
        }
        
        if (arg.type === 'evidence' && prevNodeId) {
          this.addEdge(nodeId, prevNodeId, 'supports', 0.8)
        }
        
        if (arg.type === 'question') {
          // Вопрос будет связан с ответом в следующем раунде
          this.addNode(nodeId, arg.text, 'question', agent, round, 0)
        }
      }
    }

    return { nodes: this.nodes, edges: this.edges }
  }

  // Поиск связанных узлов для атаки/поддержки
  findRelatedNodes(targetAgent, maxRound) {
    const related = []
    for (const node of this.nodes) {
      if (node.round <= maxRound && node.type === 'claim' && node.agent !== targetAgent) {
        related.push(node)
      }
    }
    return related.slice(0, 5) // Ограничиваем количество связей
  }

  // Экспорт графа для vis-network
  exportForVis() {
    const colorMap = {
      claim: '#4CAF50',
      counterargument: '#F44336',
      evidence: '#2196F3',
      question: '#FF9800',
      conclusion: '#9C27B0',
    }

    const visNodes = this.nodes.map(node => ({
      id: node.id,
      label: node.label.length > 50 ? node.label.substring(0, 50) + '...' : node.label,
      title: `${node.agent} (Раунд ${node.round})\n${node.label}`,
      color: colorMap[node.type] || '#9E9E9E',
      shape: 'box',
      font: { size: 12, color: '#ffffff' },
      margin: 10,
      shadow: true,
    }))

    const visEdges = this.edges.map(edge => ({
      from: edge.from,
      to: edge.to,
      arrows: edge.arrows,
      color: edge.type === 'attacks' ? '#F44336' : edge.type === 'supports' ? '#4CAF50' : '#9E9E9E',
      dashes: edge.type === 'questions',
      width: edge.weight * 2,
      title: edge.type,
    }))

    return { nodes: visNodes, edges: visEdges }
  }

  // Статистика графа
  getStats() {
    const stats = {
      totalNodes: this.nodes.length,
      totalEdges: this.edges.length,
      byType: {},
      byAgent: {},
      avgSentiment: 0,
    }

    for (const node of this.nodes) {
      stats.byType[node.type] = (stats.byType[node.type] || 0) + 1
      stats.byAgent[node.agent] = (stats.byAgent[node.agent] || 0) + 1
    }

    if (this.nodes.length > 0) {
      stats.avgSentiment = this.nodes.reduce((sum, n) => sum + (n.sentiment || 0), 0) / this.nodes.length
    }

    return stats
  }
}

// Экспорт для сохранения в память
export async function saveArgumentGraph(debateId, graphData) {
  await globalMemory.init()
  const db = globalMemory.db
  
  try {
    // Сохраняем узлы
    for (const node of graphData.nodes) {
      db.run(
        `INSERT OR REPLACE INTO argument_nodes 
         (debate_id, node_id, label, type, agent, round, sentiment) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [debateId, node.id, node.label, node.type, node.agent, node.round, node.sentiment || 0]
      )
    }

    // Сохраняем связи
    for (const edge of graphData.edges) {
      db.run(
        `INSERT OR REPLACE INTO argument_edges 
         (debate_id, from_node, to_node, type, weight) 
         VALUES (?, ?, ?, ?, ?)`,
        [debateId, edge.from, edge.to, edge.type, edge.weight]
      )
    }

    console.log(`[ArgumentGraph] Сохранено ${graphData.nodes.length} узлов и ${graphData.edges.length} связей`)
  } catch (err) {
    console.error('[ArgumentGraph] Ошибка сохранения:', err.message)
  }
}

// Импорт графа из памяти
export function loadArgumentGraph(debateId) {
  const db = globalMemory.db
  
  const nodes = db.allSync(
    'SELECT * FROM argument_nodes WHERE debate_id = ?',
    [debateId]
  )

  const edges = db.allSync(
    'SELECT * FROM argument_edges WHERE debate_id = ?',
    [debateId]
  )

  return { nodes, edges }
}
