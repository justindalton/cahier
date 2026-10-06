import { useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import type { CharacterType } from '../db/types';

const TYPES: (CharacterType | 'All')[] = ['All', 'Townsfolk', 'Outsider', 'Minion', 'Demon', 'Traveller'];

const TYPE_SECTIONS: { label: string; type: CharacterType }[] = [
  { label: 'Townsfolk', type: 'Townsfolk' },
  { label: 'Outsiders', type: 'Outsider' },
  { label: 'Minions', type: 'Minion' },
  { label: 'Demons', type: 'Demon' },
  { label: 'Travellers', type: 'Traveller' },
];

export default function CharacterSearch() {
  const characters = useGameStore((s) => s.characters);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<CharacterType | 'All'>('All');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return characters.filter((c) => {
      if (type !== 'All' && c.type !== type) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.abilityText ?? '').toLowerCase().includes(q)
      );
    });
  }, [characters, search, type]);

  return (
    <div className="card">
      <h1>Characters</h1>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search name or ability…"
        style={{ marginTop: 10 }}
      />
      <div className="row wrap" style={{ marginTop: 8 }}>
        {TYPES.map((t) => (
          <button key={t} className={type === t ? '' : 'secondary'} onClick={() => setType(t)} style={{ padding: '6px 10px', fontSize: 13 }}>
            {t}
          </button>
        ))}
      </div>

      <p className="muted" style={{ marginTop: 10 }}>
        {filtered.length} characters
      </p>

      <div>
        {TYPE_SECTIONS.map(({ label, type: sectionType }) => {
          // When a specific type filter is active, only show that section
          if (type !== 'All' && type !== sectionType) return null;

          const sectionChars = filtered.filter((c) => c.type === sectionType);
          if (sectionChars.length === 0) return null;

          return (
            <div key={sectionType} className="char-section">
              <h3 className="char-section-title">{label}</h3>
              <div className="char-grid">
                {sectionChars.map((c) => (
                  <div key={c.id} className="char-card" title={c.abilityText ?? undefined}>
                    {c.imageUrl ? (
                      <img src={c.imageUrl} alt={c.name} loading="lazy" />
                    ) : (
                      <div style={{ width: 64, height: 64, borderRadius: 8, background: 'var(--surface)', margin: '0 auto 6px' }} />
                    )}
                    <div className="char-name">{c.name}</div>
                    {c.abilityText && <div className="char-ability">{c.abilityText}</div>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
