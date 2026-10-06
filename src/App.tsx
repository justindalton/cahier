import { useEffect, useState } from 'react';
import { useGameStore } from './store/gameStore';
import GameList from './components/GameList';
import ActiveGame from './components/ActiveGame';
import CharacterSearch from './components/CharacterSearch';

export default function App() {
  const activeGameId = useGameStore((s) => s.activeGameId);
  const loadGames = useGameStore((s) => s.loadGames);
  const loadCharacters = useGameStore((s) => s.loadCharacters);
  const loadScripts = useGameStore((s) => s.loadScripts);

  const [view, setView] = useState<'games' | 'characters'>('games');

  useEffect(() => {
    void loadGames();
    void loadCharacters();
    void loadScripts();
  }, [loadGames, loadCharacters, loadScripts]);

  if (activeGameId) {
    return (
      <div className="app">
        <ActiveGame />
      </div>
    );
  }

  return (
    <div className="app">
      <nav className="row">
        <button className={view === 'games' ? '' : 'secondary'} onClick={() => setView('games')}>
          Games
        </button>
        <button className={view === 'characters' ? '' : 'secondary'} onClick={() => setView('characters')}>
          Characters
        </button>
      </nav>
      {view === 'games' ? <GameList /> : <CharacterSearch />}
    </div>
  );
}
