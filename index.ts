import { config } from 'dotenv';
import { Client, Message } from 'discord.js';
import { Octokit } from '@octokit/rest';

config();

const client = new Client({ partials: ['MESSAGE', 'CHANNEL', 'REACTION'] });
client.login(process.env.DISCORD_TOKEN);

const octokit = new Octokit({
    auth: `${process.env.GITHUB_TOKEN}`
});

const formUsers = new Set<string>();

client.on('ready', () => {
    console.log(`Ready to serve ${client.users.cache.size} users in ${client.guilds.cache.size} servers ✅`)
});

client.on('messageReactionAdd', async (reaction, user) => {

    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.channel.id !== process.env.DISCORD_REPORT_CHANNEL) return;
    if (reaction.emoji.name !== '🐱') return;
    const member = await reaction.message.guild?.members.fetch(user.id).catch(() => { });
    if (!member || !member.permissions.has('MANAGE_MESSAGES')) return;

    formUsers.add(user.id);

    const confirmationMessage = await reaction.message.channel.send(`${user.toString()}, ¿Estás seguro de que deseas convertir esta publicación en un problema en GitHub? Si es así, ingrese el nombre que desea asignar al resultado. Para cancelar, simplemente envíe \`no\`!`);

    const collector = reaction.message.channel.createMessageCollector((message) => message.author.id === user.id, {
        time: 60000
    });

    collector.on('collect', (message: Message) => {

        confirmationMessage.delete();
        message.delete();
        collector.stop();

        if (message.content === 'no') {
            reaction.users.remove(user.id);
            message.reply('accion anulada ✅').then((m: Message) => {
                setTimeout(() => m.delete(), 10000);
            });
        } else {
            reaction.message.reactions.removeAll();
            const imageAttachments = reaction.message.attachments.filter((att) => ['jpg', 'png', 'webp', 'gif'].some((ext) => att.url.endsWith(`.${ext}`)));
            console.log(process.env.GITHUB_REPO_OWNER);
            console.log(process.env.GITHUB_REPO_NAME);
            octokit.repos.get({
                owner: `${process.env.GITHUB_REPO_OWNER}`,
                repo: `${process.env.GITHUB_REPO_NAME}`
            }).then((repo) => console.log(repo)).catch(err => console.error(err))

            octokit.request("POST /repos/{owner}/{repo}/issues", {
                owner: `${process.env.GITHUB_REPO_OWNER}`,
                repo: `${process.env.GITHUB_REPO_NAME}`,
                body: `🤖 Este problema se abrió a partir de un mensaje en Discord. ${reaction.message.url}\n\n${reaction.message.content}${imageAttachments.size > 0 ? `\n\n${imageAttachments.map((att) => `![${att.name}](${att.url})`)}` : ''}`,
                title: message.content,
                labels: ['bug']
            }).then((issue) => {
                message.reply(`issue creada https://github.com/${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}/issues/${issue.data.number} ✅`).then((m: Message) => {
                    setTimeout(() => m.delete(), 10000);
                });
            }).catch(err => console.error(err));
        }
    });

    collector.on('end', (collected, reason) => {
        formUsers.delete(user.id);
        if (reason === 'time') {
            confirmationMessage.delete();
            reaction.users.remove(user.id);
            reaction.message.channel.send(`${user.toString()}, accion anulada ⏲️`).then((m: Message) => {
                setTimeout(() => m.delete(), 10000);
            });
        }
    });

});

client.on('message', (message) => {

    if (message.channel.id !== process.env.DISCORD_REPORT_CHANNEL) return;
    if (message.author.bot) return;

    const isReplying = formUsers.has(message.author.id);
    if (isReplying) return;

    message.react('🐱');

});
