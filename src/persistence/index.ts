import { BrowserSaveStorage } from './browserGameSave';
import { GameSave } from './GameSave';

export const gameSave = new GameSave(new BrowserSaveStorage());
