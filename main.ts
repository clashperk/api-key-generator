import { fetch } from 'undici';

const DevSiteAPIBaseURL = 'https://developer.clashofclans.com/api';
const APIBaseURL = 'https://api.clashofclans.com/v1';

export class RequestHandler {
	private email: string;
	private password: string;
	private keyCount: number;
	private keyName: string;
	private keys: string[] = [];
	private ip: string;

	constructor(ip: string) {
		this.ip = ip;
	}

    public async init(options: LoginOptions) {
		if (!(options.email && options.password)) throw ReferenceError('Missing email and password.');

		this.keyName = options.keyName ?? 'clashofclans.js.keys';
		this.keyCount = Math.min(options.keyCount ?? 1, 10);
		this.password = options.password;
		this.email = options.email;

		return this.reValidateKeys().then(() => this.login());
	}

	private async reValidateKeys() {
		for (const key of this.keys) {
			const res = await fetch(`${APIBaseURL}/locations?limit=1`, {
				method: 'GET',
				headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
			}).catch(() => null);

			if (res?.status === 403) {
				const index = this.keys.indexOf(key);
				this.keys.splice(index, 1);
				process.emitWarning(`Key #${index + 1} is no longer valid. Removed from the key list.`);
			}
		}
	}

	private async login() {
		const res = await fetch(`${DevSiteAPIBaseURL}/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: this.email, password: this.password })
		});

		const data = (await res.json()) as ResponseBody;
		if (!res.ok) throw new Error(`Invalid email or password. ${JSON.stringify(data)}`);

        const cookie = res.headers.get('set-cookie');
        if (!cookie) throw new Error(`Cookie not found`);

		return this.getKeys(cookie, this.ip);
	}

	private async getKeys(cookie: string, ip: string) {
		const res = await fetch(`${DevSiteAPIBaseURL}/apikey/list`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', cookie }
		});
		const data = (await res.json()) as ResponseBody;
		if (!res.ok) throw new Error(`Failed to retrieve the API Keys. ${JSON.stringify(data)}`);

		// Get all available keys from the developer site.
		const keys = (data.keys ?? []) as { id: string; name: string; key: string; cidrRanges?: string[] }[];

		// Revoke keys for specified key name but not matching current IP address.
		for (const key of keys.filter((key) => key.name === this.keyName && !key.cidrRanges?.includes(ip))) {
			if (!(await this.revokeKey(key.id, cookie))) continue;
			const index = keys.findIndex(({ id }) => id === key.id);
			keys.splice(index, 1);
		}

		// Filter keys for current IP address and specified key name.
		for (const key of keys.filter((key) => key.name === this.keyName && key.cidrRanges?.includes(ip))) {
			if (this.keys.length >= this.keyCount) break;
			if (!this.keys.includes(key.key)) this.keys.push(key.key);
		}

		// Create keys within limits (maximum of 10 keys per account)
		while (this.keys.length < this.keyCount && keys.length < 10) {
			const key = await this.createKey(cookie, ip);
			this.keys.push(key.key);
			keys.push(key);
		}

		if (this.keys.length < this.keyCount && keys.length === 10) {
			process.emitWarning(
				`${this.keyCount} key(s) were requested but failed to create ${this.keyCount - this.keys.length} more key(s).`
			);
		}

		if (!this.keys.length) {
			throw new Error(
				[
					`${keys.length} API keys were created but none match a key name of "${this.keyName}" and IP "${ip}".`,
					`Specify a key name or go to "https://developer.clashofclans.com" to delete unused keys.`
				].join(' ')
			);
		}

		return this.keys;
	}

	private async revokeKey(keyId: string, cookie: string) {
		const res = await fetch(`${DevSiteAPIBaseURL}/apikey/revoke`, {
			method: 'POST',
			body: JSON.stringify({ id: keyId }),
			headers: { 'Content-Type': 'application/json', cookie }
		});

		return res.ok;
	}

	private async createKey(cookie: string, ip: string) {
		const res = await fetch(`${DevSiteAPIBaseURL}/apikey/create`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', cookie },
			body: JSON.stringify({
				description: ip,
				cidrRanges: [ip],
				name: this.keyName,
			})
		});

		const data = (await res.json()) as ResponseBody;
		if (!res.ok) throw new Error(`Failed to create API Key. ${JSON.stringify(data)}`);
		return data.key as { id: string; name: string; key: string; cidrRanges?: string[] };
	}
}

export interface LoginOptions {
	email: string;
	password: string;
	keyName?: string;
	keyCount?: number;
}

export type ResponseBody = any;