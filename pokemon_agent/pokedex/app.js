"use strict";

const POKEMON_ENDPOINT = "https://pokeapi.co/api/v2/pokemon?limit=100000&offset=0";
const SPRITE_ROOT = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/";
const FALLBACK_SPRITE_ROOT = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/";
const PAGE_SIZE = 48;
const GENERATION_RANGES = {
  1: [1, 151],
  2: [152, 251],
  3: [252, 386],
  4: [387, 493],
  5: [494, 649],
  6: [650, 721],
  7: [722, 809],
  8: [810, 905],
  9: [906, 1025],
};
const TYPE_COLORS = {
  bug: "#91a949", dark: "#66544b", dragon: "#7165b4", electric: "#d2a932",
  fairy: "#c77b9a", fighting: "#bb604f", fire: "#df7555", flying: "#809ac0",
  ghost: "#78689b", grass: "#70a166", ground: "#b38b58", ice: "#69a9a5",
  normal: "#999781", poison: "#9565a3", psychic: "#d06d85", rock: "#a89257",
  steel: "#7c8d9e", water: "#618db7",
};
const elements = {
  grid: document.querySelector("#pokemon-grid"),
  status: document.querySelector("#status-panel"),
  empty: document.querySelector("#empty-state"),
  search: document.querySelector("#search-input"),
  generation: document.querySelector("#generation-select"),
  sort: document.querySelector("#sort-select"),
  favoritesToggle: document.querySelector("#favorites-toggle"),
  loadMore: document.querySelector("#load-more"),
  dialog: document.querySelector("#pokemon-dialog"),
  dialogContent: document.querySelector("#dialog-content"),
};

let pokemon = [];
let visiblePokemon = [];
let displayedCount = PAGE_SIZE;
let showFavorites = false;
let favorites = readFavorites();
let requestVersion = 0;
let detailRequestVersion = 0;
const detailCache = new Map();

function readFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem("pokedex-favorites") || "[]");
    return new Set(Array.isArray(saved) ? saved.filter(Number.isInteger) : []);
  } catch (error) {
    console.error("Could not restore saved Pokémon favorites.", error);
    return new Set();
  }
}

function saveFavorites() {
  try {
    localStorage.setItem("pokedex-favorites", JSON.stringify([...favorites]));
  } catch (error) {
    console.error("Could not save Pokémon favorites.", error);
    setStatus("Favorites could not be saved in this browser. Your current list will remain until you leave this page.");
  }
}

function pokemonId(url) {
  const match = url.match(/\/pokemon\/(\d+)\/?$/);
  return match ? Number(match[1]) : 0;
}

function formatId(id) {
  return `#${String(id).padStart(4, "0")}`;
}

function spriteUrl(id) {
  return `${SPRITE_ROOT}${id}.png`;
}

function setStatus(message, retry = false) {
  elements.status.replaceChildren();
  const messageNode = document.createElement("span");
  messageNode.textContent = message;
  elements.status.append(messageNode);
  if (retry) {
    const button = document.createElement("button");
    button.className = "retry-button";
    button.type = "button";
    button.textContent = "TRY AGAIN";
    button.addEventListener("click", loadPokemon);
    elements.status.append(button);
  }
  elements.status.hidden = false;
}

function updateCounts() {
  document.querySelector("#total-count").textContent = pokemon.length
    ? pokemon.length.toLocaleString()
    : "—";
  document.querySelector("#visible-count").textContent = visiblePokemon.length.toLocaleString();
  document.querySelector("#favorite-count").textContent = favorites.size.toLocaleString();
  document.querySelector("#favorites-button-count").textContent = favorites.size.toLocaleString();
}

async function loadPokemon() {
  const version = ++requestVersion;
  elements.grid.replaceChildren();
  elements.empty.hidden = true;
  elements.loadMore.hidden = true;
  setStatus("Finding Pokémon…");
  document.querySelector("#results-label").textContent = "Connecting to the Pokédex…";

  try {
    const response = await fetch(POKEMON_ENDPOINT);
    if (!response.ok) {
      throw new Error(`PokéAPI returned HTTP ${response.status}.`);
    }
    const data = await response.json();
    if (!Array.isArray(data.results) || !data.results.length) {
      throw new Error("PokéAPI returned an empty Pokémon catalogue.");
    }
    if (version !== requestVersion) return;

    pokemon = data.results.map(({ name, url }) => ({ name, id: pokemonId(url) }))
      .filter((entry) => entry.id > 0)
      .sort((a, b) => a.id - b.id);
    if (!pokemon.length) {
      throw new Error("PokéAPI's catalogue did not contain any valid Pokémon entries.");
    }
    document.querySelector("#total-count").textContent = Number(data.count || pokemon.length).toLocaleString();
    applyFilters();
  } catch (error) {
    if (version !== requestVersion) return;
    console.error("Pokémon catalogue could not be loaded.", error);
    setStatus("Could not connect to PokéAPI. Check your connection and try again.", true);
    document.querySelector("#results-label").textContent = "Pokédex unavailable";
  }
}

