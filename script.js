const REST_COUNTRIES_API_KEY = "rc_live_5a955311d06b4c088841d2e6bb9d5c64";
const REST_COUNTRIES_BASE_URL = "https://api.restcountries.com/countries/v5";
const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const OPEN_METEO_GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";

const RESPONSE_FIELDS = [
  "names.common",
  "names.official",
  "capitals",
  "region",
  "subregion",
  "population",
  "area.kilometers",
  "flag.emoji",
  "flag.url_svg",
  "flag.url_png",
  "flag.description",
  "languages",
  "currencies",
  "timezones",
].join(",");

// Open-Meteo "weathercode" -> human readable description + emoji
const WEATHER_CODES = {
  0: ["Clear sky", "☀️"],
  1: ["Mainly clear", "🌤️"],
  2: ["Partly cloudy", "⛅"],
  3: ["Overcast", "☁️"],
  45: ["Fog", "🌫️"],
  48: ["Depositing rime fog", "🌫️"],
  51: ["Light drizzle", "🌦️"],
  53: ["Moderate drizzle", "🌦️"],
  55: ["Dense drizzle", "🌧️"],
  56: ["Light freezing drizzle", "🌧️"],
  57: ["Dense freezing drizzle", "🌧️"],
  61: ["Slight rain", "🌧️"],
  63: ["Moderate rain", "🌧️"],
  65: ["Heavy rain", "🌧️"],
  66: ["Light freezing rain", "🌧️"],
  67: ["Heavy freezing rain", "🌧️"],
  71: ["Slight snow fall", "🌨️"],
  73: ["Moderate snow fall", "🌨️"],
  75: ["Heavy snow fall", "❄️"],
  77: ["Snow grains", "❄️"],
  80: ["Slight rain showers", "🌦️"],
  81: ["Moderate rain showers", "🌧️"],
  82: ["Violent rain showers", "⛈️"],
  85: ["Slight snow showers", "🌨️"],
  86: ["Heavy snow showers", "❄️"],
  95: ["Thunderstorm", "⛈️"],
  96: ["Thunderstorm, slight hail", "⛈️"],
  99: ["Thunderstorm, heavy hail", "⛈️"],
};

function describeWeatherCode(code) {
  return WEATHER_CODES[code] || [`Unknown (code ${code})`, "❓"];
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function formatNumber(num) {
  if (num === undefined || num === null) return "N/A";
  return num.toLocaleString("en-US");
}

function getStatusEl() {
  return document.getElementById("status");
}

function setStatus(message, isError = false) {
  const el = getStatusEl();
  el.textContent = message;
  el.className = isError ? "status-message status-error" : "status-message";
}

function clearStatus() {
  const el = getStatusEl();
  el.textContent = "";
  el.className = "";
}

// --------------------------------------------------------------------------
// Main search entry point
// --------------------------------------------------------------------------

async function getCountry() {
  const input = document.getElementById("countryInput");
  const query = input.value.trim();
  const resultsEl = document.getElementById("results");

  resultsEl.innerHTML = "";

  if (!query) {
    setStatus("Please enter a country name to search.", true);
    return;
  }

  setStatus(`Searching for "${query}"...`);

  const apiKey =
    REST_COUNTRIES_API_KEY && REST_COUNTRIES_API_KEY !== "rc_live_5a955311d06b4c088841d2e6bb9d5c64"
      ? REST_COUNTRIES_API_KEY
      : "rc_live_demo";

  const url = `${REST_COUNTRIES_BASE_URL}/name?q=${encodeURIComponent(
    query
  )}&response_fields=${encodeURIComponent(RESPONSE_FIELDS)}&limit=10`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      let serverMessage = "";
      try {
        const body = await response.json();
        if (body?.errors?.[0]?.message) serverMessage = body.errors[0].message;
      } catch (_) {
        /* body wasn't JSON or was empty; fall back to generic messages below */
      }

      if (response.status === 401) {
        setStatus(
          serverMessage ||
            "REST Countries rejected the API key (missing, invalid, or expired). Set REST_COUNTRIES_API_KEY in script.js to a key from your restcountries.com dashboard.",
          true
        );
      } else if (response.status === 403) {
        setStatus(
          serverMessage ||
            "Request blocked (403). This can mean the monthly request limit was hit, or the field requested needs a paid plan.",
          true
        );
      } else if (response.status === 404) {
        setStatus(`No country found matching "${query}". Try a different name.`, true);
      } else if (response.status === 429) {
        setStatus("Too many requests right now. Please wait a moment and try again.", true);
      } else {
        setStatus(serverMessage || `Something went wrong (status ${response.status}). Please try again.`, true);
      }
      return;
    }

    const payload = await response.json();
    const countries = payload?.data?.objects || [];

    if (!countries.length) {
      setStatus(`No country found matching "${query}". Try a different name.`, true);
      return;
    }

    clearStatus();
    renderCountries(countries);
  } catch (error) {
    console.error(error);
    setStatus(
      "Could not reach the country data service. This is usually either a CORS block (add this site's origin to your API key's allowed origins on restcountries.com) or a network issue — check your connection and try again.",
      true
    );
  }
}

