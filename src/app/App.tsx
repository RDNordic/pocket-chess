import { useState } from 'react';
import { HomeScreen } from '../features/home/HomeScreen';
import { PlayLocalScreen } from '../features/play/PlayLocalScreen';

type Route = 'home' | 'play-local';

export function App() {
  const [route, setRoute] = useState<Route>('home');

  if (route === 'play-local') {
    return <PlayLocalScreen onExit={() => setRoute('home')} />;
  }

  return <HomeScreen onPlayLocal={() => setRoute('play-local')} />;
}
