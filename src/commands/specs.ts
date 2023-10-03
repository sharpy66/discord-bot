import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Client,
    EmbedBuilder,
    Interaction,
    Message,
    MessageActionRow,
    MessageButton,
    MessageEmbed,
    sentMessage
} from 'discord.js';

import {
    search as fakeapi_search,
    catalog as fakeapi_detail
} from 'gsmarena-api';

import logger from '../logging';


// Variables you might want to change:

// Allowed roles:

export const roles = ["@everyone"];

// How long before previous messages can no longer be interacted with:

const mtime = 200000 // default 200000 (200 seconds)



// Button config:

const next = new ButtonBuilder()

    .setCustomId('next')

    .setLabel('Next Result >')

    .setStyle(ButtonStyle.Primary);



const previous = new ButtonBuilder()

    .setCustomId('previous')

    .setLabel('< Previous Result')

    .setStyle(ButtonStyle.Secondary);


const select = new ButtonBuilder()

    .setCustomId('select')

    .setLabel('Select')

    .setStyle(ButtonStyle.Success);




const row = new ActionRowBuilder()

    .addComponents(previous, select, next);



// Create detailed embed with selected device information.

async function createDetailedEmbed(selectedDevice: any, searchQuery: string, results: number, index: number, searchResults: array) {

    let device = await fakeapi_detail.getDevice(selectedDevice.id);



    let name = device.name; // very messy and long code for parsing data

    let platformChipset = device.detailSpec.find(spec => spec.category === 'Platform')?.specifications.find(spec => spec.name === 'Chipset')?.value || 'Unknown';

    let platformGPU = device.detailSpec.find(spec => spec.category === 'Platform')?.specifications.find(spec => spec.name === 'GPU')?.value || 'Unknown';

    let memoryInternal = device.detailSpec.find(spec => spec.category === 'Memory')?.specifications.find(spec => spec.name === 'Internal')?.value || 'Unknown';

    let display = device.quickSpec.find(spec => spec.name === 'Display size')?.value || 'Unknown';

    let battery = device.quickSpec.find(spec => spec.name === 'Battery size')?.value || 'Unknown';

    let year = device.detailSpec.find(spec => spec.category === 'Launch')?.specifications.find(spec => spec.name === 'Announced')?.value.split(',')[0] || 'Unknown';

    let misc = 'Announced in ' + year + ' ' + display + ' display, ' + battery + ' battery.';



    // format storage and ram nicely

    let storage = [...new Set(memoryInternal.match(/\d+(GB|TB)(?= \d+GB RAM)/g))].join('/') || 'Unknown ';

    let ram = "Unknown "

    if (memoryInternal) { // prevent an error when attempting to get detailed info on devices with no information on GSMArena

        let matches = memoryInternal.match(/\d+GB RAM/g);

        if (matches) {

            ram = [...new Set(matches.map(x => x.replace(' RAM', '')))].join('/');

        }

    }

    // Messsy json parsing continues with a touch of formatting the cpu and gpu info nicely

    let snapdragon = platformChipset.includes('Snapdragon') ? 'Snapdragon ' + platformChipset.split('Snapdragon')[1].split('(')[0].trim() : undefined;

    let exynos = platformChipset.includes('Exynos') ? 'Exynos ' + platformChipset.split('Exynos')[1].split(' ')[1] : undefined;

    let dimensity = platformChipset.includes('Dimensity') ? 'Dimensity ' + platformChipset.split('Dimensity')[1].split(' ')[1] : undefined;

    let formattedChipset = [snapdragon, exynos, dimensity].filter(word => word !== undefined).join(' / ');

    if (formattedChipset === '') { // prevent errors when formattedChipset is null | fall back to basic info

        formattedChipset = device.quickSpec.find(spec => spec.name === 'Chipset')?.value || 'Unknown';

    }



    let adreno = platformGPU.includes('Adreno') ? 'Adreno ' + platformGPU.split('Adreno')[1].split(' ')[1] : undefined;

    let xclipse = platformGPU.includes('Xclipse') ? 'Xclipse ' + platformGPU.split('Xclipse')[1].split(' ')[1] : undefined;

    let mali = platformGPU.includes('Mali') ? 'Mali-' + platformGPU.split('Mali-')[1].split(' ').slice(0, 2).join(' ') : undefined;

    let formattedGPU = [adreno, xclipse, mali].filter(word => word !== undefined).join(' / ');

    if (formattedGPU === '') {

        formattedGPU = platformGPU

    }



    const imageUrl = device.img;

    let embed = new EmbedBuilder() // Assemble Embed

        .setColor('#0099ff')

        .setTitle(`Result for: ${searchQuery}`)

        .setDescription('Source: https://www.gsmarena.com')

        .addFields(

            {
                name: 'Device:',
                value: name
            },

            {
                name: 'Chipset:',
                value: formattedChipset
            },

            {
                name: 'GPU',
                value: formattedGPU
            },

            {
                name: 'Ram:',
                value: ram,
                inline: true
            },

            {
                name: 'Storage:',
                value: storage,
                inline: true
            },

            {
                name: 'Misc:',
                value: misc
            },

        )

        .setThumbnail(imageUrl)

        .setFooter({
            text: searchResults.length > 1 ? "Showing Detailed Result...." : "This is the only result for your query."
        });



    return embed;

}



