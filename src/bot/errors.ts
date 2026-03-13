export class RetryError extends Error {
    constructor(
        message: string,
        public readonly timeout: number,
        public readonly rotateProxy = false,
        public readonly removeProxy = false
    ) {
        super(message);
        this.name = 'RetryError';
    }
}

export class RestartFromBeginning extends Error {
}

export class BotDetectedError extends Error {
    constructor(message = 'Bot detected') {
        super(message);
        this.name = 'BotDetectedError';
    }
}

export class NoSuitableCitaError extends Error {
    constructor(public readonly htmlPath: string) {
        super('No suitable cita found, HTML saved for investigation');
        this.name = 'NoSuitableCitaError';
    }
}
