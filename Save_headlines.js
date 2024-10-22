require('dotenv').config();
const puppeteer = require('puppeteer');
const { createObjectCsvWriter } = require('csv-writer');
const fs = require('fs').promises;

const PROXY_HOST = process.env.PROXY_HOST;
const PROXY_PORT = process.env.PROXY_PORT;
const PROXY_USERNAME = process.env.PROXY_USERNAME;
const PROXY_PASSWORD = process.env.PROXY_PASSWORD;

async function setupBrowser() {
  console.log('Configuring browser with The Social Proxy...');
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      '--start-maximized',
      `--proxy-server=${PROXY_HOST}:${PROXY_PORT}`,
    ],
  });
  console.log('Browser launched with proxy configuration.');

  const page = await browser.newPage();
  console.log('New page created.');

  await page.authenticate({
    username: PROXY_USERNAME,
    password: PROXY_PASSWORD,
  });
  console.log('Authenticated with the proxy.');

  return { browser, page };
}

async function extractHeadlines(page) {
  console.log('Extracting headlines...');
  return await page.evaluate(() => {
    const headlines = [];

    const extractHeadlineData = (element, section) => {
      const headline = element.querySelector('.container__headline-text')?.textContent.trim();
      const link = element.querySelector('a.container__link')?.href;
      if (headline && link) {
        headlines.push({ section, headline, link });
      }
    };

    // Top stories
    const topStoriesContainer = document.querySelector('.container_lead-package__cards-wrapper');
    if (topStoriesContainer) {
      console.log('Found top stories container');
      topStoriesContainer.querySelectorAll('.card').forEach(story => {
        extractHeadlineData(story, 'Top Stories');
      });
    } else {
      console.log('Top stories container not found');
    }

    // More top stories
    const moreTopStoriesContainer = document.querySelector('.zone__content[data-zone-label="More Top Stories"]');
    if (moreTopStoriesContainer) {
      console.log('Found more top stories container');
      moreTopStoriesContainer.querySelectorAll('.card').forEach(story => {
        extractHeadlineData(story, 'More Top Stories');
      });
    } else {
      console.log('More top stories container not found');
    }

    // Featured sections
    const featuredSections = document.querySelectorAll('.zone__content[data-zone-label]');
    console.log(`Found ${featuredSections.length} featured sections`);
    featuredSections.forEach(section => {
      const sectionName = section.getAttribute('data-zone-label');
      if (sectionName && sectionName !== 'More Top Stories') {
        section.querySelectorAll('.card').forEach(story => {
          extractHeadlineData(story, sectionName);
        });
      }
    });

    console.log(`Total headlines extracted: ${headlines.length}`);
    return headlines;
  });
}

async function scrapeCNNHomepage(retries = 3) {
  const { browser, page } = await setupBrowser();

  try {
    console.log('Navigating to CNN homepage...');
    await page.setDefaultNavigationTimeout(120000); // Increase timeout to 2 minutes

    for (let i = 0; i < retries; i++) {
      try {
        await page.goto('https://www.cnn.com/', { waitUntil: 'networkidle0', timeout: 120000 });
        console.log('Page loaded.');
        break;
      } catch (error) {
        console.log(`Attempt ${i + 1} failed: ${error.message}`);
        if (i === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retrying
      }
    }

    // Save page content for debugging
    const content = await page.content();
    await fs.writeFile('cnn_page_content.html', content);
    console.log('Page content saved to cnn_page_content.html');

    // Wait for content to load
    await page.waitForSelector('.container_lead-package__cards-wrapper', { timeout: 10000 })
      .catch(() => console.log('Timeout waiting for lead package. Continuing anyway.'));

    const headlines = await extractHeadlines(page);
    console.log(`Scraped ${headlines.length} headlines`);
    return headlines;
  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    await browser.close();
  }
}

async function storeDataInCSV(data, filename) {
  const csvWriter = createObjectCsvWriter({
    path: filename,
    header: [
      { id: 'section', title: 'Section' },
      { id: 'headline', title: 'Headline' },
      { id: 'link', title: 'Link' },
    ]
  });

  try {
    await csvWriter.writeRecords(data);
    console.log(`Data successfully written to ${filename}`);
  } catch (error) {
    console.error(`Error writing to CSV: ${error.message}`);
  }
}

async function main() {
  try {
    const headlines = await scrapeCNNHomepage();
    if (headlines && headlines.length > 0) {
      await storeDataInCSV(headlines, 'cnn_headlines.csv');
    } else {
      console.log('No headlines were scraped. Check the scraping logic or website structure.');
    }
  } catch (error) {
    console.error('An error occurred in the main function:', error);
  }
}

main();