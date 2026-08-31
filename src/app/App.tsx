import { useState } from 'react';
import { AboutScreen } from '../features/about/AboutScreen';
import { HomeScreen } from '../features/home/HomeScreen';
import { PlayLocalScreen } from '../features/play/PlayLocalScreen';
import { ColourSelectScreen } from '../features/play-computer/ColourSelectScreen';
import { ComputerGameScreen } from '../features/play-computer/ComputerGameScreen';
import type { PlayerColour } from '../chess/chessTypes';

type Route = 'home' | 'play-local' | 'play-computer-colour' | 'play-computer' | 'about';

export function App() {
  const [route, setRoute] = useState<Route>('home');
  // Only meaningful while route is 'play-computer' - set by the colour
  // selection screen right before advancing there.
  const [computerPlayerColour, setComputerPlayerColour] = useState<PlayerColour>('white');

  if (route === 'play-local') {
    return <PlayLocalScreen onExit={() => setRoute('home')} />;
  }

  if (route === 'play-computer-colour') {
    return (
      <ColourSelectScreen
        onBack={() => setRoute('home')}
        onSelect={(colour) => {
          setComputerPlayerColour(colour);
          setRoute('play-computer');
        }}
      />
    );
  }

  if (route === 'play-computer') {
    return <ComputerGameScreen playerColour={computerPlayerColour} onExit={() => setRoute('home')} />;
  }

  if (route === 'about') {
    return <AboutScreen onExit={() => setRoute('home')} />;
  }

  return (
    <HomeScreen
      onPlayLocal={() => setRoute('play-local')}
      onPlayComputer={() => setRoute('play-computer-colour')}
      onAbout={() => setRoute('about')}
    />
  );
}
