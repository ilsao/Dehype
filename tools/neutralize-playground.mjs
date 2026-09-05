import { createServer } from "node:http";

/* global Buffer, fetch */

const HOST = "127.0.0.1";
const START_PORT = 5179;
const PRODUCT_FIELDS = [
  "name",
  "originPrize",
  "realPrize",
  "discount",
  "image",
  "description",
  "stockAmount",
  "originalPrice",
  "currentPrice",
];

const SYSTEM_PROMPT = [
  "You are Dehype, a local-first shopping assistant.",
  "Neutralize hype and persuasion in product text while preserving factual product information.",
  "Do not make causal claims about manipulation.",
  "Do not mention or infer DOM ids.",
  "Return concise neutral text that a shopper can use to reconsider a purchase calmly.",
].join(" ");

const pageHtml = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Dehype Neutralize Playground</title>
    <style>
      :root {
        color-scheme: light;
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
        color: #1f2933;
        background: #f5f7fa;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
      }

      main {
        width: min(1120px, calc(100% - 32px));
        margin: 0 auto;
        padding: 28px 0 40px;
      }

      h1 {
        margin: 0 0 6px;
        font-size: 28px;
        font-weight: 720;
      }

      p {
        margin: 0;
        color: #52616f;
      }

      form {
        display: grid;
        grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
        gap: 18px;
        margin-top: 24px;
      }

      section,
      .output {
        border: 1px solid #d9e2ec;
        border-radius: 8px;
        background: #ffffff;
        padding: 16px;
      }

      label {
        display: grid;
        gap: 6px;
        margin-top: 14px;
        color: #334e68;
        font-size: 13px;
        font-weight: 650;
      }

      label:first-child {
        margin-top: 0;
      }

      select,
      input,
      textarea {
        width: 100%;
        border: 1px solid #bcccdc;
        border-radius: 6px;
        padding: 10px 11px;
        color: #102a43;
        background: #ffffff;
        font: inherit;
      }

      textarea {
        min-height: 315px;
        resize: vertical;
        line-height: 1.45;
      }

      button {
        width: 100%;
        border: 0;
        border-radius: 6px;
        margin-top: 16px;
        padding: 11px 13px;
        color: #ffffff;
        background: #2563eb;
        font: inherit;
        font-weight: 720;
        cursor: pointer;
      }

      .secondary-button {
        border: 1px solid #bcccdc;
        color: #334e68;
        background: #ffffff;
      }

      button:disabled {
        cursor: wait;
        opacity: 0.65;
      }

      .output {
        margin-top: 18px;
      }

      .output h2 {
        margin: 0 0 10px;
        font-size: 16px;
      }

      pre {
        min-height: 120px;
        overflow: auto;
        margin: 0;
        border-radius: 6px;
        padding: 12px;
        white-space: pre-wrap;
        word-break: break-word;
        background: #f0f4f8;
        color: #102a43;
      }

      .hint {
        margin-top: 8px;
        font-size: 12px;
        line-height: 1.45;
      }

      .hidden {
        display: none;
      }

      @media (max-width: 760px) {
        form {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Dehype Neutralize Playground</h1>
      <p>Temporary local interface for testing value-only ProductInfo neutralization.</p>

      <form id="neutralize-form">
        <section>
          <label>
            Provider
            <select id="provider" name="provider">
              <option value="openai">ChatGPT / OpenAI</option>
              <option value="gemini">Gemini</option>
              <option value="claude">Claude</option>
            </select>
          </label>

          <label id="model-input-label">
            Model name
            <input id="model" name="model" value="gpt-4.1-mini" autocomplete="off">
          </label>

          <label class="hidden" id="gemini-model-label">
            Gemini model
            <select id="gemini-model" name="geminiModel" disabled>
              <option value="">Load Gemini models to choose one</option>
            </select>
          </label>

          <label>
            API key
            <input id="apiKey" name="apiKey" type="password" autocomplete="off" placeholder="Paste key for this test run">
          </label>

          <button class="secondary-button" id="load-models-button" type="button">Load Gemini Models</button>
          <button id="run-button" type="submit">Run Neutralize Test</button>
          <p class="hint">The key is sent only to this local server process for the request. It is not saved by this page.</p>
        </section>

        <section>
          <label>
            ProductInfo values or ProductInfo JSON
            <textarea id="productText" name="productText" spellcheck="false">{
  "name": { "id": "name-dom-node", "value": "HOT SALE Wireless Earbuds!" },
  "originPrize": { "id": "origin-price-dom-node", "value": "$49.99" },
  "realPrize": { "id": "real-price-dom-node", "value": "$12.99 today only" },
  "discount": { "id": "discount-dom-node", "value": "74% OFF limited time" },
  "image": { "id": "image-dom-node", "value": "https://example.invalid/earbuds.png" },
  "description": { "id": "description-dom-node", "value": "Must-have viral earbuds with flash sale bonus" },
  "stockAmount": { "id": "stock-dom-node", "value": "Only 3 left" }
}</textarea>
          </label>
        </section>
      </form>

      <div class="output">
        <h2>Value-only payload sent for neutralization</h2>
        <pre id="payload-output">No request yet.</pre>
      </div>

      <div class="output">
        <h2>Model outcome</h2>
        <pre id="model-output">No outcome yet.</pre>
      </div>
    </main>

    <script>
      const provider = document.querySelector("#provider");
      const model = document.querySelector("#model");
      const modelInputLabel = document.querySelector("#model-input-label");
      const geminiModelLabel = document.querySelector("#gemini-model-label");
      const geminiModel = document.querySelector("#gemini-model");
      const form = document.querySelector("#neutralize-form");
      const button = document.querySelector("#run-button");
      const loadModelsButton = document.querySelector("#load-models-button");
      const apiKey = document.querySelector("#apiKey");
      const payloadOutput = document.querySelector("#payload-output");
      const modelOutput = document.querySelector("#model-output");
      const unavailableGeminiModelMessage = "This Gemini model is not available for generateContent with this key. Click Load Gemini Models and choose one of the returned models.";
      let loadedGeminiModels = [];

      const defaultModels = {
        openai: "gpt-4.1-mini",
        claude: "claude-3-5-haiku-latest",
      };

      function updateModelControl() {
        const isGemini = provider.value === "gemini";
        modelInputLabel.classList.toggle("hidden", isGemini);
        geminiModelLabel.classList.toggle("hidden", !isGemini);
        loadModelsButton.classList.toggle("hidden", !isGemini);

        if (!isGemini) {
          model.value = defaultModels[provider.value];
        }
      }

      function clearGeminiModels() {
        loadedGeminiModels = [];
        geminiModel.replaceChildren(new Option("Load Gemini models to choose one", ""));
        geminiModel.disabled = true;
      }

      provider.addEventListener("change", updateModelControl);
      apiKey.addEventListener("input", clearGeminiModels);
      updateModelControl();

      loadModelsButton.addEventListener("click", async () => {
        loadModelsButton.disabled = true;
        loadModelsButton.textContent = "Loading Gemini models...";
        modelOutput.textContent = "Asking Gemini which models support generateContent...";

        try {
          const response = await fetch("/api/gemini-models", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ apiKey: apiKey.value }),
          });
          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error ?? "Could not load Gemini models.");
          }

          clearGeminiModels();
          loadedGeminiModels = data.models;
          geminiModel.replaceChildren();
          for (const modelName of data.models) {
            geminiModel.append(new Option(modelName, modelName));
          }

          if (data.models.length > 0) {
            provider.value = "gemini";
            geminiModel.value = data.defaultModel;
            geminiModel.disabled = false;
            updateModelControl();
          }

          modelOutput.textContent = data.models.length > 0
            ? "Loaded Gemini models that support generateContent. Choose one from the Gemini model list."
            : "Gemini returned no models that support generateContent for this key.";
        } catch (error) {
          modelOutput.textContent = error instanceof Error ? error.message : String(error);
        } finally {
          loadModelsButton.disabled = false;
          loadModelsButton.textContent = "Load Gemini Models";
        }
      });

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        button.disabled = true;
        button.textContent = "Running...";
        payloadOutput.textContent = "Preparing request...";
        modelOutput.textContent = "Waiting for model...";

        try {
          const selectedModel = provider.value === "gemini"
            ? geminiModel.value
            : model.value;

          if (
            provider.value === "gemini" &&
            !loadedGeminiModels.includes(selectedModel)
          ) {
            throw new Error(unavailableGeminiModelMessage);
          }

          const response = await fetch("/api/neutralize", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              provider: provider.value,
              model: selectedModel,
              apiKey: apiKey.value,
              productText: document.querySelector("#productText").value,
            }),
          });
          const data = await response.json();

          payloadOutput.textContent = JSON.stringify(data.valueOnlyPayload, null, 2);
          modelOutput.textContent = data.output ?? data.error ?? "No output returned.";
        } catch (error) {
          payloadOutput.textContent = "Request failed before a payload was returned.";
          modelOutput.textContent = error instanceof Error ? error.message : String(error);
        } finally {
          button.disabled = false;
          button.textContent = "Run Neutralize Test";
        }
      });
    </script>
  </body>
