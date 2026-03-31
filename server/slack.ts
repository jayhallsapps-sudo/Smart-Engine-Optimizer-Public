import { WebClient } from '@slack/web-api';

async function getAccessToken(): Promise<string> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  const settings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=slack',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken,
      },
    }
  ).then(res => res.json()).then((data: any) => data.items?.[0]);

  const accessToken = settings?.settings?.access_token || settings?.settings?.oauth?.credentials?.access_token;

  if (!settings || !accessToken) {
    throw new Error('Slack not connected');
  }
  return accessToken;
}

export async function getUncachableSlackClient(): Promise<WebClient> {
  const token = await getAccessToken();
  return new WebClient(token);
}

export async function postSlackMessage(channelId: string, text: string): Promise<void> {
  const client = await getUncachableSlackClient();
  await client.chat.postMessage({
    channel: channelId,
    text,
  });
}
