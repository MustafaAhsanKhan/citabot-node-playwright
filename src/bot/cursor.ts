import { Page } from 'patchright';
import { createCursor, createCursorOptions, Cursor } from 'ghost-cursor-playwright';
import { rand, sleep } from "../misc";
import type { ActorConfig } from '../config';

/**
 * Human-like cursor behavior wrapper for ghost-cursor-playwright
 * Implements light jitter and natural movement patterns to avoid bot detection
 * Compatible with patchright (Playwright fork)
 */
export class HumanCursor {
    private ghostCursor: Cursor | null = null;
    private readonly page: Page;
    private readonly createCursorOptions: createCursorOptions;
    private readonly defaults: {
        overshootSpread: number; overshootRadius: number; debug: boolean;
        waitBeforeMove: [number, number]; waitBeforeClick: [number, number]; waitBetweenClick: [number, number];
        scrollDelay: [number, number]; maxScrollStep: number; moveRandomRange: [number, number];
    };

    constructor(page: Page, actor?: ActorConfig | createCursorOptions) {
        this.page = page;
        const isActor = actor && typeof actor === 'object' && 'id' in actor;
        const a = isActor ? (actor as ActorConfig) : undefined;
        this.createCursorOptions = !isActor && actor ? (actor as createCursorOptions) : {};
        this.defaults = {
            overshootSpread: a?.cursor?.overshootSpread ?? 5,
            overshootRadius: a?.cursor?.overshootRadius ?? 5,
            debug: a?.cursor?.debug ?? false,
            waitBeforeMove: a?.cursor?.waitBeforeMove ?? [50, 200] as [number, number],
            waitBeforeClick: a?.cursor?.waitBeforeClick ?? [100, 300] as [number, number],
            waitBetweenClick: a?.cursor?.waitBetweenClick ?? [50, 150] as [number, number],
            scrollDelay: a?.cursor?.scrollDelay ?? [100, 200] as [number, number],
            maxScrollStep: a?.cursor?.maxScrollStep ?? 2000,
            moveRandomRange: a?.cursor?.moveRandomRange ?? [100, 200] as [number, number],
        };
    }

    async initialize(): Promise<void> {
        this.ghostCursor = await createCursor(this.page as any, {
            overshootSpread: this.defaults.overshootSpread,
            overshootRadius: this.defaults.overshootRadius,
            debug: this.defaults.debug,
            ...this.createCursorOptions,
        });
    }

    /**
     * Move cursor to element with human-like behavior
     * Includes random delays before movement for natural behavior
     */
    async move(selector: string, options?: {
        paddingPercentage?: number;
        waitForSelector?: number;
        waitBeforeMove?: [number, number];
    }): Promise<void> {
        if (!this.ghostCursor) {
            await this.initialize();
        }

        await this.ghostCursor!.actions.move(selector, {
            paddingPercentage: options?.paddingPercentage,
            waitForSelector: options?.waitForSelector,
            waitBeforeMove: options?.waitBeforeMove ?? this.defaults.waitBeforeMove,
        });
    }

    /**
     * Click element with human-like cursor movement and timing
     * Includes randomized delays to simulate natural click behavior
     */
    async click(selector: string, options?: {
        waitBeforeClick?: [number, number];
        waitBetweenClick?: [number, number];
        doubleClick?: boolean;
        paddingPercentage?: number;
        waitForSelector?: number;
        waitBeforeMove?: [number, number];
        useFallback?: boolean; // Use native click if ghost-cursor fails
    }): Promise<void> {
        if (!this.ghostCursor) {
            await this.initialize();
        }

        const clickOpts = {
            target: selector,
            waitBeforeClick: options?.waitBeforeClick ?? this.defaults.waitBeforeClick,
            waitBetweenClick: options?.waitBetweenClick ?? this.defaults.waitBetweenClick,
            doubleClick: options?.doubleClick || false,
        }
        const moveOpts = {
            paddingPercentage: options?.paddingPercentage,
            waitForSelector: options?.waitForSelector,
            waitBeforeMove: options?.waitBeforeMove ?? this.defaults.waitBeforeMove,
        }

        try {
            await this.ghostCursor!.actions.click(clickOpts, moveOpts);
        } catch (error: any) {
            // Fallback to native patchright click if ghost-cursor fails
            if (options?.useFallback !== false && error?.message?.includes('isEqualNode')) {
                await this.move(selector, moveOpts);
                const delay = rand(this.defaults.waitBeforeClick[0], this.defaults.waitBeforeClick[1]);
                await new Promise(resolve => setTimeout(resolve, delay));

                // Perform native click
                await this.page.click(selector, { delay: rand(this.defaults.waitBeforeClick[0], this.defaults.waitBeforeClick[1]) });
            } else {
                throw error;
            }
        }
    }

    /**
     * Move cursor to random position on page (simulates natural user behavior)
     */
    async moveRandom(value?: number): Promise<void> {
        if (!this.ghostCursor) {
            await this.initialize();
        }
        const [min, max] = this.defaults.moveRandomRange;
        const v = value ?? rand(min, max);
        await this.ghostCursor!.actions.randomMove(v);
    }

    /**
     * Get the current cursor instance (for advanced usage)
     */
    getCursor(): Cursor | null {
        return this.ghostCursor;
    }