</html>`;

const server = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/") {
      sendHtml(response, pageHtml);
      return;
    }

    if (request.method === "POST" && request.url === "/api/neutralize") {
      const body = await readJsonBody(request);
      const result = await neutralize(body);
      sendJson(response, result, result.error ? 400 : 200);
      return;
    }

    if (request.method === "POST" && request.url === "/api/gemini-models") {
      const body = await readJsonBody(request);
      const apiKey = assertString(body.apiKey, "Gemini API key");
      const models = await listGeminiGenerateContentModels(apiKey);
      sendJson(response, {
        models,
        defaultModel: chooseDefaultGeminiModel(models),
      });
      return;
    }

    sendText(response, "Not found", 404);
  } catch (error) {
    sendJson(
      response,
      {
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

const port = await listenOnAvailablePort(server, START_PORT);
console.log(`Dehype neutralize playground: http://${HOST}:${port}`);

async function neutralize(body) {
  const provider = assertProvider(body.provider);
  const model = assertString(body.model, "model");
  const apiKey = assertString(body.apiKey, "apiKey");
  const productText = assertString(body.productText, "productText");
  const valueOnlyPayload = toValueOnlyPayload(productText);

  if (provider === "gemini") {
    const availableModels = await listGeminiGenerateContentModels(apiKey);
    const modelPath = normalizeGeminiModelPath(model);

    if (!availableModels.includes(modelPath)) {
      throw new Error(
        "This Gemini model is not available for generateContent with this key. Click Load Gemini Models and choose one of the returned models.",
      );
    }
  }

  const prompt = buildNeutralizePrompt(valueOnlyPayload);
  const output = await callProvider({ provider, model, apiKey, prompt });

  return {
    valueOnlyPayload,
    output,
  };
}

