require('dotenv').config();
const puppeteer = require('puppeteer');
const { createObjectCsvWriter } = require('csv-writer');

const PROXY_HOST = process.env.PROXY_HOST;
const PROXY_PORT = process.env.PROXY_PORT;
const PROXY_USERNAME = process.env.PROXY_USERNAME;
const PROXY_PASSWORD = process.env.PROXY_PASSWORD;

async function setupBrowser() {
  console.log('Configuring browser...');
  const browser = await puppeteer.launch({
    headless: false, // This will open a visible browser window
  });
  console.log('Browser launched.');

  const page = await browser.newPage();
  console.log('New page created.');

  return { browser, page };
}

// async function setupBrowser() {
//   console.log('Configuring browser with The Social Proxy...');
//   const browser = await puppeteer.launch({
//     args: [
//       `--proxy-server=${PROXY_HOST}:${PROXY_PORT}`,
//     ],
//   });
//   console.log('Browser launched with proxy configuration.');

//   const page = await browser.newPage();
//   console.log('New page created.');

//   await page.authenticate({
//     username: PROXY_USERNAME,
//     password: PROXY_PASSWORD,
//   });
//   console.log('Authenticated with the proxy.');

//   return { browser, page };
// }

async function extractHeadlines(page) {
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
      topStoriesContainer.querySelectorAll('.card').forEach(story => {
        extractHeadlineData(story, 'Top Stories');
      });
    }

    // More top stories
    const moreTopStoriesContainer = document.querySelector('.zone__content[data-zone-label="More Top Stories"]');
    if (moreTopStoriesContainer) {
      moreTopStoriesContainer.querySelectorAll('.card').forEach(story => {
        extractHeadlineData(story, 'More Top Stories');
      });
    }

    // Featured sections
    document.querySelectorAll('.zone__content[data-zone-label]').forEach(section => {
      const sectionName = section.getAttribute('data-zone-label');
      if (sectionName && sectionName !== 'More Top Stories') {
        section.querySelectorAll('.card').forEach(story => {
          extractHeadlineData(story, sectionName);
        });
      }
    });

    return headlines;
  });
}

async function scrapeCNNHomepage() {
  const { browser, page } = await setupBrowser();

  try {
    await page.setDefaultNavigationTimeout(60000); // Increase timeout to 60 seconds
    await page.goto('https://www.cnn.com/', { waitUntil: 'networkidle2', timeout: 60000 });
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