import { useState } from 'react';
import { AboutScreen } from '../features/about/AboutScreen';
import { HomeScreen } from '../features/home/HomeScreen';
import { PlayLocalScreen } from '../features/play/PlayLocalScreen';

type Route = 'home' | 'play-local' | 'about';

export function App() {
  const [route, setRoute] = useState<Route>('home');

  if (route === 'play-local') {
    return <PlayLocalScreen onExit={() => setRoute('home')} />;
  }

  if (route === 'about') {
    return <AboutScreen onExit={() => setRoute('home')} />;
  }

  return (
    <HomeScreen onPlayLocal={() => setRoute('play-local')} onAbout={() => setRoute('about')} />
  );
}
