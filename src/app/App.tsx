import { useState } from 'react';
import { AboutScreen } from '../features/about/AboutScreen';
import { HomeScreen } from '../features/home/HomeScreen';
import { PlayLocalScreen } from '../features/play/PlayLocalScreen';
import { ColourSelectScreen } from '../features/play-computer/ColourSelectScreen';
import { ComputerGameScreen } from '../features/play-computer/ComputerGameScreen';
import type { PlayerColour } from '../chess/chessTypes';
import type { EngineDifficulty } from '../engine/engineTypes';

type Route = 'home' | 'play-local' | 'play-computer-colour' | 'play-computer' | 'about';

export function App() {
  const [route, setRoute] = useState<Route>('home');
  // Only meaningful while route is 'play-computer' - set by the colour
  // selection screen right before advancing there.
  const [computerPlayerColour, setComputerPlayerColour] = useState<PlayerColour>('white');
  // Same lifetime as computerPlayerColour - captured together by the
  // colour-select screen (build spec phase 3A). Mirrors that screen's own
  // 'gentle' default so it's correct even before the route is reached.
  const [computerDifficulty, setComputerDifficulty] = useState<EngineDifficulty>('gentle');

  if (route === 'play-local') {
    return <PlayLocalScreen onExit={() => setRoute('home')} />;
  }

  if (route === 'play-computer-colour') {
    return (
      <ColourSelectScreen
        onBack={() => setRoute('home')}
        onSelect={(colour, difficulty) => {
          setComputerPlayerColour(colour);
          setComputerDifficulty(difficulty);
          setRoute('play-computer');
        }}
      />
    );
  }

  if (route === 'play-computer') {
    return (
      <ComputerGameScreen
        playerColour={computerPlayerColour}
        difficulty={computerDifficulty}
        onExit={() => setRoute('home')}
      />
    );
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