// Allow pressing "Enter" inside the input field to trigger a search
document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("countryInput");
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        getCountry();
      }
    });
  }
});

// --------------------------------------------------------------------------
// Rendering: country cards
// --------------------------------------------------------------------------

function renderCountries(countries) {
  const resultsEl = document.getElementById("results");
  resultsEl.innerHTML = "";

  countries.forEach((country, index) => {
    const card = buildCountryCard(country, index);
    resultsEl.appendChild(card);
  });
}

// Find the primary capital object from the v5 `capitals[]` array,
// falling back to the first entry if none is flagged primary.
function getPrimaryCapital(country) {
  const capitals = country.capitals;
  if (!Array.isArray(capitals) || !capitals.length) return null;
  return capitals.find((c) => c?.attributes?.primary) || capitals[0];
}

// Language / currency sub-objects can come back in slightly different
// shapes depending on plan/version, so extract defensively.
function extractLanguageNames(languages) {
  if (!languages) return "N/A";
  const values = Array.isArray(languages) ? languages : Object.values(languages);
  const names = values
    .map((lang) => (typeof lang === "string" ? lang : lang?.name?.common || lang?.name || lang?.common))
    .filter(Boolean);
  return names.length ? names.join(", ") : "N/A";
}

function extractCurrencyNames(currencies) {
  if (!currencies) return "N/A";
  const values = Array.isArray(currencies) ? currencies : Object.values(currencies);
  const names = values
    .map((cur) => {
      if (typeof cur === "string") return cur;
      const name = cur?.name?.common || cur?.name;
      const symbol = cur?.symbol;
      return name ? `${name}${symbol ? ` (${symbol})` : ""}` : null;
    })
    .filter(Boolean);
  return names.length ? names.join(", ") : "N/A";
}

function buildCountryCard(country, index) {
  const cardId = `country-${index}`;
  const commonName = country.names?.common || "Unknown";
  const officialName = country.names?.official || "";
  const primaryCapital = getPrimaryCapital(country);
  const capital = primaryCapital?.name || "N/A";
  const region = country.region || "N/A";
  const subregion = country.subregion || "N/A";
  const population = formatNumber(country.population);
  const area = country.area?.kilometers ? `${formatNumber(country.area.kilometers)} km²` : "N/A";
  const flagUrl = country.flag?.url_svg || country.flag?.url_png || "";
  const flagAlt = country.flag?.description || `Flag of ${commonName}`;

  const languages = extractLanguageNames(country.languages);
  const currencies = extractCurrencyNames(country.currencies);
  const timezones = country.timezones ? country.timezones.join(", ") : "N/A";

  const card = document.createElement("div");
  card.className = "country-card";
  card.id = cardId;

  card.innerHTML = `
    <div class="country-card-header">
      ${flagUrl ? `<img class="country-flag" src="${flagUrl}" alt="${flagAlt}">` : ""}
      <div>
        <h2 class="country-name">${commonName}</h2>
        <p class="country-official-name">${officialName}</p>
      </div>
    </div>

    <div class="country-data-grid">
      <div class="country-data-item">
        <span class="data-label">Capital</span>
        <span class="data-value">${capital}</span>
      </div>
      <div class="country-data-item">
        <span class="data-label">Region</span>
        <span class="data-value">${region}</span>
      </div>
      <div class="country-data-item">
        <span class="data-label">Subregion</span>
        <span class="data-value">${subregion}</span>
      </div>
      <div class="country-data-item">
        <span class="data-label">Population</span>
        <span class="data-value">${population}</span>
      </div>
      <div class="country-data-item">
        <span class="data-label">Area</span>
        <span class="data-value">${area}</span>
      </div>
      <div class="country-data-item">
        <span class="data-label">Languages</span>
        <span class="data-value">${languages}</span>
      </div>
      <div class="country-data-item">
        <span class="data-label">Currencies</span>
        <span class="data-value">${currencies}</span>
      </div>
      <div class="country-data-item">
        <span class="data-label">Timezones</span>
        <span class="data-value">${timezones}</span>
      </div>
    </div>

    <div class="weather-section">
      <button class="weather-toggle-btn" type="button">More Details (Weather)</button>
      <div class="weather-details" hidden></div>
    </div>
  `;

  const toggleBtn = card.querySelector(".weather-toggle-btn");
  const weatherDetails = card.querySelector(".weather-details");

  toggleBtn.addEventListener("click", () =>
    handleWeatherToggle(toggleBtn, weatherDetails, country, commonName)
  );

  return card;
}

