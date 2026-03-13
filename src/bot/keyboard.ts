import { Page } from 'patchright';
import { rand, sleep } from '../misc';
import type { ActorConfig } from '../config';

/**
 * Human-like keyboard typing wrapper
 * Implements realistic typing patterns with variable delays to avoid bot detection
 */
export class HumanKeyboard {
    private page: Page;
    private readonly defaults: { baseDelay: number; delayVariance: number; mistakeChance: number; pressDelay: [number, number] };

    constructor(page: Page, actor?: ActorConfig) {
        this.page = page;
        this.defaults = {
            baseDelay: actor?.typing?.baseDelay ?? 60,
            delayVariance: actor?.typing?.delayVariance ?? 30,
            mistakeChance: actor?.typing?.mistakeChance ?? 0,
            pressDelay: actor?.typingPressDelay ?? [60, 100],
        };
    }

    /**
     * Type text with human-like delay between keystrokes
     *
     * @param text - Text to type
     * @param options - Typing configuration
     */
    async type(text: string, options?: {
        baseDelay?: number;
        delayVariance?: number;
        mistakeChance?: number;
    }): Promise<void> {
        const baseDelay: number = options?.baseDelay ?? this.defaults.baseDelay;
        const delayVariance: number = options?.delayVariance ?? this.defaults.delayVariance;
        const mistakeChance: number = options?.mistakeChance ?? this.defaults.mistakeChance;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            if ((mistakeChance ?? 0) > 0 && Math.random() < (mistakeChance ?? 0)) {
                // Type a wrong character (nearby key on keyboard)
                const wrongChar = this.getNearbyChar(char);
                await this.page.keyboard.type(wrongChar);
                await sleep(rand(baseDelay - delayVariance, baseDelay + delayVariance));

                // Backspace to correct
                await this.page.keyboard.press('Backspace');
                await sleep(rand(baseDelay ?? 60, (baseDelay ?? 60) + (delayVariance ?? 30) * 2));
            }

            // Type the actual character
            await this.page.keyboard.type(char);

            // Add human-like delay before next character
            if (i < text.length - 1) {
                const delay = this.getTypingDelay(char, text[i + 1], baseDelay, delayVariance);
                await sleep(delay);
            }
        }
    }

    /**
     * Calculate typing delay based on characters
     * Longer delays after punctuation, shorter for common patterns
     */
    private getTypingDelay(currentChar: string, nextChar: string, baseDelay: number, variance: number): number {
        let delay = rand(baseDelay - variance, baseDelay + variance);

        // Longer pause after punctuation
        if (['.', '!', '?', ',', ';', ':'].includes(currentChar)) {
            delay += rand(100, 300);
        }

        // Longer pause after space (between words)
        if (currentChar === ' ') {
            delay += rand(20, 50);
        }

        // Slightly faster for common letter combinations
        const combination = currentChar + nextChar;
        const fastCombos = ['th', 'he', 'in', 'er', 'an', 'ed', 'nd', 'to', 'en', 'ng'];
        if (fastCombos.includes(combination.toLowerCase())) {
            delay -= rand(10, 20);
        }

        // Ensure minimum delay
        return Math.max(delay, 20);
    }

    /**
     * Get a nearby character for simulating typos based on QWERTY keyboard layout
     */
    private getNearbyChar(char: string): string {
        // QWERTY keyboard layout mapping - each key maps to its adjacent keys
        const keyboardMap: Record<string, string[]> = {
            'q': ['w', 'a', 's'],
            'w': ['q', 'e', 's', 'd'],
            'e': ['w', 'r', 'd', 'f'],
            'r': ['e', 't', 'f', 'g'],
            't': ['r', 'y', 'g', 'h'],
            'y': ['t', 'u', 'h', 'j'],
            'u': ['y', 'i', 'j', 'k'],
            'i': ['u', 'o', 'k', 'l'],
            'o': ['i', 'p', 'l'],
            'p': ['o', 'l'],
            'a': ['q', 'w', 's', 'z'],
            's': ['a', 'w', 'e', 'd', 'z', 'x'],
            'd': ['s', 'e', 'r', 'f', 'x', 'c'],
            'f': ['d', 'r', 't', 'g', 'c', 'v'],
            'g': ['f', 't', 'y', 'h', 'v', 'b'],
            'h': ['g', 'y', 'u', 'j', 'b', 'n'],
            'j': ['h', 'u', 'i', 'k', 'n', 'm'],
            'k': ['j', 'i', 'o', 'l', 'm'],
            'l': ['k', 'o', 'p', 'm'],
            'z': ['a', 's', 'x'],
            'x': ['z', 's', 'd', 'c'],
            'c': ['x', 'd', 'f', 'v'],
            'v': ['c', 'f', 'g', 'b'],
            'b': ['v', 'g', 'h', 'n'],
            'n': ['b', 'h', 'j', 'm'],
            'm': ['n', 'j', 'k', 'l'],
        };

        const lowerChar = char.toLowerCase();
        const nearbyKeys = keyboardMap[lowerChar];

        if (nearbyKeys && nearbyKeys.length > 0) {
            // Pick a random nearby key
            const randomNearby = nearbyKeys[Math.floor(Math.random() * nearbyKeys.length)];
            // Preserve original case
            return char === char.toUpperCase() ? randomNearby.toUpperCase() : randomNearby;
        }

        // Fallback: return the same character if no nearby keys found
        return char;
    }

    /**
     * Press a single key with optional delay
     */
    async press(key: string, options?: { delay?: number }): Promise<void> {
        const [min, max] = this.defaults.pressDelay ?? [60, 100];
        await this.page.keyboard.press(key, { delay: options?.delay ?? rand(min, max) });
    }

    /**
     * Press multiple keys in sequence with human-like delays
     */
    async pressSequence(keys: string[], options?: {
        baseDelay?: number;
        delayVariance?: number;
    }): Promise<void> {
        const baseDelay = options?.baseDelay ?? 60;
        const delayVariance = options?.delayVariance ?? 30;

        for (let i = 0; i < keys.length; i++) {
            await this.page.keyboard.press(keys[i]);

            if (i < keys.length - 1) {
                await sleep(rand(baseDelay - delayVariance, baseDelay + delayVariance));
            }
        }
    }

    /**
     * Type into a specific input field with human-like behavior
     */
    async typeInto(selector: string, text: string, options?: {
        baseDelay?: number;
        delayVariance?: number;
        mistakeChance?: number;
        clearFirst?: boolean;
    }): Promise<void> {
        // Click on the field first
        await this.page.click(selector);
        await sleep(rand(100, 200));

        // Clear existing content if requested
        if (options?.clearFirst) {
            await this.page.keyboard.press('Control+A');
            await sleep(rand(50, 100));
            await this.page.keyboard.press('Backspace');
            await sleep(rand(100, 150));
        }

        // Type the text
        await this.type(text, options);
    }
}