    /**
     * Scroll to element with human-like behavior
     * Uses multiple scroll steps if element is far from current view
     *
     * @param selector - Element selector or 'top' | 'bottom' for page scroll
     * @param options - Scroll configuration options
     */
    async scroll(selector: string | 'top' | 'bottom', options?: {
        scrollDelay?: [number, number];
        maxScrollStep?: number;
    }): Promise<void> {
        const scrollDelay = options?.scrollDelay ?? this.defaults.scrollDelay ?? [100, 200];
        const maxScrollStep = options?.maxScrollStep ?? this.defaults.maxScrollStep ?? 2000;

        // Handle page scroll shortcuts
        if (selector === 'top') {
            await this.scrollToPosition(0, { scrollDelay, maxScrollStep });
            return;
        }
        if (selector === 'bottom') {
            const pageHeight = await this.page.evaluate(() => document.body.scrollHeight);
            await this.scrollToPosition(pageHeight, { scrollDelay, maxScrollStep });
            return;
        }

        // Get element position
        const element = await this.page.$(selector);
        if (!element) {
            throw new Error(`Element not found: ${selector}`);
        }

        const elementBox = await element.boundingBox();
        if (!elementBox) {
            throw new Error(`Cannot get bounding box for: ${selector}`);
        }

        // Get viewport info (boundingBox is in viewport coordinates)
        const viewportHeight = await this.page.evaluate(() => window.innerHeight);

        // Skip scroll if element is already visible in the viewport
        const topVisible = elementBox.y >= 0;
        const bottomVisible = elementBox.y + elementBox.height <= viewportHeight;
        if (topVisible && bottomVisible) {
            return;
        }

        // Get current scroll position
        const currentScroll = await this.page.evaluate(() => window.scrollY);

        // Calculate target scroll position with randomness (30-70% of viewport from top)
        const viewportPositionFactor = 0.3 + (Math.random() * 0.4); // Random between 0.3-0.7
        const targetScroll = currentScroll + elementBox.y - (viewportHeight * viewportPositionFactor);

        await this.scrollToPosition(targetScroll, { scrollDelay, maxScrollStep });
    }

    /**
     * Scroll to a specific Y position with human-like behavior using mouse wheel
     * Uses small incremental scrolls to create smooth, natural scrolling motion
     */
    private async scrollToPosition(targetY: number, options: {
        scrollDelay: [number, number];
        maxScrollStep: number;
    }): Promise<void> {
        const currentY = await this.page.evaluate(() => window.scrollY);
        const distance = targetY - currentY;

        // If distance is small, just scroll directly
        if (Math.abs(distance) < 50) {
            if (distance !== 0) {
                await this.smoothWheelScroll(distance);
                await sleep(rand(options.scrollDelay[0], options.scrollDelay[1]));
            }
            return;
        }

        // Calculate number of major steps based on distance
        const numSteps = Math.ceil(Math.abs(distance) / options.maxScrollStep);
        const direction = distance > 0 ? 1 : -1;

        let remainingDistance = Math.abs(distance);

        for (let i = 0; i < numSteps; i++) {
            const isLastStep = i === numSteps - 1;

            // Calculate step size with randomness
            let stepSize: number;
            if (isLastStep) {
                // Last step scrolls remaining distance
                stepSize = direction * remainingDistance;
            } else {
                // Random step size between 70% and 100% of maxScrollStep
                const randomFactor = 0.7 + (Math.random() * 0.3);
                stepSize = direction * Math.floor(options.maxScrollStep * randomFactor);
                remainingDistance -= Math.abs(stepSize);
            }

            // Perform smooth scroll using multiple small wheel events
            await this.smoothWheelScroll(stepSize);

            // Random delay between major scroll steps
            if (!isLastStep) {
                await sleep(rand(options.scrollDelay[0], options.scrollDelay[1]));
            }
        }

        // Final delay after scrolling completes
        await sleep(rand(options.scrollDelay[0], options.scrollDelay[1]));
    }

    /**
     * Perform smooth wheel scroll by breaking it into small increments
     * Simulates natural mouse wheel scrolling
     */
    private async smoothWheelScroll(totalDelta: number): Promise<void> {
        const direction = totalDelta > 0 ? 1 : -1;
        const absDelta = Math.abs(totalDelta);

        // Break scroll into small increments (20-40px per wheel tick)
        const wheelTickSize = rand(20, 40);
        const numTicks = Math.ceil(absDelta / wheelTickSize);

        let scrolled = 0;

        for (let i = 0; i < numTicks; i++) {
            const isLastTick = i === numTicks - 1;

            // Calculate increment size
            let increment: number;
            if (isLastTick) {
                // Last tick scrolls exactly to target
                increment = direction * (absDelta - scrolled);
            } else {
                // Random wheel tick between 80-120% of wheelTickSize
                const variance = 0.8 + (Math.random() * 0.4);
                increment = direction * Math.floor(wheelTickSize * variance);
                scrolled += Math.abs(increment);
            }

            // Perform small wheel scroll
            await this.page.mouse.wheel(0, increment);

            // Small delay between wheel ticks (10-30ms for smooth feel)
            if (!isLastTick) {
                await sleep(rand(5, 15));
            }
        }
    }
}
