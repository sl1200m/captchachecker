const fastify = require('fastify')({ logger: true });
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const os = require('os');

// Use Stealth to avoid being blocked by Cloudflare/Google
puppeteer.use(StealthPlugin());

// Configuration based on OS
const getChromiumPath = () => {
    const platform = os.platform();
    if (platform === 'win32') {
        // Windows - use Chrome channel
        return null;
    } else if (platform === 'darwin') {
        // macOS
        return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    } else {
        // Linux/Termux
        return '/data/data/com.termux/files/usr/bin/chromium';
    }
};

const CHROMIUM_PATH = getChromiumPath();

const checkDomain = async (targetUrl, proxy = null) => {
    const launchConfig = {
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            proxy ? `--proxy-server=${proxy}` : ''
        ].filter(Boolean)
    };

    // Configure based on OS
    if (CHROMIUM_PATH) {
        launchConfig.executablePath = CHROMIUM_PATH;
    } else if (os.platform() === 'win32') {
        // Windows - use Chrome channel
        launchConfig.channel = 'chrome';
    }

    const browser = await puppeteer.launch(launchConfig);

    const page = await browser.newPage();
    
    try {
        // Set a realistic User Agent to further avoid detection
        await page.setUserAgent('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36');

        // Visit site with a 20-second timeout
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 20000 });

        // Detection Logic
        const status = await page.evaluate(() => {
            return {
                google_recaptcha: !!document.querySelector('iframe[src*="google.com/recaptcha"]') || !!document.querySelector('.g-recaptcha'),
                cloudflare_turnstile: !!document.querySelector('iframe[src*="challenges.cloudflare.com"]') || !!document.querySelector('.cf-turnstile'),
                cloudflare_waf: document.title.includes("Just a moment...") || !!document.getElementById('cf-content'),
                timestamp: new Date().toISOString()
            };
        });

        await browser.close();
        return { url: targetUrl, ...status };
    } catch (err) {
        await browser.close();
        return { url: targetUrl, error: err.message };
    }
};

// API Endpoint: /check?url=https://example.com&proxy=http://user:pass@host:port
fastify.get('/check', async (request, reply) => {
    const { url, proxy } = request.query;
    if (!url) return reply.code(400).send({ error: "URL parameter is required" });

    const result = await checkDomain(url, proxy);
    return result;
});

// Start the server
fastify.listen({ port: 3000, host: '0.0.0.0' }, (err) => {
    if (err) {
        fastify.log.error(err);
        process.exit(1);
    }
    console.log('API running at http://localhost:3000/check');
});