// --------------------------------------------------------------------------
// Weather: toggle + fetch + render
// --------------------------------------------------------------------------

async function handleWeatherToggle(button, container, country, commonName) {
  // If already loaded, just toggle visibility
  if (container.dataset.loaded === "true") {
    const isHidden = container.hasAttribute("hidden");
    if (isHidden) {
      container.removeAttribute("hidden");
      button.textContent = "Hide Details";
    } else {
      container.setAttribute("hidden", "");
      button.textContent = "More Details (Weather)";
    }
    return;
  }

  // First click: fetch weather data
  button.disabled = true;
  button.textContent = "Loading...";
  container.removeAttribute("hidden");
  container.innerHTML = `<p class="weather-loading">Fetching live weather for ${getPrimaryCapital(country)?.name || commonName}...</p>`;

  try {
    const coords = await getCapitalCoordinates(country);

    if (!coords) {
      container.innerHTML = `<p class="weather-error">Weather data unavailable — could not determine capital coordinates.</p>`;
      button.disabled = false;
      button.textContent = "More Details (Weather)";
      container.dataset.loaded = "false";
      return;
    }

    const weather = await fetchWeather(coords.latitude, coords.longitude);
    container.innerHTML = buildWeatherHTML(weather, getPrimaryCapital(country)?.name || commonName);
    container.dataset.loaded = "true";
    button.disabled = false;
    button.textContent = "Hide Details";
  } catch (error) {
    console.error(error);
    container.innerHTML = `<p class="weather-error">Could not load weather data. Please try again.</p>`;
    button.disabled = false;
    button.textContent = "More Details (Weather)";
    container.dataset.loaded = "false";
  }
}

async function getCapitalCoordinates(country) {
  // Prefer coordinates already provided by REST Countries
  const primaryCapital = getPrimaryCapital(country);
  const coords = primaryCapital?.coordinates;
  if (coords && typeof coords.lat === "number" && typeof coords.lng === "number") {
    return { latitude: coords.lat, longitude: coords.lng };
  }

  // Fallback: geocode the capital name via Open-Meteo's geocoding API
  const capitalName = primaryCapital?.name;
  if (!capitalName) return null;

  const response = await fetch(
    `${OPEN_METEO_GEOCODE_URL}?name=${encodeURIComponent(capitalName)}&count=1`
  );
  if (!response.ok) return null;

  const data = await response.json();
  const result = data.results?.[0];
  if (!result) return null;

  return { latitude: result.latitude, longitude: result.longitude };
}

async function fetchWeather(latitude, longitude) {
  const params = new URLSearchParams({
    latitude,
    longitude,
    current_weather: "true",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max",
    timezone: "auto",
    forecast_days: "5",
  });

  const response = await fetch(`${OPEN_METEO_FORECAST_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Open-Meteo request failed with status ${response.status}`);
  }
  return response.json();
}

function buildWeatherHTML(weather, capitalName) {
  const current = weather.current_weather;
  const daily = weather.daily;

  if (!current) {
    return `<p class="weather-error">No current weather data available for ${capitalName}.</p>`;
  }

  const [description, emoji] = describeWeatherCode(current.weathercode);

  let html = `
    <div class="weather-current">
      <h3>Current Weather in ${capitalName}</h3>
      <div class="weather-current-main">
        <span class="weather-emoji">${emoji}</span>
        <span class="weather-temp">${current.temperature}°C</span>
      </div>
      <p class="weather-description">${description}</p>
      <div class="weather-data-grid">
        <div class="weather-data-item">
          <span class="data-label">Wind Speed</span>
          <span class="data-value">${current.windspeed} km/h</span>
        </div>
        <div class="weather-data-item">
          <span class="data-label">Wind Direction</span>
          <span class="data-value">${current.winddirection}°</span>
        </div>
        <div class="weather-data-item">
          <span class="data-label">Observed At</span>
          <span class="data-value">${current.time.replace("T", " ")}</span>
        </div>
      </div>
    </div>
  `;

  if (daily && daily.time && daily.time.length) {
    html += `<h4 class="forecast-heading">5-Day Forecast</h4><div class="forecast-grid">`;
    daily.time.forEach((date, i) => {
      html += `
        <div class="forecast-day">
          <span class="forecast-date">${formatForecastDate(date)}</span>
          <span class="forecast-temp">${daily.temperature_2m_max[i]}° / ${daily.temperature_2m_min[i]}°</span>
          <span class="forecast-precip">💧 ${daily.precipitation_sum[i]} mm</span>
          <span class="forecast-wind">💨 ${daily.windspeed_10m_max[i]} km/h</span>
        </div>
      `;
    });
    html += `</div>`;
  }

  return html;
}

function formatForecastDate(dateStr) {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}