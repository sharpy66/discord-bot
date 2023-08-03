import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, Interaction, Message, MessageActionRow, MessageButton, MessageEmbed } from 'discord.js';
import { search as fakeapi } from 'gsmarena-api';

// Variables you might want to change:
// allowed roles
export const roles = ["@everyone"];
// how long before previous messages can no longer be interacted with. default is 200000 (200 seconds)
const mtime = 200000


// button config
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

// function to create embed with current device information
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

// actual command logic starts here
export async function command (message: Message) {
	  try {
	// reset index and button state
	let index = 0
	previous.setDisabled(true);
	next.setDisabled(false);
	// split message into array
	const words = message.content.split(' ');  
	
	// remove the command and pass the rest of the message along to the gsmarena-api
	const searchQuery = words.slice(1).join(' ');
    const devices = await fakeapi.search(searchQuery);
	
    if (devices.length === 0) {
        message.channel.send('No device(s) found for "'+searchQuery+'"');
        return;
    }
	
	// create the initial embed with the first device information and reset button state
	const embed = createEmbed(devices[index], searchQuery, devices.length, index, devices);
	
	const sentMessage = await message.channel.send({embeds: [embed], components: [row] });
	
	// prevent another end listener from being added everytime a button is pushed
	// ran when the input collector times out, as set above
	let endListenerAdded = false; 
	const endListener = () => {
		previous.setDisabled(true);
		next.setDisabled(true);
		sentMessage.edit({ components: [row] });
		collector.removeListener('end', endListener); // Remove the listener
	};

	
    // create the interaction collector -- runs when a button is pressed
    const filter = (interaction: Interaction) => interaction.isButton() && (interaction.customId === 'next' || interaction.customId === 'previous');
    const collector = sentMessage.createMessageComponentCollector({ filter, time: mtime }); 
																							
	// update everything when cycling pages
	collector.on('collect', async (interaction: Interaction) => {
		try {
			if (interaction.customId === 'next') {
				index++;
			} else if (interaction.customId === 'previous') {
				index--;
			}
			index = Math.max(0, Math.min(index, devices.length - 1));
			
			// update button states
			previous.setDisabled(index === 0);
			next.setDisabled(index === devices.length - 1);
			
			// create a new embed with the updated device information
			const newEmbed = createEmbed(devices[index], searchQuery, devices.length, index, devices);
			
			// update the message with the new embed and components
			await interaction.update({ embeds: [newEmbed], components: [row] });
			// deal with end listener
			        if (!endListenerAdded) {
            collector.on('end', endListener);
            endListenerAdded = true; 
        }
		} catch (error) {
			console.error(error);
		}
	});

	// error handling
  } catch (error) {
	console.error('Error:', error);
    message.channel.send('An error occurred while processing your request. It would appear whatever you just did broke the bot... Congratulations!');
  }
}