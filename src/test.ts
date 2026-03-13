import NewBrowser from "./bot/browser";

(async ()=>
{
    const browser = await NewBrowser('test')
    const page = await browser.newPage()
    await page.goto('https://browserleaks.com/canvas')

    await setTimeout(()=>browser.close(), 100000)
})()