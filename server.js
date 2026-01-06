const fastify = require('fastify')({ logger: true });
const puppeteer = require('puppeteer');

// Map countries to your proxy provider's strings
const PROXY_MAP = {
    'us': 'http://username-country-us:password@proxy-provider.com:8080',
    'gb': 'http://username-country-gb:password@proxy-provider.com:8080',
    'de': 'http://username-country-de:password@proxy-provider.com:8080'
};

const checkDomain = async (targetUrl, countryCode) => {
    const proxy = PROXY_MAP[countryCode] || null;
    const browser = await puppeteer.launch({
        headless: "new",
        args: proxy ? [`--proxy-server=${proxy}`] : []
    });

    const page = await browser.newPage();
    
    try {
        // 1. Authenticate proxy if needed
        // await page.authenticate({ username: 'user', password: 'pass' });

        // 2. Visit the site
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 20000 });

        // 3. Run detection
        const status = await page.evaluate(() => {
            return {
                google_recaptcha: !!document.querySelector('iframe[src*="google.com/recaptcha"]'),
                cloudflare_turnstile: !!document.querySelector('iframe[src*="challenges.cloudflare.com"]'),
                cloudflare_waf: document.title.includes("Just a moment...")
            };
        });

        await browser.close();
        return status;
    } catch (err) {
        await browser.close();
        return { error: err.message };
    }
};

// API Endpoint: /check?url=https://example.com&country=us
fastify.get('/check', async (request, reply) => {
    const { url, country } = request.query;
    if (!url) return { error: "URL is required" };

    const result = await checkDomain(url, country);
    return result;
});

fastify.listen({ port: 3000 }, (err) => {
    if (err) throw err;
    console.log('Server running at http://localhost:3000');
});