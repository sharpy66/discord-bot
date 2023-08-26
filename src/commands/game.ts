import * as discord from 'discord.js';
import * as stringSimilarity from 'string-similarity';

import logger from '../logging';
import state from '../state';
import { IGameDBEntry, ICompatList } from '../models/interfaces';

const targetServer = process.env.COMPAT_DB_SOURCE;
const refreshTime = process.env.COMPAT_REFRESH_TIME ? parseInt(process.env.COMPAT_REFRESH_TIME) : 1000 * 60 * 20;
const iconBase = process.env.COMPAT_ICON_BASE;
const urlBase = process.env.COMPAT_URL_BASE;

const compatStrings: ICompatList = {
  0: { key: '0', name: 'Perfect', color: '#5c93ed', description: 'Game functions flawless with no audio or graphical glitches, all tested functionality works as intended without any workarounds needed.' },
  1: { key: '1', name: 'Great', color: '#47d35c', description: 'Game functions with minor graphical or audio glitches and is playable from start to finish. May require some workarounds.' },
  2: { key: '2', name: 'Okay', color: '#94b242', description: 'Game functions with major graphical or audio glitches, but game is playable from start to finish with workarounds.' },
  3: { key: '3', name: 'Bad', color: '#f2d624', description: 'Game functions, but with major graphical or audio glitches. Unable to progress in specific areas due to glitches even with workarounds.' },
  4: { key: '4', name: 'Intro/Menu', color: 'Red', description: 'Game is completely unplayable due to major graphical or audio glitches. Unable to progress past the Start Screen.' },
  5: { key: '5', name: "Won't Boot", color: '#828282', description: 'The game crashes when attempting to startup.' },
  99: { key: '99', name: 'Not Tested', color: 'DarkButNotBlack', description: 'The game has not yet been tested.' }
};

async function updateDatabase () {
  let body: IGameDBEntry[];
  if (!targetServer) {
    logger.error('Unable to download latest games list!');
    return;
  }

  try {
    const response = await fetch(targetServer);
    body = (await response.json()) as IGameDBEntry[];
  } catch (e) {
    logger.error('Unable to download latest games list!');
    throw e;
  }

  state.gameDB = body.map((x: IGameDBEntry) => {
    return {
      directory: x.directory,
      title: x.title,
      compatibility: x.compatibility
    };
  });

  state.lastGameDBUpdate = Date.now();
  logger.info(`Updated games list (${state.gameDB.length} games)`);

  state.gameDBPromise = null;
}

export async function command (message: discord.Message) {
  if (Date.now() - state.lastGameDBUpdate > refreshTime) {
    // Update remote list of games locally.
    const waitMessage = message.channel.send('This will take a second...');

    if (!state.gameDBPromise) {
      state.gameDBPromise = updateDatabase();
    }

    try {
      await state.gameDBPromise;
    } catch (e) {
      await message.channel.send('Game compatibility feed temporarily unavailable.');
      throw e;
    } finally {
      // We don't need this message anymore
      await waitMessage.then(async waitMessageResult => await waitMessageResult.delete());
    }
  }

  const game = message.content.substring(message.content.indexOf(' ') + 1);

  // Search all games. This is only linear time, so /shrug?
  let bestGame: IGameDBEntry | null = null;
  let bestScore = 0.5; // Game names must have at least a 50% similarity to be matched

  // for is faster than forEach
  for (let index = 0; index < state.gameDB.length; index++) {
    const testGame = state.gameDB[index];
    const newDistance = stringSimilarity.compareTwoStrings(game.toLowerCase(), testGame.title.toLowerCase());
    if (newDistance > bestScore) {
      bestGame = testGame;
      bestScore = newDistance;
    }
  }

  if (!bestGame) {
    await message.channel.send('Game could not be found.');
    return;
  }

  const screenshot = `${iconBase}${bestGame.directory}.png`;
  const url = `${urlBase}${bestGame.directory}/`;

  const compat = compatStrings[bestGame.compatibility];

  const embed = new discord.EmbedBuilder()
    .addFields({ name: 'Status', value: compat.name, inline: true })
    .setTitle(bestGame.title)
    .setColor(compat.color)
    .setDescription(compat.description)
    .setURL(url)
    .setThumbnail(screenshot);

  await message.channel.send({ embeds: [embed] });
}
