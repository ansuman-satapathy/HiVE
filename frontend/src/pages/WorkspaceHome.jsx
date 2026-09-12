import { Link } from 'react-router-dom'
import { UploadCloud, MessageSquare, Terminal, Cpu, ArrowUpRight, FileText } from 'lucide-react'

export default function WorkspaceHome() {
  return (
    <div style={{ maxWidth: '1140px', width: '100%', margin: '0 auto', padding: '48px 24px' }}>
      {/* Hero Welcome */}
      <div style={{ marginBottom: '40px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--primary-subtle)', border: '1px solid var(--primary-border)', color: 'var(--primary)', fontSize: '12px', fontWeight: 600, marginBottom: '16px' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--primary)' }}></span>
          DOCAGENT RUNTIME v0.2.0
        </div>
        <h1 style={{ fontSize: '32px', fontWeight: 700, letterSpacing: '-0.5px', marginBottom: '10px' }}>
          Document Intelligence & Agent Runtime
        </h1>
        <p style={{ fontSize: '16px', color: 'var(--text-secondary)', maxWidth: '680px', lineHeight: 1.6 }}>
          A unified workspace for deep document parsing, hybrid retrieval (dense + BM25 + reranking), autonomous ReAct agent loops, and isolated Python code execution.
        </p>
      </div>

      {/* Feature Pillar Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
        <div className="card" style={{ padding: '28px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--primary-subtle)',
              border: '1px solid var(--primary-border)',
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px'
            }}>
              <UploadCloud size={22} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
              Universal Ingestion & Chunker
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '20px' }}>
              Upload PDFs, Markdown, and TXT files. Structural semantic chunking preserving headers, sections, and breadcrumb metadata.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="badge badge-success">Live: Ticket 04-07</span>
            <Link
              to="/workspace/documents"
              className="btn btn-secondary btn-sm"
              style={{ gap: '6px', fontSize: '12px' }}
            >
              <span>Open Document Hub</span>
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>

        <div className="card" style={{ padding: '28px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--success-bg)',
              border: '1px solid var(--success-border)',
              color: 'var(--success)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px'
            }}>
              <MessageSquare size={22} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
              Hybrid Search & Agent Reasoning
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '20px' }}>
              Dual BM25 + Dense vector retrieval with Reciprocal Rank Fusion, Cross-Encoder reranking, and live thought stream timelines.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="badge badge-mono">Phase 2-4</span>
          </div>
        </div>

        <div className="card" style={{ padding: '28px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--warning-bg)',
              border: '1px solid var(--warning-border)',
              color: 'var(--warning)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px'
            }}>
              <Terminal size={22} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
              Code Sandboxing & MCP Tools
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '20px' }}>
              Zero-hallucination quantitative calculations on structured tabular files, plus standard Model Context Protocol tool discovery.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="badge badge-mono">Phase 5-6</span>
          </div>
        </div>
      </div>
    </div>
  )
}
