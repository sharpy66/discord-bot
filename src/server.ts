import * as discord from 'discord.js';

import logger from './logging';
import state from './state';
import * as data from './data';
import { IModule, ITrigger } from './models/interfaces';
import modules from './commands/_';
import triggers from './triggers/_';

// Check for environmental variables.
import * as checkenv from 'checkenv';
import envConfig from '../env.json';

checkenv.setConfig(envConfig);
checkenv.check();

interface IModuleMap {
  [name: string]: IModule;
}

const cachedModules: IModuleMap = modules;
const cachedTriggers: ITrigger[] = triggers;
const client = new discord.Client({ intents: discord.GatewayIntentBits.GuildMembers | discord.GatewayIntentBits.Guilds | discord.GatewayIntentBits.GuildBans | discord.GatewayIntentBits.GuildMessages | discord.GatewayIntentBits.DirectMessages | discord.GatewayIntentBits.MessageContent });
const rulesTrigger = process.env.DISCORD_RULES_TRIGGER;
const rulesRole = process.env.DISCORD_RULES_ROLE;
const mediaUsers = new Map();

logger.info('Application startup. Configuring environment.');
if (!rulesTrigger) {
  throw new Error('DISCORD_RULES_TRIGGER somehow became undefined.');
}
if (!rulesRole) {
  throw new Error('DISCORD_RULES_ROLE somehow became undefined.');
}

function findArray (haystack: string | string[], arr: string[]) {
  return arr.some((v: string) => haystack.indexOf(v) >= 0);
}

function IsIgnoredCategory (categoryName: string) {
  const IgnoredCategory = ['internal', 'team', 'development'];
  return IgnoredCategory.includes(categoryName);
}

client.on('ready', async () => {
  // Initialize app channels.
  if (!process.env.DISCORD_LOG_CHANNEL || !process.env.DISCORD_MSGLOG_CHANNEL) {
    throw new Error('DISCORD_LOG_CHANNEL or DISCORD_MSGLOG_CHANNEL not defined.');
  }
  const logChannel = await client.channels.fetch(process.env.DISCORD_LOG_CHANNEL) as discord.TextChannel;
  const msglogChannel = await client.channels.fetch(process.env.DISCORD_MSGLOG_CHANNEL) as discord.TextChannel;
  if (!logChannel.send) throw new Error('DISCORD_LOG_CHANNEL is not a text channel!');
  if (!msglogChannel.send) throw new Error('DISCORD_MSGLOG_CHANNEL is not a text channel!');
  state.logChannel = logChannel;
  state.msglogChannel = msglogChannel;

  logger.info('Bot is now online and connected to server.');
});

client.on('error', (x) => {
  logger.error(x);
  logger.error('Restarting process.');
  process.exit(1);
});
client.on('warn', (x) => {
  logger.warn(x);
});

client.on('disconnect', () => {
  logger.warn('Disconnected from Discord server.');
});

client.on('guildMemberAdd', async (member) => {
  if (process.env.DISCORD_RULES_ROLE) { await member.roles.add(process.env.DISCORD_RULES_ROLE); }
});

