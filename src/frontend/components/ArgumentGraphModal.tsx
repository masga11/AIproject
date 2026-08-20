import { useEffect, useRef } from 'react'
import { Network } from 'vis-network/standalone'
import type { ArgumentGraphData } from '../types'

interface ArgumentGraphModalProps {
  graphData: ArgumentGraphData
  onClose: () => void
}

export function ArgumentGraphModal({ graphData, onClose }: ArgumentGraphModalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const networkRef = useRef<Network | null>(null)

  useEffect(() => {
    if (!containerRef.current || !graphData?.graph) return

    const { nodes, edges } = graphData.graph

    const data = {
      nodes: new (window as any).vis.DataSet(nodes),
      edges: new (window as any).vis.DataSet(edges),
    }

    const options = {
      nodes: {
        shape: 'box',
        margin: 10,
        font: {
          size: 12,
          color: '#ffffff',
          multi: 'html',
        },
        shadow: true,
      },
      edges: {
        width: 2,
        arrows: 'to',
        smooth: {
          type: 'continuous',
        },
        shadow: true,
      },
      physics: {
        stabilization: {
          iterations: 100,
        },
        barnesHut: {
          gravitationalConstant: -3000,
          centralGravity: 0.3,
          springLength: 95,
          springConstant: 0.04,
          damping: 0.09,
        },
      },
      interaction: {
        navigationButtons: true,
        keyboard: true,
        hover: true,
        tooltipDelay: 200,
      },
    }

    networkRef.current = new Network(containerRef.current, data, options)

    networkRef.current.on('doubleClick', () => {
      networkRef.current?.fit({ animation: { duration: 300 } })
    })

    return () => {
      networkRef.current?.destroy()
      networkRef.current = null
    }
  }, [graphData])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '1200px', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🔗 Граф аргументов</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="graph-stats" style={{ 
          display: 'flex', 
          gap: '20px', 
          marginBottom: '15px',
          padding: '10px',
          background: 'var(--bg-secondary)',
          borderRadius: '8px'
        }}>
          <div>
            <strong>Узлов:</strong> {graphData.stats?.totalNodes || 0}
          </div>
          <div>
            <strong>Связей:</strong> {graphData.stats?.totalEdges || 0}
          </div>
          <div>
            <strong>Средний сентимент:</strong> {(graphData.stats?.avgSentiment || 0).toFixed(2)}
          </div>
          {graphData.stats?.byType && Object.entries(graphData.stats.byType).map(([type, count]) => (
            <div key={type}>
              <strong>{type}:</strong> {count as number}
            </div>
          ))}
        </div>

        <div 
          ref={containerRef} 
          style={{ 
            width: '100%', 
            height: '600px',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            background: 'var(--bg-primary)'
          }} 
        />
        
        <div className="legend" style={{ 
          marginTop: '15px', 
          display: 'flex', 
          gap: '15px',
          flexWrap: 'wrap',
          fontSize: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '16px', height: '16px', background: '#4CAF50', borderRadius: '3px' }} />
            Утверждение (claim)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '16px', height: '16px', background: '#F44336', borderRadius: '3px' }} />
            Контраргумент
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '16px', height: '16px', background: '#2196F3', borderRadius: '3px' }} />
            Доказательство
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '16px', height: '16px', background: '#FF9800', borderRadius: '3px' }} />
            Вопрос
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '16px', height: '16px', background: '#9C27B0', borderRadius: '3px' }} />
            Вывод
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '20px', height: '3px', background: '#4CAF50' }} />
            Поддерживает
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '20px', height: '3px', background: '#F44336' }} />
            Атакует
          </div>
        </div>

        <div className="modal-footer" style={{ marginTop: '15px', textAlign: 'right' }}>
          <button className="primary" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  )
}