// Create embed with current device information.

function createEmbed(device: any, searchQuery: string, results: number, index: number, searchResults: array) {



    let name = device.name;

    let chipset = device.description.match(/(?:display,)(.*)(?:chipset)/)?.[1].trim() || 'Unknown'; // parsing json data

    let ram = device.description.match(/(?:\s)([\d]+)\sGB RAM/)?.[1] + 'GB' || 'Unknown';

    let storage = device.description.match(/(?:\s)([\d]+)\sGB storage/)?.[1] + 'GB' || 'Unknown';

    let display = device.description.match(/(?:Features)(.*)(?:display,)/)?.[1].trim() || 'Unknown';

    let battery = device.description.match(/(?:chipset,)(.*)(?:battery)/)?.[1].trim() || 'Unknown';

    let date = device.description.match(/(?:Announced)(.*)(?:Features)/)?.[1].trim() || 'Unknown';

    let misc = 'Announced in ' + date + ' ' + display + ' display, ' + battery + ' battery.';



    // Change 1024GB to 1TB

    if (storage === '1024GB') {

        storage = '1TB';

    } else {

        storage = storage

    }




    const imageUrl = device?.img;

    let embed = new EmbedBuilder()

        .setColor('#0099ff')

        .setTitle(searchResults.length > 1 ? `Preview results for: ${searchQuery}` : `Result for: ${searchQuery}`)

        .setDescription('Source: https://www.gsmarena.com')

        .addFields(

            {
                name: 'Device:',
                value: name
            },

            {
                name: 'Chipset:',
                value: chipset
            },

            {
                name: 'Ram:',
                value: ram,
                inline: true
            },

            {
                name: 'Storage:',
                value: storage,
                inline: true
            },

            {
                name: 'Misc:',
                value: misc
            },

        )

        .setThumbnail(imageUrl)

        .setFooter({
			text: searchResults.length > 1
			  ? `${results} total results... ${index + 1}/${searchResults.length}`
			  
			  : "This is the only result for your query (:"
        });



    return embed;

}



// End listener function to disable buttons after message collector times out

function addEndListener(collector, previous, next, row, sentMessage, searchResults) {

    let endListenerAdded = false;



    // Function to be called when the collector ends to disable buttons and update message.

    const endListener = async () => {

        previous.setDisabled(true);

        next.setDisabled(true);

        select.setDisabled(true);



        // Update footer text on timeout only if there were multiple results.

        if (searchResults.length > 1) {

            const newEmbed = new EmbedBuilder(sentMessage.embeds[0])

                .setFooter({
                    text: "Interaction timeout: Buttons disabled."
                });

            await sentMessage.edit({
                components: [row]
            }).catch(console.error);

            await sentMessage.edit({
                embeds: [newEmbed]
            });

        }

        collector.stop();

    };



    // Add the end listener only if it hasn't already been added.

    if (!endListenerAdded) {

        collector.on('end', endListener);

        endListenerAdded = true;

    }

}




