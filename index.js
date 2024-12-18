"use strict";

import discord from "discord.js";
import * as fs from "fs";
import {
    make_simple_embed,
    is_same_vc_as,
    leave_voice_channel,
    create_yt_data_from_playdl_data, make_playing_embed, get_control_button_row
} from "./utils/utils.js";
import { any_audio_playing, stop_audio, pause_audio, play_audio, skip_audio } from "./utils/audio.js";
// import topgg from "@top-gg/sdk";
import * as voice from "@discordjs/voice";
import 'dotenv/config';

const token = process.env.DISCORD_TOKEN;

export const client = new discord.Client({
    intents: [
        discord.GatewayIntentBits.Guilds,
        discord.GatewayIntentBits.GuildVoiceStates,
    ],
});

client.streams = new discord.Collection();
client.commands = new discord.Collection();
//client.topgg_api = new topgg.Api(process.env.TOPGG_TOKEN);

client.login(token).catch((e) => {
    console.error("The bot token was incorrect.\n" + e);
});

client.once(discord.Events.ClientReady, async () => {
    console.log("Loading commands...");

    const command_files = fs.readdirSync("./commands").filter((file) => file.endsWith(".js"));
    for await (const file of command_files) {
        const { data, execute } = await import(`./commands/${file}`);

        client.commands.set(data.name, execute);
        //console.log("Loaded command: " + data.name);
    }
    console.log("Loaded " + client.commands.size + " commands!\n");

    console.log("Bot is ready!\n");
});

client.on(discord.Events.VoiceStateUpdate, (oldState, newState) => {
    try {
        // Check if the bot was kicked from a voice channel
        if (oldState.member.user.id === client.user.id && oldState.channel && !newState.channel) {
            // Check if the bot is in a voice channel
            if (client.streams.has(oldState.guild.id)) {
                // Stop the audio
                stop_audio(oldState.guild.id);
                client.streams.delete(oldState.guild.id);

                const conn = voice.getVoiceConnection(oldState.guild.id);
                if (conn?.state.status !== voice.VoiceConnectionStatus.Destroyed) {
                    conn?.destroy();
                }

                //console.log("Stopped audio in guild with ID " + oldState.guild.id + " because I was kicked from the voice channel.");
                return;
            }
        }

        // Leave the voice channel if the bot is the only one in it
        if (oldState.channel) {
            if (oldState.channel.members.size === 1 && oldState.channel.members.first().user.id === client.user.id) {
                const guild_stream = client.streams.get(oldState.guild.id);

                if (guild_stream !== undefined) {
                    clearTimeout(guild_stream.leave_timeout_id);
                    guild_stream.leave_timeout_id = setTimeout(async () => {
                        if (!oldState?.channel?.id || !oldState?.guild?.id) {
                            return;
                        }

                        const channel = await client.channels.fetch(oldState.channel.id);
                        if (channel && channel.members.size === 1) {
                            leave_voice_channel(oldState.guild.id);
                        }
                    }, 30000);
                }
            }
        }
    } catch (e) {
        //console.log("An error occurred!");
        console.log(e);
    }
});

client.on(discord.Events.InteractionCreate, async (interaction) => {
    try {
        // Check if the interaction is valid
        if (interaction.replied || interaction.deferred) {
            console.log("Invalid interaction! (replied: " + interaction.replied + ", deferred: " + interaction.deferred + ", channel: " + interaction.channel + ")");
            return;
        }

        if (interaction.isChatInputCommand()) {
            await handleChatInputCommand(interaction);
        } else if (interaction.isButton()) {
            await handleButton(interaction);
        }
    } catch (e) {
        console.log(e);
    }
});

async function handleChatInputCommand(interaction) {
    if (!interaction.channel) {
        await interaction.reply({
            embeds: [make_simple_embed("You must be in a server to use this command!")],
            ephemeral: true,
        });
        return;
    }

    const execute = client.commands.get(interaction.commandName);
    if (!execute) {
        await interaction.reply({
            embeds: [make_simple_embed("There was an error while executing this command!")],
        });
        return;
    }

    // check if the bot has permission to send message to the channel
    if (!interaction.guild.members.me?.permissionsIn(interaction.channel).has(discord.PermissionsBitField.Flags.SendMessages)) {
        await interaction.reply({
            embeds: [make_simple_embed("I don't have permission to send message to this channel!")],
            ephemeral: true,
        });
        return;
    }

    await interaction.reply({ content: "..." });

    try {
        await execute(interaction);
    } catch (error) {
        console.error(error);

        try {
            await interaction.channel.send({
                embeds: [make_simple_embed("There was an error while executing this command!")],
            });
        } catch (ignored) {
        }
    }
}