function toValueOnlyPayload(productText) {
  const parsed = parseJsonOrNull(productText);

  if (!parsed) {
    return {
      description: productText.trim(),
    };
  }

  const productInfo = parsed.productInfo ?? parsed;
  const valueOnlyPayload = {};

  for (const field of PRODUCT_FIELDS) {
    const value = productInfo[field];

    if (typeof value === "string") {
      valueOnlyPayload[field] = value;
      continue;
    }

    if (
      typeof value === "object" &&
      value !== null &&
      typeof value.value === "string"
    ) {
      valueOnlyPayload[field] = value.value;
    }
  }

  if (Object.keys(valueOnlyPayload).length === 0) {
    throw new Error("Enter plain text or ProductInfo JSON with value fields.");
  }

  return valueOnlyPayload;
}

function buildNeutralizePrompt(valueOnlyPayload) {
  return [
    "Neutralize the following ProductInfo values.",
    "Remove or soften urgency, scarcity, social pressure, and promotional wording.",
    "Keep factual product details, prices, image URLs, and stock facts when useful.",
    "Return a concise result as readable text.",
    "",
    JSON.stringify(valueOnlyPayload, null, 2),
  ].join("\n");
}

async function callProvider({ provider, model, apiKey, prompt }) {
  if (provider === "openai") {
    return callOpenAi({ model, apiKey, prompt });
  }

  if (provider === "gemini") {
    return callGemini({ model, apiKey, prompt });
  }

  return callClaude({ model, apiKey, prompt });
}

