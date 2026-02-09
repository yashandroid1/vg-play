const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
// Railway automatically PORT assign karta hai, isliye process.env.PORT zaroori hai
const PORT = process.env.PORT || 8080;

let browserInstance = null;

async function getBrowser() {
    if (!browserInstance || !browserInstance.connected) {
        console.log("🌐 Launching Browser (Railway Stable Mode)...");
        browserInstance = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process',
                '--no-zygote'
            ]
            // Note: executablePath hata diya hai taaki Puppeteer apna downloaded browser use kare
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
            if (url.includes('.m3u8')) {
                cdnLinks.add(url);
                request.continue();
            } else if (['image', 'font', 'media'].includes(request.resourceType()) || url.includes('google-analytics')) {
                request.abort();
            } else {
                request.continue();
            }
        });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({ 'Referer': mainReferer });

        console.log(`📡 Sniping: ${finalTarget}`);
        
        // Railway par 'networkidle2' use karna better hai taaki scripts load ho jayein
        await page.goto(finalTarget, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});

        // Page load hone ke baad thoda aur intezar (Vekna sites ke liye)
        await new Promise(r => setTimeout(r, 2000));

        let attempts = 0;
        const maxAttempts = 12; // Zyada attempts taaki link miss na ho

        while (cdnLinks.size === 0 && attempts < maxAttempts) {
            console.log(`Attempt ${attempts + 1}: Clicking play buttons...`);
            await page.evaluate(() => {
                const selectors = ['.vjs-big-play-button', '#play', 'video', '.play_button', '.vjs-tech'];
                selectors.forEach(s => {
                    const el = document.querySelector(s);
                    if (el) el.click();
                });
            }).catch(() => {});

            // Railway ke liye delay thoda zyada (1 second)
            await new Promise(r => setTimeout(r, 1000));
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
            res.json({ success: false, message: "Link nahi mila (Timeout)." });
        }

    } catch (e) {
        console.error("Error:", e.message);
        res.status(500).json({ success: false, error: e.message });
    } finally {
        if (page) await page.close();
    }
});

// Port 0.0.0.0 bind karna Railway ke liye compulsory hai
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server Ready on http://0.0.0.0:${PORT}`));