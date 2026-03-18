export default function Home() {
  return (
    <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'Inter, system-ui, sans-serif', background: '#0a0a0f', color: '#ffffff' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 700, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Cortex Hub
        </h1>
        <p style={{ color: '#888', marginTop: '0.5rem' }}>
          The Neural Intelligence Platform
        </p>
      </div>
    </main>
  )
}