function applyFilters() {
  const query = elements.search.value.trim().toLowerCase().replace(/^#/, "");
  const generation = elements.generation.value;
  const range = GENERATION_RANGES[generation];

  visiblePokemon = pokemon.filter((entry) => {
    const matchesQuery = !query
      || entry.name.includes(query)
      || String(entry.id).includes(query);
    const matchesGeneration = !range || (entry.id >= range[0] && entry.id <= range[1]);
    const matchesFavorites = !showFavorites || favorites.has(entry.id);
    return matchesQuery && matchesGeneration && matchesFavorites;
  });

  if (elements.sort.value === "name") {
    visiblePokemon.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    visiblePokemon.sort((a, b) => a.id - b.id);
  }

  displayedCount = PAGE_SIZE;
  renderPokemon();
}

function createCard(entry) {
  const card = document.createElement("article");
  card.className = "pokemon-card";
  card.style.setProperty("--type-color", TYPE_COLORS[entry.types?.[0]] || "#9b9b84");
  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "pokemon-card-open";
  openButton.setAttribute("aria-label", `${entry.name}, ${formatId(entry.id)}. View details.`);

  const art = document.createElement("span");
  art.className = "card-art";
  const idLabel = document.createElement("span");
  idLabel.className = "pokemon-id";
  idLabel.textContent = formatId(entry.id);

  const image = document.createElement("img");
  image.src = spriteUrl(entry.id);
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener("error", () => {
    if (image.dataset.fallback) {
      image.hidden = true;
      return;
    }
    image.dataset.fallback = "true";
    image.src = `${FALLBACK_SPRITE_ROOT}${entry.id}.png`;
  });

  const favorite = document.createElement("button");
  favorite.type = "button";
  favorite.className = `favorite-button${favorites.has(entry.id) ? " is-favorite" : ""}`;
  favorite.setAttribute("aria-label", favorites.has(entry.id)
    ? `Remove ${entry.name} from favorites`
    : `Add ${entry.name} to favorites`);
  favorite.setAttribute("aria-pressed", String(favorites.has(entry.id)));
  favorite.textContent = favorites.has(entry.id) ? "♥" : "♡";
  favorite.addEventListener("click", () => toggleFavorite(entry.id));
  art.append(idLabel, image);

  const copy = document.createElement("span");
  copy.className = "card-copy";
  const name = document.createElement("h3");
  name.textContent = entry.name;
  const typeList = document.createElement("span");
  typeList.className = "type-list";
  if (entry.types) {
    for (const type of entry.types) typeList.append(createTypeChip(type));
  }
  copy.append(name, typeList);
  openButton.append(art, copy);
  card.append(openButton, favorite);

  openButton.addEventListener("click", () => openDetails(entry));
  return card;
}

function createTypeChip(type) {
  const chip = document.createElement("span");
  chip.className = "type-chip";
  chip.dataset.type = type;
  chip.textContent = type;
  return chip;
}

function renderPokemon() {
  const page = visiblePokemon.slice(0, displayedCount);
  elements.grid.replaceChildren(...page.map(createCard));
  elements.status.hidden = true;
  elements.empty.hidden = visiblePokemon.length > 0;
  elements.loadMore.hidden = visiblePokemon.length <= displayedCount;
  document.querySelector("#results-label").textContent =
    `${visiblePokemon.length.toLocaleString()} Pokémon${showFavorites ? " in your favorites" : ""}`;
  updateCounts();
}

function toggleFavorite(id) {
  if (favorites.has(id)) favorites.delete(id);
  else favorites.add(id);
  saveFavorites();
  updateCounts();
  if (showFavorites && !favorites.has(id)) {
    applyFilters();
  } else {
    renderPokemon();
  }
}

async function fetchDetails(id) {
  if (detailCache.has(id)) return detailCache.get(id);
  const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
  if (!response.ok) throw new Error(`PokéAPI returned HTTP ${response.status} for Pokémon ${id}.`);
  const data = await response.json();
  const speciesResponse = await fetch(data.species.url);
  if (!speciesResponse.ok) {
    throw new Error(`PokéAPI returned HTTP ${speciesResponse.status} for Pokémon species ${id}.`);
  }
  const species = await speciesResponse.json();
  const description = species.flavor_text_entries
    .find((entry) => entry.language.name === "en")
    ?.flavor_text.replace(/[\n\f\r]+/g, " ") || "No English Pokédex entry is available.";
  const details = {
    types: data.types.map(({ type }) => type.name),
    height: data.height / 10,
    weight: data.weight / 10,
    abilities: data.abilities.map(({ ability }) => ability.name.replaceAll("-", " ")),
    stats: data.stats.map(({ base_stat, stat }) => ({ name: stat.name.replaceAll("-", " "), value: base_stat })),
    color: TYPE_COLORS[data.types[0]?.type.name] || "#9b9b84",
    description,
  };
  detailCache.set(id, details);
  const entry = pokemon.find((item) => item.id === id);
  if (entry) entry.types = details.types;
  return details;
}

async function openDetails(entry) {
  const version = ++detailRequestVersion;
  elements.dialogContent.innerHTML = '<div class="detail-loading"><span class="loader" aria-hidden="true"></span><span>Looking up the field notes…</span></div>';
  elements.dialog.showModal();
  try {
    const details = await fetchDetails(entry.id);
    if (!elements.dialog.open || version !== detailRequestVersion) return;
    elements.dialog.style.setProperty("--type-color", details.color);
    elements.dialogContent.replaceChildren(createDetail(entry, details));
    renderPokemon();
  } catch (error) {
    console.error(`Could not load details for ${entry.name}.`, error);
    if (!elements.dialog.open || version !== detailRequestVersion) return;
    elements.dialogContent.textContent = `Could not load details for ${entry.name}. Check your connection and try again.`;
  }
}

function createDetail(entry, details) {
  const fragment = document.createDocumentFragment();
  const header = document.createElement("section");
  header.className = "detail-header";
  const art = document.createElement("div");
  art.className = "detail-art";
  const image = document.createElement("img");
  image.src = spriteUrl(entry.id);
  image.alt = entry.name;
  image.addEventListener("error", () => {
    image.src = `${FALLBACK_SPRITE_ROOT}${entry.id}.png`;
  }, { once: true });
  art.append(image);

  const name = document.createElement("div");
  name.className = "detail-name";
  const number = document.createElement("span");
  number.className = "detail-number";
  number.textContent = formatId(entry.id);
  const heading = document.createElement("h2");
  heading.id = "dialog-name";
  heading.textContent = entry.name;
  const types = document.createElement("div");
  types.className = "type-list";
  details.types.forEach((type) => types.append(createTypeChip(type)));
  name.append(number, heading, types);
  header.append(art, name);

  const body = document.createElement("div");
  body.className = "detail-body";
  const description = document.createElement("p");
  description.className = "detail-description";
  description.textContent = details.description;

  const meta = document.createElement("div");
  meta.className = "detail-meta";
  for (const [label, value] of [["Height", `${details.height} m`], ["Weight", `${details.weight} kg`]]) {
    const item = document.createElement("div");
    const itemLabel = document.createElement("span");
    itemLabel.textContent = label;
    const itemValue = document.createElement("strong");
    itemValue.textContent = value;
    item.append(itemLabel, itemValue);
    meta.append(item);
  }

  const abilityHeading = document.createElement("span");
  abilityHeading.className = "stats-heading";
  abilityHeading.textContent = "Abilities";
  const abilities = document.createElement("div");
  abilities.className = "abilities";
  details.abilities.forEach((ability) => abilities.append(createTypeChip(ability)));

  const statsHeading = document.createElement("span");
  statsHeading.className = "stats-heading";
  statsHeading.textContent = "Base stats";
  const stats = document.createElement("div");
  for (const stat of details.stats) {
    const row = document.createElement("div");
    row.className = "stat-row";
    const label = document.createElement("span");
    label.textContent = stat.name;
    const track = document.createElement("span");
    track.className = "stat-track";
    const fill = document.createElement("span");
    fill.className = "stat-fill";
    fill.style.width = `${Math.min(stat.value / 255 * 100, 100)}%`;
    track.append(fill);
    const value = document.createElement("span");
    value.textContent = String(stat.value);
    row.append(label, track, value);
    stats.append(row);
  }
  body.append(description, meta, abilityHeading, abilities, statsHeading, stats);
  fragment.append(header, body);
  return fragment;
}

elements.search.addEventListener("input", applyFilters);
elements.generation.addEventListener("change", applyFilters);
elements.sort.addEventListener("change", applyFilters);
elements.favoritesToggle.addEventListener("click", () => {
  showFavorites = !showFavorites;
  elements.favoritesToggle.setAttribute("aria-pressed", String(showFavorites));
  applyFilters();
});
elements.loadMore.addEventListener("click", () => {
  displayedCount += PAGE_SIZE;
  renderPokemon();
});
document.querySelector("#dialog-close").addEventListener("click", () => {
  detailRequestVersion += 1;
  elements.dialog.close();
});
elements.dialog.addEventListener("click", (event) => {
  if (event.target === elements.dialog) {
    detailRequestVersion += 1;
    elements.dialog.close();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    elements.search.focus();
  }
});

loadPokemon();