async function callOpenAi({ model, apiKey, prompt }) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    }),
  });
  const data = await readProviderResponse(response);

  return (
    data.output_text ??
    data.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text)
      .filter(Boolean)
      .join("\n") ??
    JSON.stringify(data, null, 2)
  );
}

async function callGemini({ model, apiKey, prompt }) {
  const modelPath = normalizeGeminiModelPath(model);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${encodeURI(
      modelPath,
    )}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
      }),
    },
  );
  const data = await readProviderResponse(response);

  return (
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter(Boolean)
      .join("\n") ?? JSON.stringify(data, null, 2)
  );
}

async function listGeminiGenerateContentModels(apiKey) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${encodeURIComponent(
      apiKey,
    )}`,
  );
  const data = await readProviderResponse(response);

  return (data.models ?? [])
    .filter((model) =>
      model.supportedGenerationMethods?.includes("generateContent"),
    )
    .map((model) => model.name)
    .sort((left, right) => left.localeCompare(right));
}

function normalizeGeminiModelPath(model) {
  return model.startsWith("models/") ? model : `models/${model}`;
}

function chooseDefaultGeminiModel(models) {
  return (
    models.find((model) => model === "models/gemini-3.5-flash-lite") ??
    models.find((model) => model.includes("flash-lite")) ??
    models[0] ??
    ""
  );
}

async function callClaude({ model, apiKey, prompt }) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model,
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await readProviderResponse(response);

  return (
    data.content
      ?.map((content) => content.text)
      .filter(Boolean)
      .join("\n") ?? JSON.stringify(data, null, 2)
  );
}

async function readProviderResponse(response) {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data?.error?.message ??
      data?.error?.details ??
      data?.message ??
      response.statusText;
    throw new Error(`Provider request failed: ${withRetryHint(message)}`);
  }

  return data;
}

function withRetryHint(message) {
  if (/not found|not supported for generateContent/i.test(message)) {
    return `${message} Click "Load Gemini Models" with your Gemini API key, then choose a returned model from the model name field.`;
  }

  if (/high demand|overloaded|try again later/i.test(message)) {
    return `${message} Click "Load Gemini Models" and try another returned Flash or Lite model.`;
  }

  return message;
}

function parseJsonOrNull(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function assertProvider(value) {
  if (value === "openai" || value === "gemini" || value === "claude") {
    return value;
  }

  throw new Error("Choose ChatGPT, Gemini, or Claude.");
}

function assertString(value, fieldName) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  throw new Error(`Enter ${fieldName}.`);
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendHtml(response, html) {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}

function sendJson(response, data, status = 200) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(data));
}

function sendText(response, text, status = 200) {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(text);
}

function listenOnAvailablePort(candidateServer, startPort) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      candidateServer.once("error", (error) => {
        if (error.code === "EADDRINUSE") {
          tryPort(port + 1);
          return;
        }

        reject(error);
      });

      candidateServer.listen(port, HOST, () => resolve(port));
    };

    tryPort(startPort);
  });
}