client.on('messageDelete', async (message) => {
  const AllowedRoles = ['Administrators', 'Moderators', 'Team', 'Developer', 'Support', 'VIP'];
  const authorRoles = message.member?.roles?.cache?.map(x => x.name);
  if (!authorRoles) {
    logger.error(`Unable to get the roles for ${message.author}`);
    return;
  }
  if (!findArray(authorRoles, AllowedRoles)) {
    const parent = (message.channel as discord.TextChannel).parent;
    if (parent && !IsIgnoredCategory(parent.name)) {
      if (((message.content && !message.content.startsWith('.')) || (message.attachments.size > 0)) && message.author?.bot === false) {
        const messageAttachment = message.attachments.first()?.proxyURL;

        const deletionEmbed = new discord.EmbedBuilder()
          .setAuthor({ name: message.author?.tag, iconURL: message.author?.displayAvatarURL() })
          .setDescription(`Message deleted in ${message.channel.toString()}`)
          .addFields({ name: 'Content', value: message.cleanContent || '<no content>', inline: false })
          .setTimestamp()
          .setColor('Red');

        if (messageAttachment) deletionEmbed.setImage(messageAttachment);

        const userInfo = `${message.author?.toString()} (${message.author?.username}) (${message.author})`;

        await state.msglogChannel?.send({ content: userInfo, embeds: [deletionEmbed] });
        logger.info(`${message.author?.username} ${message.author} deleted message: ${message.cleanContent}.`);
      }
    }
  }
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
  const AllowedRoles = ['Administrators', 'Moderators', 'Team', 'Developer', 'Support', 'VIP'];
  const authorRoles = oldMessage.member?.roles?.cache?.map(x => x.name);
  if (!authorRoles) {
    logger.error(`Unable to get the roles for ${oldMessage.author}`);
    return;
  }
  if (!findArray(authorRoles, AllowedRoles)) {
    const parent = (oldMessage.channel as discord.TextChannel).parent;
    if (parent && !IsIgnoredCategory(parent.name)) {
      const oldM = oldMessage.cleanContent || '<no content>';
      const newM = newMessage.cleanContent;
      if (oldMessage.content !== newMessage.content && newM) {
        const messageAttachment = oldMessage.attachments.first()?.proxyURL;

        const editedEmbed = new discord.EmbedBuilder()
          .setAuthor({ name: oldMessage.author?.tag || '<unknown>', iconURL: oldMessage.author?.displayAvatarURL() })
          .setDescription(`Message edited in ${oldMessage.channel.toString()} [Jump To Message](${newMessage.url})`)
          .addFields({ name: 'Before', value: oldM, inline: false }, { name: 'After', value: newM, inline: false })
          .setTimestamp()
          .setColor('Green');

        if (messageAttachment) editedEmbed.setImage(messageAttachment);

        const userInfo = `${oldMessage.author?.toString()} (${oldMessage.author?.username}) (${oldMessage.author})`;

        await state.msglogChannel?.send({ content: userInfo, embeds: [editedEmbed] });
        logger.info(`${oldMessage.author?.username} ${oldMessage.author} edited message from: ${oldM} to: ${newM}.`);
      }
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot && !message.content.startsWith('.ban')) { return; }

  if (message.guild == null && state.responses.pmReply) {
    // We want to reply to PM attempts.
    await message.reply(state.responses.pmReply);
    return;
  }

  logger.verbose(`${message.author.username} ${message.author} [Channel: ${(message.channel as discord.TextChannel).name} ${message.channel}]: ${message.content}`);

  const authorRoles = message.member?.roles?.cache?.map(x => x.name);

  if (message.channel.id === process.env.DISCORD_MEDIA_CHANNEL && !message.author.bot) {
    const AllowedMediaRoles = ['Administrators', 'Moderators', 'Team', 'VIP'];
    if (!authorRoles) {
      logger.error(`Unable to get the roles for ${message.author}`);
      return;
    }
    if (!findArray(authorRoles, AllowedMediaRoles)) {
      const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{2,256}\.[a-z]{2,4}\b([-a-zA-Z0-9@:%_+.~#?&/=]*)/gi;
      if (message.attachments.size > 0 || message.content.match(urlRegex)) {
        mediaUsers.set(message.author.id, true);
      } else if (mediaUsers.get(message.author.id)) {
        mediaUsers.set(message.author.id, false);
      } else {
        await message.delete();
        mediaUsers.set(message.author.id, false);
      }
    }
  }

  // Check if the channel is #rules, if so we want to follow a different logic flow.
  if (message.channel.id === process.env.DISCORD_RULES_CHANNEL) {
    if (message.content.toLowerCase().includes(rulesTrigger)) {
      // We want to remove the 'Unauthorized' role from them once they agree to the rules.
      logger.verbose(`${message.author.username} ${message.author} has accepted the rules, removing role ${process.env.DISCORD_RULES_ROLE}.`);
      await message.member?.roles.remove(rulesRole, 'Accepted the rules.');
    }

    // Delete the message in the channel to force a cleanup.
    await message.delete();
  } else if (message.content.startsWith('.') && !message.content.startsWith('..')) {
    // We want to make sure it's an actual command, not someone '...'-ing.
    const cmd = message.content.split(' ', 1)[0].slice(1);

    // Check by the name of the command.
    const cachedModule = cachedModules[`${cmd.toLowerCase()}`];
    let quoteResponse: { reply: string; } | null = null;
    // Check by the quotes in the configuration.
    if (!cachedModule) quoteResponse = state.responses.quotes[cmd];
    if (!cachedModule && !quoteResponse) return; // Not a valid command.

    // Check access permissions.
    if (!authorRoles) {
      logger.error(`Unable to get the roles for ${message.author}`);
      return;
    }
    if (cachedModule && cachedModule.roles && !findArray(authorRoles, cachedModule.roles)) {
      await state.logChannel?.send(`${message.author.toString()} attempted to use admin command: ${message.content}`);
      logger.info(`${message.author.username} ${message.author} attempted to use admin command: ${message.content}`);
      return;
    }

    logger.info(`${message.author.username} ${message.author} [Channel: ${message.channel}] executed command: ${message.content}`);
    const executeModule = async () => {
      try {
        if (cachedModule) {
          await cachedModule.command(message);
        } else if (cachedModules.quote && quoteResponse) {
          await cachedModules.quote.command(message, quoteResponse.reply);
        }
      } catch (err) { logger.error(err); }
    };
    const commandUsageEmbed = new discord.EmbedBuilder()
      .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
      .setDescription(`Command used in ${message.channel.toString()} [Jump To Message](${message.url})`)
      .addFields({ name: 'Command', value: `\`\`\`\n${message.content}\n\`\`\``, inline: false })
      .setTimestamp()
      .setColor('Blue');
    const userInfo = `\`${message.author?.toString()}\` (${message.author?.username})`;
    await Promise.all(
      [
        state.msglogChannel?.send({ content: userInfo, embeds: [commandUsageEmbed] }),
        message.delete(),
        executeModule()
      ]
    );
  } else if (!message.author.bot) {
    // This is a normal channel message.
    await Promise.all(
      cachedTriggers.map(async function (trigger) {
        if (!trigger.roles || (authorRoles && findArray(authorRoles, trigger.roles))) {
          if (trigger.trigger(message)) {
            logger.debug(`${message.author.username} ${message.author} [Channel: ${message.channel}] triggered: ${message.content}`);
            try {
              await trigger.execute(message);
            } catch (err) { logger.error(err); }
          }
        }
      })
    );
  }
});

data.readWarnings();
data.readBans();

// Load custom responses
if (process.env.DATA_CUSTOM_RESPONSES) {
  data.readCustomResponses();
}

client.login(process.env.DISCORD_LOGIN_TOKEN).catch(err => logger.error(err));
logger.info('Startup completed. Established connection to Discord.');
