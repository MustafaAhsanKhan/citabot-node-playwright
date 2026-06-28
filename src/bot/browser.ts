import { chromium } from 'patchright';
import type { ProxyConfig } from '../config';

export interface BrowserOptions {
    userName: string;
    proxy?: ProxyConfig;
    /** Absolute paths to unpacked extension directories to load at launch (e.g. Chromixer). */
    extensions?: string[];
}

const NewBrowser = async (options: BrowserOptions | string) => {
    const opts = typeof options === 'string' ? { userName: options } : options;
    const launchOptions: Parameters<typeof chromium.launchPersistentContext>[1] = {
        headless: false,
        ignoreHTTPSErrors: true,
        timeout: 0
    };
    if (opts.proxy) {
        launchOptions.proxy = {
            server: opts.proxy.server,
            username: opts.proxy.username,
            password: opts.proxy.password,
        };
    }
    if (opts.extensions && opts.extensions.length > 0) {
        // Playwright/patchright will NOT auto-activate an extension just because it is registered
        // in the profile — it must be loaded explicitly via these flags.
        // https://playwright.dev/docs/chrome-extensions
        const paths = opts.extensions.join(',');
        launchOptions.args = [
            ...(launchOptions.args ?? []),
            `--disable-extensions-except=${paths}`,
            `--load-extension=${paths}`,
        ];
    }
    return await chromium.launchPersistentContext('profiles/' + opts.userName, launchOptions);
}

export default NewBrowser