import { client } from "../index.js";
import discord from "discord.js";
import * as voice from "@discordjs/voice";

export function convert_seconds_to_minutes(value) {
    const hrs = ~~(value / 3600);
    const mins = ~~((value % 3600) / 60);
    const secs = ~~value % 60;

    let ret = "";
    if (hrs > 0) {
        ret += "" + hrs + ":" + (mins < 10 ? "0" : "");
    }

    ret += "" + String(mins).padStart(2, "0") + ":" + (secs < 10 ? "0" : "");
    ret += "" + secs;
    return ret;
}

export async function is_same_vc_as(user_id, guild_id) {
    const guild = client.guilds.cache.get(guild_id);
    const bot = guild.members.cache.get(client.user.id);
    const user = guild.members.cache.get(user_id);

    if (!bot.voice.channel || !user.voice.channel) {
        return false;
    }

    return bot.voice.channel.id === user.voice.channel.id;
}

export function make_simple_embed(string) {
    return new discord.EmbedBuilder().setDescription(string);
}

export function make_playing_embed(guild_id, member, yt_data) {
    return new discord.EmbedBuilder()
        .setColor(0x35cf7d)
        .setTitle("Now Playing")
        .setDescription("[" + yt_data.title + "](" + yt_data.url + ") `(" + convert_seconds_to_minutes(yt_data.duration) + ")`")
        .setThumbnail(yt_data.thumbnail_url)
        .setFooter({
            text: "by " + member.user.username + "#" + member.user.discriminator,
            iconURL: member.user.displayAvatarURL({ size: 16 }),
        });
}

export function get_control_button_row(url) {
    const play = new discord.ButtonBuilder().setStyle(discord.ButtonStyle.Secondary).setCustomId("stop").setLabel("Stop");
    const pause = new discord.ButtonBuilder().setStyle(discord.ButtonStyle.Secondary).setCustomId("pause").setLabel("Pause/Resume");
    const loop = new discord.ButtonBuilder().setStyle(discord.ButtonStyle.Secondary).setCustomId("loop").setLabel("Loop");
    const replay = new discord.ButtonBuilder().setStyle(discord.ButtonStyle.Secondary).setCustomId(`replay:${url}`).setLabel("Replay");
    const skip = new discord.ButtonBuilder().setStyle(discord.ButtonStyle.Secondary).setCustomId("skip").setLabel("Skip");
    return new discord.ActionRowBuilder().addComponents([play, pause, loop, replay, skip]);
}

export function leave_voice_channel(guild_id) {
    if (client.streams.has(guild_id)) {
        client.streams.get(guild_id).player.stop(true);
    }

    const conn = voice.getVoiceConnection(guild_id);
    conn?.disconnect();

    if (conn?.state.status !== voice.VoiceConnectionStatus.Destroyed) {
        conn?.destroy();
    }

    client.streams.delete(guild_id);
    //console.log("Left voice channel in guild " + guild_id + "");
}

export function clean(text) {
    if (typeof text === "string") {
        return text.replace(/`/g, "`" + String.fromCharCode(8203)).replace(/@/g, "@" + String.fromCharCode(8203));
    } else {
        return text;
    }
}

export function getUptime() {
    let totalSeconds = client.uptime / 1000;
    let hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;
    let minutes = Math.floor(totalSeconds / 60);
    let seconds = totalSeconds % 60;

    return hours + "h, " + minutes + "m and " + seconds.toFixed(0) + "s";
}

export function create_yt_data_from_playdl_data(playdl_data) {
    return {
        title: playdl_data.video_details.title,
        url: playdl_data.video_details.url,
        thumbnail_url: playdl_data.video_details.thumbnails[0].url,
        duration: playdl_data.video_details.durationInSec,
    }
}
