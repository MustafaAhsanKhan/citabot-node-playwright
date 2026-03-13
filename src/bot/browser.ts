import { chromium } from 'patchright';
import type { ProxyConfig } from '../config';

export interface BrowserOptions {
    userName: string;
    proxy?: ProxyConfig;
}

const NewBrowser = async (options: BrowserOptions | string) => {
    const opts = typeof options === 'string' ? { userName: options } : options;
    const launchOptions: Parameters<typeof chromium.launchPersistentContext>[1] = {
        channel: 'chrome',
        headless: false,
        ignoreHTTPSErrors: true,
        timeout: 0,
    };
    if (opts.proxy) {
        launchOptions.proxy = {
            server: opts.proxy.server,
            username: opts.proxy.username,
            password: opts.proxy.password,
        };
    }
    return await chromium.launchPersistentContext('profiles/' + opts.userName, launchOptions);
}

export default NewBrowser