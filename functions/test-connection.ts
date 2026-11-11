import { API_BASE, REVISION } from './lib/klaviyo';

export const config: SwellConfig = {
  description: 'Check the Klaviyo API keys and email list',
  action: true,
};

// a thrown 400 shows in the admin as a red error popup, a returned message as a regular one
function fail(message: string): never {
  throw new SwellError(message, { status: 400 });
}

export default async function (req: SwellRequest) {
  const settings = ((await req.swell.settings())?.klaviyo || {}) as any;
  const publicKey = String(settings.public_api_key || '').trim();
  const privateKey = String(settings.private_api_key || '').trim();
  const listId = String(settings.list_id || '').trim();

  const missing = [
    !publicKey && 'public API key',
    !privateKey && 'private API key',
    !listId && 'email list ID',
  ].filter(Boolean);
  if (missing.length) {
    fail(`Add the ${missing.join(', ')} and save the settings first.`);
  }

  const get = (path: string) =>
    fetch(`${API_BASE}/api/${path}`, {
      headers: { Authorization: `Klaviyo-API-Key ${privateKey}`, accept: 'application/json', revision: REVISION },
    });

  let listName: string;
  let account: any;
  try {
    const res = await get(`lists/${encodeURIComponent(listId)}/`);
    if (res.status === 401) {
      fail("Klaviyo didn't accept the private API key. Copy it again from Klaviyo → Settings → API keys.");
    }
    if (res.status === 403) {
      fail('The private API key has no access to lists. In Klaviyo, give the key access to Lists, Profiles and Subscriptions.');
    }
    if (res.status === 404) {
      fail(`Klaviyo has no list with the ID ${listId}. Copy the list ID from Audience → Lists & segments → the list's settings.`);
    }
    if (!res.ok) {
      fail(`Klaviyo answered ${res.status} when checking the email list: ${await errorDetail(res)}`);
    }
    const list = (await res.json()) as any;
    listName = String(list?.data?.attributes?.name || listId);

    // naming the account and checking the public key needs Accounts access, which the key may not have
    const accountRes = await get('accounts/');
    if (accountRes.ok) {
      account = ((await accountRes.json()) as any)?.data?.[0];
    }
  } catch (err) {
    if (err instanceof SwellError) throw err;
    fail(`Klaviyo couldn't be reached (${err instanceof Error ? err.message : String(err)}). Try again in a minute.`);
  }

  if (!account) {
    return { message: `Connected to Klaviyo, email list ${listName}.` };
  }
  const accountName = String(account.attributes?.contact_information?.organization_name || account.id);
  const accountPublicKey = account.attributes?.public_api_key || account.id;
  if (accountPublicKey && accountPublicKey !== publicKey) {
    fail(
      `The private API key belongs to Klaviyo account ${accountName} (public API key ${accountPublicKey}), but the public API key in settings is ${publicKey}. Use both keys from the same account.`,
    );
  }
  return { message: `Connected to Klaviyo account ${accountName}, email list ${listName}.` };
}

async function errorDetail(res: Response): Promise<string> {
  const text = await res.text();
  try {
    return JSON.parse(text)?.errors?.[0]?.detail || text.slice(0, 200);
  } catch {
    return text.slice(0, 200);
  }
}
