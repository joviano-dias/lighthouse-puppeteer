const chromeLauncher = require('chrome-launcher');
const puppeteer = require('puppeteer');
const lighthouse = require('lighthouse');
const config = require('lighthouse/lighthouse-core/config/lr-desktop-config.js');
const reportGenerator = require('lighthouse/lighthouse-core/report/report-generator');
const request = require('request');
const util = require('util');
const fs = require('fs');
const sleep = seconds =>
    new Promise(resolve => setTimeout(resolve, (seconds || 1) * 1000));
let scoresBelowBaseline=false;
let assert = require('assert');

const MY_SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/xx';
let slack = require('slack-notify')(MY_SLACK_WEBHOOK_URL);
const app_name = "Nature";

(async () => {

    const homeURL = 'https://www.nature.com';
    const subjectsURL = 'https://www.nature.com/subjects';

    const opts = {
        //chromeFlags: ['--headless'],
        logLevel: 'info',
        output: 'json',
        disableDeviceEmulation: true,
        defaultViewport: {
            width: 1200,
            height: 900
        },
        chromeFlags: ['--headless','--disable-mobile-emulation','--no-sandbox', '--disable-setuid-sandbox']
    };

    // Launch chrome using chrome-launcher
    const chrome = await chromeLauncher.launch(opts);
    opts.port = chrome.port;

    // Connect to it using puppeteer.connect().
    const resp = await util.promisify(request)(`http://localhost:${opts.port}/json/version`);
    const {webSocketDebuggerUrl} = JSON.parse(resp.body);
    const browser = await puppeteer.connect({browserWSEndpoint: webSocketDebuggerUrl});


    // Visit Nature.com
    page = (await browser.pages())[0];
    await page.setViewport({width: 1200, height: 900});
    await page.goto(homeURL, {waitUntil: 'networkidle2'});
    await runLighthouseForURL(page.url(), opts, "Nature Homepage");


    // Visit a subject
    await page.goto(subjectsURL, {waitUntil: 'networkidle2'});
    await page.evaluate(() => {
        document.querySelector('a[data-track-label=\'Cancer\']').click();
    });
    await page.waitForNavigation();
    await runLighthouseForURL(page.url(), opts, "Nature Subjects Cancer");


    await browser.disconnect();
    await chrome.kill();


    try {
        assert.equal(scoresBelowBaseline, false, 'One of the scores was found below baseline. Failing test');
    } catch (error) {
        console.error('Failing Test: One of the scores was found below baseline. Failing test');
        process.exit(1);
    }

})().catch( e => {
    console.error(e);
    process.exit(1);
});



async function runLighthouseForURL(pageURL, opts, reportName) {

    const reportNameForFile = reportName.replace(/\s/g, '');

    let scores = {Performance: 0, Accessibility: 0, "Best Practices": 0, SEO: 0};
    let slackArray = [];

    const report = await lighthouse(pageURL, opts, config).then(results => {
        return results;
    });
    const html = reportGenerator.generateReport(report.lhr, 'html');
    const json = reportGenerator.generateReport(report.lhr, 'json');
    scores.Performance = JSON.parse(json).categories.performance.score;
    scores.Accessibility = JSON.parse(json).categories.accessibility.score;
    scores["Best Practices"] = JSON.parse(json)["categories"]["best-practices"]["score"];
    scores.SEO = JSON.parse(json).categories.seo.score;


    let baselineScores = {
        "Performance": 0.80,
        "Accessibility": 0.80,
        "Best Practices": 0.80,
        "SEO": 0.80
    };

    fs.writeFile('ReportHTML-' + reportNameForFile + '.html', html, (err) => {
        if (err) {
            console.error(err);
        }
    });

    fs.writeFile('ReportJSON-' + reportNameForFile + '.json', json, (err) => {
        if (err) {
            console.error(err);
        }
    });

    fs.writeFile('ReportScores-' + reportNameForFile + '.txt', JSON.stringify(scores, null, 2), (err) => {
        if (err) {
            console.error(err);
        }
    });

    let BreakException = {};
    let SlackHeadline = "Default Headline";

    try {
        Object.keys(baselineScores).forEach(key => {
            let baselineValue = baselineScores[key];
            console.log(scores);

            if (scores[key] != null && baselineValue > scores[key]) {
                Object.keys(baselineScores).forEach(key => {
                    const scorePercent=scores[key]*100;
                    slackArray.push({title: `${key}`, value: `${scorePercent}%`, short: true});
                });
                console.log(slackArray);
                console.log(`${app_name}: ` + key + " score " + scores[key]*100 + "% for " + reportName + " is less than the defined baseline of " + baselineValue*100 + "%");
                SlackHeadline = `*${app_name}:* _` + key + `_ score for <${pageURL}|` + reportName + "> below " + baselineValue*100 + "%";
                throw BreakException;
            }
        });
    } catch (e) {
        if (e !== BreakException) throw e;
    }

    if (slackArray.length) {
        slack.alert({
            attachments: [
                {
                    pretext: `${SlackHeadline}`,
                    fallback: 'Nothing to show here',
                    color: "#ffdb8e",
                    fields: slackArray,
                    "footer": `Lighthouse Tests | ${reportName}`,
                    "footer_icon": "https://platform.slack-edge.com/img/default_application_icon.png"
                }
            ],
        });
        scoresBelowBaseline = true;
        console.log("Slack alert sent coz scores below baseline");
    }
}