async function handleButton(interaction) {
    switch (interaction.customId) {
        case "pause":
            if (!(await is_same_vc_as(interaction.user.id, interaction.guildId))) {
                await interaction.reply({
                    embeds: [make_simple_embed("You are not in the same voice channel!")],
                    ephemeral: true
                });
                return;
            }

            if (!any_audio_playing(interaction.guildId)) {
                await interaction.reply({
                    embeds: [make_simple_embed("No audio is currently playing")],
                    ephemeral: true,
                });
                return;
            }

            if (pause_audio(interaction.guildId) === 0) {
                await interaction.reply({
                    embeds: [
                        make_simple_embed("The currently playing audio has been successfully **resumed**").setFooter({
                            text: "by " + interaction.user.username + "#" + interaction.user.discriminator,
                            iconURL: interaction.user.displayAvatarURL({ size: 16 }),
                        }),
                    ],
                });
            } else {
                await interaction.reply({
                    embeds: [
                        make_simple_embed("The currently playing audio has been successfully **paused**").setFooter({
                            text: "by " + interaction.user.username + "#" + interaction.user.discriminator,
                            iconURL: interaction.user.displayAvatarURL({ size: 16 }),
                        }),
                    ]
                });
            }
            break;
        case "stop":
            if (!(await is_same_vc_as(interaction.user.id, interaction.guildId))) {
                await interaction.reply({
                    embeds: [make_simple_embed("You are not in the same voice channel!")],
                    ephemeral: true
                });
                return;
            }

            if (!any_audio_playing(interaction.guildId)) {
                await interaction.reply({
                    embeds: [make_simple_embed("No audio is currently playing")],
                    ephemeral: true,
                });
                return;
            }

            stop_audio(interaction.guildId);
            await interaction.reply({
                embeds: [
                    make_simple_embed("YouTube audio successfully stopped!").setFooter({
                        text: "by " + interaction.user.username + "#" + interaction.user.discriminator,
                        iconURL: interaction.user.displayAvatarURL({ size: 16 }),
                    }),
                ]
            });
            break;
        case "skip":
            if (!(await is_same_vc_as(interaction.user.id, interaction.guildId))) {
                await interaction.reply({
                    embeds: [make_simple_embed("You are not in the same voice channel!")],
                    ephemeral: true
                });
                return;
            }

            if (!any_audio_playing(interaction.guildId)) {
                await interaction.reply({
                    embeds: [make_simple_embed("No audio is currently playing")],
                    ephemeral: true,
                });
                return;
            }

            if (skip_audio(interaction.guildId, interaction.member.voice.channelId) === 'last_in_queue') {
                await interaction.reply({
                    embeds: [make_simple_embed("Cannot skip last track in the queue. Use STOP command or add another track.")],
                    ephemeral: true,
                });
                return;
            }

            skip_audio(interaction.guildId, interaction.member.voice.channelId);
            await interaction.reply({
                embeds: [
                    make_simple_embed("Audio skipped to next queue").setFooter({
                        text: "by " + interaction.user.username + "#" + interaction.user.discriminator,
                        iconURL: interaction.user.displayAvatarURL({ size: 16 }),
                    }),
                ]
            });
            break;
        case "loop":
            if (!(await is_same_vc_as(interaction.user.id, interaction.guildId))) {
                await interaction.reply({
                    embeds: [make_simple_embed("You are not in the same voice channel!")],
                    ephemeral: true
                });
                return;
            }

            if (!any_audio_playing(interaction.guildId)) {
                await interaction.reply({
                    embeds: [make_simple_embed("No audio is currently playing")],
                    ephemeral: true,
                });
                return;
            }

            const guild_stream = client.streams.get(interaction.guildId);
            guild_stream.loop = !guild_stream.loop;
            await interaction.reply({
                embeds: [
                    make_simple_embed(
                        guild_stream.loop ? "Loop successfully **enabled** for current audio" : "Loop successfully **disabled** for current audio"
                    ).setFooter({
                        text: "by " + interaction.user.username + "#" + interaction.user.discriminator,
                        iconURL: interaction.user.displayAvatarURL({ size: 16 }),
                    }),
                ]
            });
            break;
        default:
            if (interaction.customId.startsWith("replay:")) {
                const replay_url = interaction.customId.replaceAll("replay:", "");

                const guild = client.guilds.cache.get(interaction.guildId);
                const bot = guild.members.cache.get(client.user.id);
                const user = guild.members.cache.get(interaction.member.id);

                if (!user.voice.channel) {
                    await interaction.reply({
                        embeds: [make_simple_embed("You are not in a voice channel!")],
                        ephemeral: true,
                    });
                    return;
                }

                if (bot.voice.channel) {
                    if (!(await is_same_vc_as(interaction.member.id, interaction.guildId))) {
                        await interaction.reply({
                            embeds: [make_simple_embed("You are not in the same voice channel!")],
                            ephemeral: true
                        });
                        return;
                    }
                }

                await interaction.reply({
                    content: "..."
                });

                let message = null;
                const guild_stream = client.streams.get(interaction.guildId);
                if (guild_stream?.queue?.length >= 5) {
                    const timeoutId = setTimeout(async () => {
                        message = await interaction.channel.send({
                            embeds: [make_simple_embed("<a:loading:1032708714605592596>    Loading...")],
                        });
                    }, 1500);

                    clearTimeout(timeoutId);

                    if (guild_stream?.queue?.length >= 10) {
                        const contents = {
                            embeds: [make_simple_embed("Queue is full (max 10)!")],
                        };

                        if (message) {
                            await message.edit(contents);
                        } else {
                            await interaction.channel.send(contents);
                        }
                        return;
                    }
                }

                message = await interaction.channel.send({
                    embeds: [await make_simple_embed(`<a:loading:1032708714605592596> Replaying audio...`)],
                    allowedMentions: { repliedUser: false },
                });

                const stream_data = await play_audio(replay_url, interaction.guildId, interaction.member.voice.channelId);

                if (stream_data === null) {
                    await message.edit({
                        embeds: [make_simple_embed("No results found!")],
                    });
                    return;
                }

                const yt_data = create_yt_data_from_playdl_data(stream_data)

                if (guild_stream?.queue?.length >= 1) {
                    await message.edit({
                        embeds: [
                            await make_playing_embed(interaction.guildId, interaction.member, yt_data)
                                .setTitle(`Added to queue (#${guild_stream?.queue?.length})`)
                                .setColor(0x44DDBF),
                        ],
                        allowedMentions: { repliedUser: false },
                    });
                } else {
                    await message.edit({
                        embeds: [await make_playing_embed(interaction.guildId, interaction.member, yt_data)],
                        components: [get_control_button_row(yt_data.url)],
                        allowedMentions: { repliedUser: false },
                    });
                }
            }
    }
}

//process.on('warning', e => console.warn(e.stack));
