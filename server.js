const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
// Railway apna port khud assign karta hai, isliye process.env.PORT zaroori hai
//const PORT = process.env.PORT || 3000;

let browserInstance = null;

async function getBrowser() {
    if (!browserInstance || !browserInstance.connected) {
        console.log("🌐 Launching New Browser Instance on Railway...");
        browserInstance = await puppeteer.launch({
            headless: "new",
            // Railway/Linux par ye args compulsory hain
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--single-process' 
            ],
            // Railway par Chromium yahan hota hai (agar Nixpacks use kar rahe ho)
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null 
        });
    }
    return browserInstance;
}

app.get('/extract', async (req, res) => {
    const fileId = req.query.id;
    const targetUrl = req.query.url;
    const mainReferer = "https://dotmovies.band/";

    let finalTarget = targetUrl || (fileId ? `https://vekna402las.com/play/${fileId}` : null);

    if (!finalTarget) {
        return res.status(400).json({ success: false, message: "URL ya ID chahiye bhai!" });
    }

    let page;
    try {
        const browser = await getBrowser();
        page = await browser.newPage();

        let cdnLinks = new Set();

        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const url = request.url();
            const type = request.resourceType();

            if (url.includes('.m3u8')) {
                cdnLinks.add(url);
                request.continue();
            } else if (['image', 'font', 'media'].includes(type) || url.includes('google-analytics')) {
                request.abort();
            } else {
                request.continue();
            }
        });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({ 'Referer': mainReferer });

        console.log(`📡 Sniping: ${finalTarget}`);
        
        await page.goto(finalTarget, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});

        let attempts = 0;
        const maxAttempts = 20; 

        while (cdnLinks.size === 0 && attempts < maxAttempts) {
            await page.evaluate(() => {
                const btn = document.querySelector('.vjs-big-play-button, #play, video, .play_button');
                if (btn) btn.click();
            }).catch(() => {});

            await new Promise(r => setTimeout(r, 250));
            attempts++;
            if (cdnLinks.size > 0) break;
        }

        const linksArray = Array.from(cdnLinks);

        if (linksArray.length > 0) {
            const masterLink = linksArray.find(l => l.includes('index.m3u8')) || linksArray[0];
            res.json({
                success: true,
                movie_url: `${masterLink}|Referer=${mainReferer}`,
                all_links: linksArray.map(l => `${l}|Referer=${mainReferer}`)
            });
        } else {
            res.json({ success: false, message: "Link nahi mila." });
        }

    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    } finally {
        if (page) await page.close();
    }
});

// Railway par listen karne ke liye 0.0.0.0 bind karna zaroori hai
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Singleton Ace-Fast Ready: http://localhost:${PORT}`));