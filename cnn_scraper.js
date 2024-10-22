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
  const currentDate = new Date().toISOString().split('T')[0]; 
  
  return await page.evaluate((currentDate) => {
    const headlines = [];

    const extractHeadlineData = (element, section) => {
      const headline = element.querySelector('.container__headline-text')?.textContent.trim();
      const link = element.querySelector('a.container__link')?.href;
      if (headline && link) {
        headlines.push({ section, headline, link, date: currentDate });
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

    // More Top Stories
    const moreTopStoriesContainer = document.querySelectorAll('.container_lead-plus-headlines__item');
    if (moreTopStoriesContainer.length) {
      console.log(`Found ${moreTopStoriesContainer.length} "More Top Stories" items`);
      moreTopStoriesContainer.forEach(story => {
        extractHeadlineData(story, 'More Top Stories');
      });
    } else {
      console.log('More Top Stories container not found');
    }

    // Global Business section
    const globalBusinessStories = document.querySelectorAll('[data-section="business"]');
    globalBusinessStories.forEach(story => {
      extractHeadlineData(story, 'Global Business');
    });

    // Sport section
    const sportStories = document.querySelectorAll('[data-section="sport"]');
    sportStories.forEach(story => {
      extractHeadlineData(story, 'Sport');
    });

    // Style section
    const styleStories = document.querySelectorAll('[data-section="style"]');
    styleStories.forEach(story => {
      extractHeadlineData(story, 'Style');
    });

    // Travel gallery
    const travelGallery = document.querySelectorAll('[data-section="travel"]');
    travelGallery.forEach(story => {
      extractHeadlineData(story, 'Travel');
    });

    // In Case You Missed It
    const inCaseYouMissedIt = document.querySelector('.zone[data-collapsed-text="In Case You Missed It"]');
    if (inCaseYouMissedIt) {
      inCaseYouMissedIt.querySelectorAll('.card').forEach(story => {
        extractHeadlineData(story, 'In Case You Missed It');
      });
    }

    // Featured sections
    const featuredSectionsTitle = document.querySelector('.zone__title.zone--title');
    if (featuredSectionsTitle && featuredSectionsTitle.textContent.includes('Featured Sections')) {
      console.log('Found "Featured Sections" title');
      const featuredStories = featuredSectionsTitle.closest('.zone__inner').querySelectorAll('.card');
      console.log(`Found ${featuredStories.length} featured stories`);
      featuredStories.forEach(story => {
        extractHeadlineData(story, 'Featured Sections');
      });
    } else {
      console.log('Featured Sections title not found');
    }

    console.log(`Total headlines extracted: ${headlines.length}`);
    return headlines;
  }, currentDate); 
}


async function scrapeCNNHomepage(retries = 3) {
  const { browser, page } = await setupBrowser();

  try {
    console.log('Navigating to CNN homepage...');
    await page.setDefaultNavigationTimeout(120000); 

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
  console.log('Saving data to CSV:', data);  // Add this to debug
  const csvWriter = createObjectCsvWriter({
    path: filename,
    header: [
      { id: 'section', title: 'Section' },
      { id: 'headline', title: 'Headline' },
      { id: 'link', title: 'Link' },
      { id: 'date', title: 'Date' },
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
    console.log('Extracted headlines:', headlines);  // Add this to debug
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