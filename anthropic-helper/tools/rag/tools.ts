import { Readability } from "npm:@mozilla/readability@0.5.0";
import { JSDOM } from "npm:jsdom@16.4.0";
import { google } from "npm:googleapis@61.0.0";

function extractMainContent(html: string) {
  const doc = new JSDOM(html).window.document;
  const reader = new Readability(doc);
  const article = reader.parse();
  return article?.content;
}

async function searchGoogle(query: string) {
  const res = await google.customsearch('v1').cse.list({
    key: Deno.env.get('GOOGLE_API_KEY')!,
    cx: Deno.env.get('GOOGLE_CSE_ID')!,
    q: query
  });
  const items = res.data.items?.slice(0, 5).map((item) => {
    return {
      title: item.title,
      link: item.link,
      snippet: item.snippet,
      kind: item.kind,
      labels: item.labels
    }
  });
  return JSON.stringify(items, null, 2);
}

// Ask the user a question
export async function ask_to_user(input: {
  // The question to ask
  question: string
}) {
  return prompt(input.question);
}

// Seach google for the query
export async function search_google(input: {
  // The query to search for
  query: string
}) {
  const result = await searchGoogle(input.query);
  return JSON.stringify(result, null, 2)
}

// Open the URL and extract the main content
export async function open_url(input: {
  // The URL to open
  url: string
}) {
  const res = await fetch(input.url).then((res) => res.text());
  const main = extractMainContent(res) || res;
  return main;
}
