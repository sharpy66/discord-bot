import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, Interaction, Message, MessageActionRow, MessageButton, MessageEmbed, sentMessage } from 'discord.js';
import { search as fakeapi } from 'gsmarena-api';

// Variables you might want to change:
// Allowed roles:
export const roles = ["@everyone"];
// How long before previous messages can no longer be interacted with. default is 200000 (200 seconds)
const mtime = 200000


// Button config:
const next = new ButtonBuilder()
    .setCustomId('next')
    .setLabel('Next Result >')
    .setStyle(ButtonStyle.Primary);

const previous = new ButtonBuilder()
    .setCustomId('previous')
    .setLabel('< Previous Result')
    .setStyle(ButtonStyle.Secondary);

const row = new ActionRowBuilder()
    .addComponents(previous, next);

// Create embed with current device information.
function createEmbed(device: any, searchQuery: string, results: number, index: number, devices: array) {
    let name = device.name;
    let chipset = device.description.match(/(?:display,)(.*)(?:chipset)/)?.[1].trim() || 'Unknown'; // parsing json data
    let ram = device.description.match(/(?:\s)([\d]+)\sGB RAM/)?.[1] + 'GB' || 'Unknown';
    let storage = device.description.match(/(?:\s)([\d]+)\sGB storage/)?.[1] + 'GB' || 'Unknown';
    let display = device.description.match(/(?:Features)(.*)(?:display,)/)?.[1].trim() || 'Unknown';
    let battery = device.description.match(/(?:chipset,)(.*)(?:battery)/)?.[1].trim() || 'Unknown';
    let date = device.description.match(/(?:Announced)(.*)(?:Features)/)?.[1].trim() || 'Unknown';
    let misc = 'Announced in '+date+' '+display+' display, '+battery+' battery.';

	// Change 1024GB to 1TB
	if (storage === '1024GB') {
	  storage = '1TB';
	} else {
	  storage = storage
	}


    const imageUrl = device?.img;
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`Search results for: ${searchQuery}`)
        .setDescription('Source: https://www.gsmarena.com')
        .addFields(
            { name: 'Device:', value: name },
            { name: 'Chipset:', value: chipset },
            { name: 'Ram:', value: ram, inline: true },
            { name: 'Storage:', value: storage, inline: true },
            { name: 'Misc:', value: misc },
        )
        .setThumbnail(imageUrl)
        .setFooter({ text: results+' total results... '+(index + 1)+'/'+devices.length });

    return embed;
}

// End listener function to disable buttons and prevent multiple end listeners
// from being applied to a single message collector.
function addEndListener(collector, previous, next, row, sentMessage) {
	let endListenerAdded = false;
	
		// Function to be called when the collector ends to disable buttons and update message.
		const endListener = async () => {
		previous.setDisabled(true);
		next.setDisabled(true);
		await sentMessage.edit({ components: [row] }).catch(console.error);
		collector.stop();
	};
	
	// Add the end listener only if it hasn't already been added.
	// I don't think this is needed since I reworked the endlistener, 
	// but i'll keep it just in case, better to have an extra 5 lines of code than a memory leak.
	if (!endListenerAdded) {
		collector.on('end', endListener);
		endListenerAdded = true;
	}
}


// This runs every time the bot responds to a command.
export async function command(message: Message) {
    try {
        // Reset index and button state.
        let index = 0;
        previous.setDisabled(true);
        next.setDisabled(false);
        // Split message into array.
        const words = message.content.split(' ');

        // Remove the command and pass the rest of the message along to the gsmarena-api.
        const searchQuery = words.slice(1).join(' ');
        const devices = await fakeapi.search(searchQuery);

        if (devices.length === 0) {
            message.channel.send('No device(s) found for "' + searchQuery + '"');
            return;
        }

        // Create the initial embed with the first device information and reset button state.
        const embed = createEmbed(devices[index], searchQuery, devices.length, index, devices);
        const sentMessage = await message.channel.send({ embeds: [embed], components: [row] });

        // Create the interaction collector -- handles button presses.
        const filter = (interaction: Interaction) => interaction.isButton() && (interaction.customId === 'next' || interaction.customId === 'previous');
        const collector = sentMessage.createMessageComponentCollector({ filter, time: mtime });
		addEndListener(collector, previous, next, row, sentMessage);

		
        // Logic to update the message and components when cycling through pages.
        collector.on('collect', async (interaction: Interaction) => {
            try {
                if (interaction.customId === 'next') {
                    index++;
                } else if (interaction.customId === 'previous') {
                    index--;
                }
                index = Math.max(0, Math.min(index, devices.length - 1));

                // Update button states based on current index.
                previous.setDisabled(index === 0);
                next.setDisabled(index === devices.length - 1);

                // Create a new embed with the updated device information.
                const newEmbed = createEmbed(devices[index], searchQuery, devices.length, index, devices);

                // Update the message with the new embed and components.
                await interaction.deferUpdate();
				await interaction.editReply({ embeds: [newEmbed], components: [row] });
				

            } catch (error) {
                console.error('Collect Error:', error);
                await interaction.followUp('An error occurred while processing the button click.')
            } finally {
                previous.setDisabled();
                next.setDisabled();
            }
        });
    } catch (error) {
        console.error('Command Error:', error);
        message.channel.send('An error occurred while processing your request. It would appear whatever you just did broke the bot... Congratulations!');
    }
}
