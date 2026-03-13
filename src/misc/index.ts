export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms + rand(15, 33)));

export const rand = (min: number, max: number): number => {
    return Math.floor(Math.random() * (max - min + 1)) + min
};