import { useState, type FormEvent } from 'react';
import { useGameStore } from '../store/gameStore';

export default function GameList() {
  const games = useGameStore((s) => s.games);
  const scripts = useGameStore((s) => s.scripts);
  const loading = useGameStore((s) => s.loading);
  const openGame = useGameStore((s) => s.openGame);
  const createGame = useGameStore((s) => s.createGame);
  const deleteGame = useGameStore((s) => s.deleteGame);

  const [name, setName] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [scriptId, setScriptId] = useState('trouble-brewing');

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await createGame(name.trim(), date, scriptId);
    setName('');
    setScriptId('trouble-brewing');
  }

  function scriptName(id: string | null) {
    return id ? scripts.find((s) => s.id === id)?.name ?? null : null;
  }

  return (
    <>
      <div className="card">
        <h1>Games</h1>
        <form onSubmit={handleCreate} className="row wrap" style={{ marginTop: 10 }}>
          <select value={scriptId} onChange={(e) => setScriptId(e.target.value)}>
            {scripts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Game name" />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button type="submit" disabled={!name.trim() || !scriptId}>New</button>
        </form>
      </div>

      <div className="card">
        {loading && games.length === 0 ? (
          <p className="muted">Loading…</p>
        ) : games.length === 0 ? (
          <p className="muted">No games yet. Create one above.</p>
        ) : (
          <div className="list">
            {games.map((g) => {
              const sName = scriptName(g.scriptId);
              return (
                <div key={g.id} className="row" style={{ padding: 10, background: 'var(--surface-2)', borderRadius: 8 }}>
                  <button className="secondary" style={{ flex: 1, textAlign: 'left' }} onClick={() => void openGame(g.id)}>
                    <strong>{g.name}</strong>
                    <div className="muted">
                      {sName ? `${sName} · ` : ''}
                      {g.date || 'No date'}
                    </div>
                  </button>
                  {g.status === 'finished' && g.winner ? (
                    <span className={`tag ${g.winner === 'Good' ? 'good' : 'evil'}`}>{g.winner}</span>
                  ) : (
                    <span className="tag">active</span>
                  )}
                  <button className="danger" onClick={() => void deleteGame(g.id)} aria-label={`Delete ${g.name}`}>
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
