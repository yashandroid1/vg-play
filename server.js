const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 8080;

let browserInstance = null;

async function getBrowser() {
    if (!browserInstance || !browserInstance.connected) {
        console.log("🌐 Launching Browser (Auto-Download Mode)...");
        
        browserInstance = await puppeteer.launch({
            headless: "new",
            // Humne executablePath poora hata diya hai! 
            // Ab ye Puppeteer ke internal downloaded browser ko use karega.
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage', 
                '--single-process',
                '--no-zygote'
            ]
        });
    }
    return browserInstance;
}

app.get('/vgplay', async (req, res) => {
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
        
        await page.goto(finalTarget, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});

        let attempts = 0;
        const maxAttempts = 15; 

        while (cdnLinks.size === 0 && attempts < maxAttempts) {
            await page.evaluate(() => {
                const btn = document.querySelector('.vjs-big-play-button, #play, video, .play_button');
                if (btn) btn.click();
            }).catch(() => {});

            await new Promise(r => setTimeout(r, 500));
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
        console.error("❌ Error:", e.message);
        res.status(500).json({ success: false, error: e.message });
    } finally {
        if (page) await page.close();
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server Ready on Port ${PORT}`));