const chromeLauncher = require('chrome-launcher');
const puppeteer = require('puppeteer');
const lighthouse = require('lighthouse');
const config = require('lighthouse/lighthouse-core/config/lr-desktop-config.js');
const reportGenerator = require('lighthouse/lighthouse-core/report/report-generator');
const request = require('request');
const util = require('util');
const fs = require('fs');

(async() => {

    const loginURL = 'https://idp.nature.com/login/natureuser';
    const logoutURL = 'https://idp.nature.com/logout/natureuser?redirect_uri=https%3A%2F%2Fwww.nature.com';

    const opts = {
        //chromeFlags: ['--headless'],
        logLevel: 'info',
        output: 'json',
        disableDeviceEmulation: true,
        defaultViewport: {
            width: 1200,
            height: 900
        },
        chromeFlags: ['--disable-mobile-emulation']
    };

// Launch chrome using chrome-launcher
    const chrome = await chromeLauncher.launch(opts);
    opts.port = chrome.port;

// Connect to it using puppeteer.connect().
    const resp = await util.promisify(request)(`http://localhost:${opts.port}/json/version`);
    const {webSocketDebuggerUrl} = JSON.parse(resp.body);
    const browser = await puppeteer.connect({browserWSEndpoint: webSocketDebuggerUrl});


//Puppeteer
    page = (await browser.pages())[0];
    await page.setViewport({ width: 1200, height: 900});
    await page.goto(loginURL, {waitUntil: 'networkidle2'});
    await page.type('[id="login-username"]', 'usernature@yopmail.com');
    await page.type('[id="login-password"]', 'password1234');
    await page.evaluate(() => {
        document.querySelector('[id="login-submit"]').click();
    });

    await page.waitForNavigation();

    console.log(page.url());

// Run Lighthouse.
    const report = await lighthouse(page.url(), opts, config).then(results => {
        return results;
    });
    const html = reportGenerator.generateReport(report.lhr, 'html');
    const json = reportGenerator.generateReport(report.lhr, 'json');

    // console.log(`Lighthouse score: ${report.lhr.score}`);
    await page.goto(logoutURL, {waitUntil: 'networkidle2'});

    await browser.disconnect();
    await chrome.kill();


    //Write report html to the file
    fs.writeFile('report.html', html, (err) => {
        if (err) {
            console.error(err);
        }
    });

    //Write report json to the file
    fs.writeFile('report.json', json, (err) => {
        if (err) {
            console.error(err);
        }
    });

})();