// This runs every time the bot responds to a command.

export async function command(message: Message) {
	
	// Check if the message contains the @ sign | Prevent the command from being used to ping people
	if (message.content.includes('@')) {
	
        message.content = message.content.replace(/@/g, '@\u200B'); // add an invis character between @ and username to prevent the bot from pinging them
		
		await message.channel.send(`**Please don't attempt to ping people with this command.**\n\n**${message.author.username}** ran: "**${message.content}**" Try again without an @ in your query`);
 
        return;
    }
	
	
    try {

        // Reset index and button state.

        let index = 0;

        previous.setDisabled(true);

        select.setDisabled(false);

        next.setDisabled(false);

        // Split message into array.

        const words = message.content.split(' ');



        // Remove the command and pass the rest of the message along to the gsmarena-api.

        const searchQuery = words.slice(1).join(' ');

        const searchResults = await fakeapi_search.search(searchQuery);



        if (searchResults.length === 0) {

			message.channel.send(`No device(s) found for "${searchQuery}"`);

            return;

        }



        // Create the initial embed with the first device information and reset button state.

        const embed = createEmbed(searchResults[index], searchQuery, searchResults.length, index, searchResults);

        // Only send buttons if there are multiple results

        let sentMessage;

        if (searchResults.length > 1) {

            sentMessage = await message.channel.send({
                embeds: [embed],
                components: [row]
            });

        } else {

            let detailedEmbed = await createDetailedEmbed(searchResults[index], searchQuery, searchResults.length, index, searchResults);

            sentMessage = await message.channel.send({
                embeds: [detailedEmbed]
            });

        }



        // Create the interaction collector -- handles button presses.

        const filter = (interaction: Interaction) => interaction.isButton() && (interaction.customId === 'next' || interaction.customId === 'previous' || interaction.customId === 'select');

        const collector = sentMessage.createMessageComponentCollector({
            filter,
            time: mtime
        });

        addEndListener(collector, previous, next, row, sentMessage, searchResults);



        // Logic to update the message and components when cycling through pages.

        collector.on('collect', async (interaction: Interaction) => {

            if (interaction.user.id !== message.author.id) { // Only allow the original command user to interact with the buttons.

                // Send an ephemeral reply to the user

                await interaction.reply({
                    content: 'Only the original sender of the command can interact with buttons.',
                    ephemeral: true
                });

                return;

            }

            let selectButtonPushed = false;

            try {

                if (interaction.customId === 'next') {

                    index++;

                } else if (interaction.customId === 'previous') {

                    index--;

                } else if (interaction.customId == 'select') {

                    const detailedEmbed = await createDetailedEmbed(searchResults[index], searchQuery, searchResults.length, index, searchResults);

                    await interaction.deferUpdate();

                    await interaction.editReply({
                        embeds: [detailedEmbed],
                        components: []
                    });

                    selectButtonPushed = true;

                }

                index = Math.max(0, Math.min(index, searchResults.length - 1));



                // Update button states based on current index.

                previous.setDisabled(index === 0);

                next.setDisabled(index === searchResults.length - 1);



                // Create a new embed with the updated device information.

                if (!selectButtonPushed) {

                    let newEmbed = createEmbed(searchResults[index], searchQuery, searchResults.length, index, searchResults);

                    await interaction.deferUpdate();

                    await interaction.editReply({
                        embeds: [newEmbed],
                        components: [row]
                    });

                }

            } catch (error) {

                logger.error('Collect Error:', error);

                await interaction.followUp('An error occurred while processing the button click.')

            } finally {

                previous.setDisabled();

                next.setDisabled();

            }

        });



    } catch (error) {

        logger.error('Command Error:', error);

        message.channel.send('An error occurred while processing your request. It would appear whatever you just did broke the bot... Congratulations!');

    }
}
