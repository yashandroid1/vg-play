const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 8080;

let browserInstance = null;

async function getBrowser() {
    if (!browserInstance || !browserInstance.connected) {
        browserInstance = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
        });
    }
    return browserInstance;
}

app.get('/vgplay', async (req, res) => {
    const fileId = req.query.id;
    const targetUrl = req.query.url;
    const mainReferer = "https://dotmovies.band/";

    let finalTarget = targetUrl || (fileId ? `https://vekna402las.com/play/${fileId}` : null);

    if (!finalTarget) return res.status(400).json({ success: false, message: "URL ya ID chahiye!" });

    let page;
    try {
        const browser = await getBrowser();
        page = await browser.newPage();

        let cdnLinks = new Set();

        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const url = request.url();
            if (url.includes('.m3u8')) {
                cdnLinks.add(url);
                request.continue();
            } else if (['image', 'font'].includes(request.resourceType())) {
                request.abort();
            } else {
                request.continue();
            }
        });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({ 'Referer': mainReferer });

        // Local ki tarah fast load: domcontentloaded use kar rahe hain
        await page.goto(finalTarget, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});

        // --- LOCAL POLLING LOGIC ---
        let attempts = 0;
        const maxAttempts = 30; // Thoda zyada time diya Railway ko

        while (cdnLinks.size === 0 && attempts < maxAttempts) {
            await page.evaluate(() => {
                // Saare possible buttons ko ek saath click karne ki koshish
                const btns = document.querySelectorAll('.vjs-big-play-button, #play, video, .play_button, .vjs-tech');
                btns.forEach(b => b.click());
            }).catch(() => {});

            // 500ms ka gap (Local se thoda zyada, server ke liye perfect)
            await new Promise(r => setTimeout(r, 500));
            attempts++;
            
            // Jaise hi link mile, loop tod do (Fastest response)
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
            res.json({ success: false, message: "Link nahi mila. Site slow hai ya ID galat hai." });
        }

    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    } finally {
        if (page) await page.close();
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Ready on Port ${PORT}`));