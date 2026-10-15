import Phaser from 'phaser';
import '@fontsource/press-start-2p';
import { GameScene } from './scenes/Game.js';
import { BootScene, CharSelectScene, MenuScene, ShopScene } from './scenes/Menus.js';
import { ChestScene, GameOverScene, LevelUpScene, PauseScene } from './scenes/Overlays.js';
import { UIScene } from './scenes/UI.js';

function start() {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: 1280,
    height: 720,
    backgroundColor: '#07040b',
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [BootScene, MenuScene, CharSelectScene, ShopScene, GameScene, UIScene, LevelUpScene, ChestScene, PauseScene, GameOverScene],
  });
  window.__game = game; // handy for debugging in the console
}

// Text objects need the pixel font loaded before they render.
document.fonts.load('16px "Press Start 2P"').finally(start);
