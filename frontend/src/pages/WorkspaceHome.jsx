import { Files, UploadCloud, MessageSquare, Terminal, Sparkles } from 'lucide-react'

export default function WorkspaceHome() {
  return (
    <div style={{ maxWidth: '1100px', width: '100%', margin: '0 auto', padding: '40px 20px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
          Document Intelligence Workspace
        </h1>
        <p style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>
          Autonomous RAG runtime with hybrid retrieval, code sandboxing, and MCP agent tool execution.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        <div className="card glass" style={{ padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: 'rgba(37, 99, 235, 0.1)', color: 'var(--primary)' }}>
              <UploadCloud size={22} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Knowledge Base & Ingestion</h3>
          </div>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Upload PDFs, Markdown, text, and structured tables with semantic chunking and chunk inspector.
          </p>
        </div>

        <div className="card glass" style={{ padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
              <MessageSquare size={22} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Autonomous Agent Chat</h3>
          </div>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Conversational RAG with real-time reasoning timeline, token-level citation grounding, and corrective reflection.
          </p>
        </div>

        <div className="card glass" style={{ padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
              <Terminal size={22} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Sandboxed Code & MCP</h3>
          </div>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Deterministic Python data calculations over uploaded tables, plus dynamic Model Context Protocol tools.
          </p>
        </div>
      </div>
    </div>
  )
}
