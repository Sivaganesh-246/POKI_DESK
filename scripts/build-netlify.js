"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");
const sourceDirectory = path.join(repositoryRoot, "pokemon_agent", "pokedex");
const outputDirectory = path.join(repositoryRoot, "dist");
const siteFiles = ["index.html", "style.css", "app.js"];

for (const file of siteFiles) {
  const source = path.join(sourceDirectory, file);
  if (!fs.existsSync(source)) {
    throw new Error(`Required Pokédex file is missing: ${source}`);
  }
}

fs.mkdirSync(outputDirectory, { recursive: true });
for (const file of siteFiles) {
  fs.copyFileSync(path.join(sourceDirectory, file), path.join(outputDirectory, file));
}

console.log(`Prepared Netlify static site in ${outputDirectory}`);
