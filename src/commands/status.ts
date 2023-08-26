import * as discord from 'discord.js';

const fetchOptions = {
  headers: { 'User-Agent': 'Citra-Emu/CitraBot (Node.js)', Accept: 'application/vnd.github.antiope-preview+json' }
};
const repo = process.env.GITHUB_REPOSITORY || 'citra-emu/citra';

export const roles = ['Admins', 'Moderators', 'Developer'];
export async function command (message: discord.Message) {
  const prNumber = message.content.substring(message.content.indexOf(' ') + 1).replace(/\n/g, '');
  const url = `https://api.github.com/repos/${repo}/pulls/${prNumber}`;
  return fetch(url, fetchOptions).then(response => response.json()).then(async (pr: any) => {
    if (!pr || pr.documentation_url || !pr.head) throw new Error('PR not found');
    const headSHA = pr.head.sha;
    // use the new GitHub checks API
    return fetch(`https://api.github.com/repos/${repo}/commits/${headSHA}/check-runs`, fetchOptions).then(response => response.json()).then(async (statuses: any) => {
      if (!statuses.check_runs || statuses.total_count < 1) throw new Error('No check runs');
      const msg = new discord.EmbedBuilder().setTitle(`Status for PR #${prNumber}`).setURL(pr.html_url);
      let color: discord.ColorResolvable = 'Green';
      statuses.check_runs.forEach((run: any) => {
        msg.addFields({ name: run.name, value: `**[${run.status} ${run.conclusion}](${run.html_url})**` });
        if (run.conclusion !== 'success') color = 'Red';
      });
      msg.setColor(color);
      await message.channel.send({ embeds: [msg] });
    }).catch(async () => {
      await message.channel.send('I wasn\'t able to get the status of that PR...');
    });
  }).catch(async () => {
    await message.channel.send('No such PR.');
  });
}
